/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The statement import pipeline.
 *
 * Download → extract → convert at the transaction's own FX rate → deduplicate
 * → categorise → detect transfers and recurring costs → validate the
 * statement's own arithmetic → write.
 *
 * A silently wrong import is worse than a flagged one, so anything that does
 * not reconcile is stored as `needs_review` with the discrepancy shown.
 */
import {
  categoriseBatch,
  detectRecurring,
  detectTransfers,
  matchRule,
  type CategoryRef,
  type CategoryRule,
} from "./categorise.server";
import { CATEGORISATION_MODEL } from "./ai/models";
import { parseCamt053 } from "./import/camt053.server";
import { StatementFailure } from "./import/failure";
import { EXACT_BALANCE_FORMATS, formatLabel, type SourceFormat } from "./import/formats";
import { parseMt940 } from "./import/mt940.server";
import { parseQif } from "./import/qif.server";
import { sniffFormat } from "./import/sniff.server";
import {
  applyMapping,
  extractFromPdfText,
  inferColumnMapping,
  type ExtractionResult,
} from "./statement-extract.server";

import {
  SCANNED_PDF_MESSAGE,
  decodeText,
  extractPdfText,
  fingerprintOf,
  looksScanned,
  parseDelimitedRows,
  parseWorkbookRows,
  type RawTransaction,
} from "./statement-parse.server";
import { similarity } from "./text";

type Client = any;

export type ImportResult = {
  status: "parsed" | "needs_review" | "failed";
  inserted: number;
  duplicates: number;
  skippedRows: number;
  discrepancy: number | null;
  message: string;
  notes: string[];
};

const INSERT_BATCH = 400;
const UPDATE_BATCH = 200;

/* --------------------------------------------------------------- FX at date */

type FxSeries = Map<string, Array<{ as_of: number; rate: number }>>;

export type FxLookup = {
  base: string;
  rateAt: (currency: string, date: string) => number | null;
  /** True when at least one conversion had to fall back to a distant rate. */
  usedDistantRate: boolean;
};

export async function loadFxLookup(supabase: Client, base: string): Promise<FxLookup> {
  const { data } = await supabase
    .from("fx_rates")
    .select("quote_ccy, rate, as_of")
    .eq("base_ccy", "GBP")
    .order("as_of", { ascending: true })
    .limit(4000);

  const series: FxSeries = new Map();
  for (const row of (data ?? []) as Array<{ quote_ccy: string; rate: number; as_of: string }>) {
    const list = series.get(row.quote_ccy) ?? [];
    list.push({ as_of: new Date(row.as_of).getTime(), rate: Number(row.rate) });
    series.set(row.quote_ccy, list);
  }

  const state = { usedDistantRate: false };
  const THIRTY_DAYS = 30 * 86_400_000;

  const rateAt = (currency: string, date: string): number | null => {
    if (currency === "GBP") return 1;
    const list = series.get(currency);
    if (!list?.length) return null;
    const target = new Date(date).getTime();
    let best = list[0]!;
    let bestGap = Math.abs(best.as_of - target);
    for (const point of list) {
      const gap = Math.abs(point.as_of - target);
      if (gap < bestGap) {
        best = point;
        bestGap = gap;
      }
    }
    if (bestGap > THIRTY_DAYS) state.usedDistantRate = true;
    return best.rate;
  };

  return {
    base,
    rateAt,
    get usedDistantRate() {
      return state.usedDistantRate;
    },
  };
}

export function convertToBase(
  lookup: FxLookup,
  amount: number,
  currency: string,
  date: string,
): number | null {
  if (currency === lookup.base) return amount;
  const from = lookup.rateAt(currency, date);
  const to = lookup.rateAt(lookup.base, date);
  if (!from || !to) return null;
  return (amount / from) * to;
}

/* ------------------------------------------------------------- duplicates */

type ExistingRow = {
  booked_date: string;
  amount: number;
  direction: string;
  description: string | null;
  import_fingerprint: string | null;
  bank_reference?: string | null;
};

function bucketKey(date: string, amount: number, direction: string) {
  return `${date}|${Math.round(Math.abs(amount) * 100)}|${direction}`;
}

/**
 * A bank reference alone is not safe to deduplicate on: MT940 reuses the same
 * customer reference for every instalment of a standing order. Pinned to the
 * date and the amount it becomes exact, and it catches the case the
 * description-similarity test cannot — the same entry re-exported with
 * different wording.
 */
function referenceKey(
  reference: string | null | undefined,
  date: string,
  amount: number,
): string | null {
  const value = (reference ?? "").trim();
  if (value.length < 4) return null;
  return `${value.toUpperCase()}|${date}|${Math.round(Math.abs(amount) * 100)}`;
}

function baseOf(fingerprint: string | null): string | null {
  if (!fingerprint) return null;
  const hash = fingerprint.lastIndexOf("#");
  return hash > 0 ? fingerprint.slice(0, hash) : fingerprint;
}

/* ------------------------------------------------------------------ import */

async function fail(supabase: Client, statementId: string, message: string): Promise<ImportResult> {
  await supabase
    .from("statements")
    .update({ status: "failed", error_message: message, parsed_at: new Date().toISOString() })
    .eq("id", statementId);
  return {
    status: "failed",
    inserted: 0,
    duplicates: 0,
    skippedRows: 0,
    discrepancy: null,
    message,
    notes: [],
  };
}

export { StatementFailure };

export type LoadedStatementFile = {
  format: SourceFormat;
  bytes: Uint8Array;
  /** Already decoded, for the text formats. */
  text: string | null;
};

export async function downloadStatementFile(
  supabase: Client,
  statement: { file_path: string; file_name?: string | null },
): Promise<LoadedStatementFile> {
  const { data: file, error } = await supabase.storage
    .from("statements")
    .download(statement.file_path);
  if (error || !file) {
    throw new StatementFailure(
      "The uploaded file could not be read back from storage. Upload it again.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffFormat(
    bytes,
    statement.file_name ?? statement.file_path,
    (file as any).type,
  );
  if (!sniffed) {
    throw new StatementFailure(
      "This file does not read as a statement in any format the reader knows. Export CAMT.053, MT940, CSV, Excel, QIF or PDF from your bank — CAMT.053 first if it is offered.",
    );
  }
  return { format: sniffed.format, bytes, text: sniffed.text };
}

/**
 * File bytes → statements.
 *
 * A list, because one CAMT.053 or MT940 file routinely holds several accounts
 * or several periods, and each of those is its own statement with its own
 * account and its own reconciliation.
 *
 * The structured formats are parsed by code alone. Only CSV, Excel and PDF —
 * the formats that do not state their own structure — reach a model.
 */
export async function extractStatementContent(
  file: LoadedStatementFile,
): Promise<ExtractionResult[]> {
  const body = () => file.text ?? decodeText(file.bytes);

  switch (file.format) {
    case "camt053":
      return parseCamt053(body());
    case "mt940":
      return parseMt940(body());
    case "qif":
      return parseQif(body());
    case "pdf": {
      const pdf = await extractPdfText(file.bytes);
      if (looksScanned(pdf)) throw new StatementFailure(SCANNED_PDF_MESSAGE);
      return [tag(await extractFromPdfText(pdf.text), "pdf")];
    }
    default: {
      const rawRows =
        file.format === "csv"
          ? await parseDelimitedRows(body())
          : await parseWorkbookRows(file.bytes);
      const rows = rawRows.filter((row) => row.some((cell) => (cell ?? "").trim().length > 0));
      if (rows.length < 2) {
        throw new StatementFailure(
          "This file has no readable rows. Check you exported the transaction list rather than a summary.",
        );
      }
      const mapping = await inferColumnMapping(rows);
      return [tag(applyMapping(rows, mapping), file.format)];
    }
  }
}

/** The inferred formats state what they are and what they could not promise. */
function tag(result: ExtractionResult, format: SourceFormat): ExtractionResult {
  return {
    ...result,
    format,
    exactBalances: false,
    accountDetectable: Boolean(result.meta.identity?.account_identifier),
  };
}

export async function importStatement(
  supabase: Client,
  statementId: string,
  uploadedBy: string | null,
): Promise<ImportResult> {
  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("*")
    .eq("id", statementId)
    .maybeSingle();

  if (statementError) throw new Error(statementError.message);
  if (!statement) throw new Error("That statement is no longer in the system.");
  if (!statement.account_id) {
    return fail(
      supabase,
      statementId,
      "This statement isn't linked to an account yet. Pick the account it belongs to and import again.",
    );
  }

  await supabase
    .from("statements")
    .update({
      status: "parsing",
      error_message: null,
      uploaded_by: statement.uploaded_by ?? uploadedBy,
    })
    .eq("id", statementId);

  try {
    const file = await downloadStatementFile(supabase, statement);
    const results = await extractStatementContent(file);
    const index = Number(statement.statement_index ?? 0);
    const extraction = results[index] ?? results[0];
    if (!extraction) {
      throw new StatementFailure("Nothing in this file reads as a statement.");
    }
    return await importExtracted(supabase, statement, extraction);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The statement could not be read. Try again.";
    return fail(supabase, statementId, message);
  }
}

/**
 * Everything after extraction: convert, deduplicate, categorise, detect,
 * reconcile, write. Split out so a statement whose account was confirmed later
 * can be imported from its cached extraction without paying to read it twice.
 */
export type ImportableStatement = {
  id: string;
  household_id: string;
  account_id: string | null;
  [key: string]: unknown;
};

export async function importExtracted(
  supabase: Client,
  statement: ImportableStatement,
  extraction: ExtractionResult,
): Promise<ImportResult> {
  const statementId = statement.id;

  try {
    const parsed: RawTransaction[] = extraction.transactions;
    if (!parsed.length) {
      return fail(
        supabase,
        statementId,
        "No transactions could be read from this file. If it is a summary page or a scan, export the full transaction list from your bank instead.",
      );
    }

    const notes = [...extraction.notes];
    const format: SourceFormat = extraction.format ?? "csv";
    const exactFormat = EXACT_BALANCE_FORMATS.has(format);

    /* -------------------------------------------------- context and rates */
    const [{ data: account }, { data: household }, { data: categoryRows }, { data: ruleRows }] =
      await Promise.all([
        supabase.from("accounts").select("*").eq("id", statement.account_id).maybeSingle(),
        supabase
          .from("households")
          .select("base_currency")
          .eq("id", statement.household_id)
          .maybeSingle(),
        supabase
          .from("categories")
          .select("id, name, category_group, is_essential")
          .eq("household_id", statement.household_id),
        supabase
          .from("category_rules")
          .select("id, match_pattern, match_type, category_id, is_active")
          .eq("household_id", statement.household_id)
          .eq("is_active", true),
      ]);

    const statementCurrency = (
      extraction.meta.currency ??
      account?.currency ??
      household?.base_currency ??
      "GBP"
    ).toUpperCase();
    const baseCurrency = (household?.base_currency ?? "GBP").toUpperCase();
    const fx = await loadFxLookup(supabase, baseCurrency);

    const categories = (categoryRows ?? []) as CategoryRef[];
    const rules = (ruleRows ?? []) as CategoryRule[];

    const dates = parsed.map((row) => row.booked_date).sort();
    const firstDate = dates[0]!;
    const lastDate = dates[dates.length - 1]!;

    /* -------------------------------------------------------- deduplicate */
    const { data: existingRows } = await supabase
      .from("transactions")
      .select("booked_date, amount, direction, description, import_fingerprint, bank_reference")
      .eq("account_id", statement.account_id)
      .gte("booked_date", firstDate)
      .lte("booked_date", lastDate);

    const existingByBucket = new Map<string, ExistingRow[]>();
    const fingerprintCounts = new Map<string, number>();
    const heldReferences = new Set<string>();
    for (const row of (existingRows ?? []) as ExistingRow[]) {
      const key = bucketKey(row.booked_date, Number(row.amount), row.direction);
      const bucket = existingByBucket.get(key) ?? [];
      bucket.push(row);
      existingByBucket.set(key, bucket);

      const base = baseOf(row.import_fingerprint);
      if (base) fingerprintCounts.set(base, (fingerprintCounts.get(base) ?? 0) + 1);

      const reference = referenceKey(row.bank_reference, row.booked_date, Number(row.amount));
      if (reference) heldReferences.add(reference);
    }

    const consumed = new Set<ExistingRow>();
    const occurrence = new Map<string, number>();
    const fresh: Array<RawTransaction & { fingerprint: string }> = [];
    let duplicates = 0;

    for (const row of parsed) {
      // The bank's own reference is the one exact answer to "have we already
      // got this?" — it survives a description the bank chose to word
      // differently in a later export.
      const reference = referenceKey(row.bank_reference ?? null, row.booked_date, row.amount);
      if (reference && heldReferences.has(reference)) {
        duplicates += 1;
        continue;
      }

      const key = bucketKey(row.booked_date, row.amount, row.direction);
      const bucket = existingByBucket.get(key) ?? [];
      const match = bucket.find(
        (candidate) =>
          !consumed.has(candidate) &&
          similarity(candidate.description ?? "", row.description) >= 0.85,
      );
      if (match) {
        consumed.add(match);
        duplicates += 1;
        continue;
      }

      const base = fingerprintOf({
        booked_date: row.booked_date,
        amount: row.amount,
        direction: row.direction,
        description: row.description,
      });
      const seen = occurrence.get(base) ?? fingerprintCounts.get(base) ?? 0;
      occurrence.set(base, seen + 1);
      fresh.push({ ...row, fingerprint: `${base}#${seen}` });
    }

    /* --------------------------------------------------------- categorise */
    type Assignment = {
      category_id: string | null;
      ai_confidence: number | null;
      is_reviewed: boolean;
      ruleId: string | null;
    };
    const assignments: Array<Assignment | null> = fresh.map((row) => {
      const rule = matchRule(row.description, rules);
      return rule
        ? { category_id: rule.category_id, ai_confidence: 1, is_reviewed: true, ruleId: rule.id }
        : null;
    });

    const needsAi = fresh
      .map((row, index) => ({ row, index }))
      .filter((entry) => !assignments[entry.index]);

    let aiNote: string | null = null;
    let categorisedByModel: string | null = null;
    if (needsAi.length) {
      try {
        const results = await categoriseBatch(
          needsAi.map((entry) => ({
            description: entry.row.description,
            merchant: entry.row.merchant,
            amount: entry.row.amount,
            direction: entry.row.direction,
            currency: entry.row.currency ?? statementCurrency,
          })),
          categories,
        );
        categorisedByModel = CATEGORISATION_MODEL;

        results.forEach((result, position) => {
          const entry = needsAi[position]!;
          assignments[entry.index] = {
            category_id: result.category_id,
            ai_confidence: result.confidence,
            is_reviewed: false,
            ruleId: null,
          };
          if (result.merchant) entry.row.merchant = result.merchant;
        });
      } catch (error) {
        // Import the money even when categorisation is unavailable; the review
        // queue then holds everything uncategorised.
        aiNote =
          error instanceof Error
            ? `Transactions were imported but not categorised: ${error.message}`
            : "Transactions were imported but not categorised.";
      }
    }

    /* -------------------------------------------------------------- write */
    const payload = fresh.map((row, index) => {
      const assignment = assignments[index];
      const currency = (row.currency ?? statementCurrency).toUpperCase();
      const amountBase = convertToBase(fx, row.amount, currency, row.booked_date);
      const original =
        row.original_amount && row.original_currency && row.original_currency !== currency
          ? {
              original_amount: Number(Math.abs(row.original_amount).toFixed(2)),
              original_currency: row.original_currency.toUpperCase(),
              fx_rate: row.fx_rate ?? null,
            }
          : { original_amount: null, original_currency: null, fx_rate: null };

      return {
        household_id: statement.household_id,
        account_id: statement.account_id,
        statement_id: statementId,
        booked_date: row.booked_date,
        value_date: row.value_date ?? null,
        description: row.description.slice(0, 300),
        raw_description: row.raw_description.slice(0, 500),
        merchant: row.merchant,
        amount: Number(row.amount.toFixed(2)),
        direction: row.direction,
        currency,
        amount_base: amountBase === null ? null : Number(amountBase.toFixed(2)),
        balance_after: row.balance_after,
        bank_reference: row.bank_reference ?? null,
        bank_tx_code: row.bank_tx_code ?? null,
        ...original,
        import_fingerprint: row.fingerprint,
        category_id: assignment?.category_id ?? null,
        ai_confidence: assignment?.ai_confidence ?? null,
        is_reviewed: assignment?.is_reviewed ?? false,
      };
    });

    const insertedIds: string[] = [];
    for (let start = 0; start < payload.length; start += INSERT_BATCH) {
      const batch = payload.slice(start, start + INSERT_BATCH);
      const { data: inserted, error: insertError } = await supabase
        .from("transactions")
        .insert(batch)
        .select("id");
      if (insertError) throw new Error(insertError.message);
      for (const row of inserted ?? []) insertedIds.push(row.id as string);
    }

    if (fx.usedDistantRate) {
      notes.push(
        "Some conversions used the nearest exchange rate on record rather than the rate on the day.",
      );
    }
    if (aiNote) notes.push(aiNote);

    /* ------------------------------------- rule counters, transfers, recurring */
    const ruleHits = new Map<string, number>();
    for (const assignment of assignments) {
      if (assignment?.ruleId)
        ruleHits.set(assignment.ruleId, (ruleHits.get(assignment.ruleId) ?? 0) + 1);
    }
    for (const [ruleId, hits] of ruleHits) {
      const rule = rules.find((candidate) => candidate.id === ruleId);
      if (!rule) continue;
      const { data: current } = await supabase
        .from("category_rules")
        .select("applied_count")
        .eq("id", ruleId)
        .maybeSingle();
      await supabase
        .from("category_rules")
        .update({ applied_count: (current?.applied_count ?? 0) + hits })
        .eq("id", ruleId);
    }

    await flagTransfers(supabase, statement.household_id, firstDate, lastDate);
    await flagRecurring(supabase, statement.household_id, lastDate);

    /* ---------------------------------------------------------- validate */
    let opening = extraction.meta.opening_balance;
    const closing = extraction.meta.closing_balance;
    if (opening !== null && Math.abs(opening) < 0.0001 && closing === null) opening = null;

    let discrepancy: number | null = null;
    if (opening !== null && closing !== null) {
      // Minor units throughout: floating point should never be the reason a
      // statement appears not to balance.
      const movement = parsed.reduce(
        (sum, row) => sum + (row.direction === "credit" ? 1 : -1) * Math.round(row.amount * 100),
        0,
      );
      const drift = Math.round(closing * 100) - Math.round(opening * 100) - movement;
      discrepancy = Number((drift / 100).toFixed(2));
      // A tolerance is only defensible where the figures were inferred. A file
      // that states its own balances either reconciles or the reader is wrong.
      if (!exactFormat && Math.abs(discrepancy) < 0.02) discrepancy = 0;
    }

    if (exactFormat && discrepancy) {
      notes.push(
        `${formatLabel(format)} states its own balances, so this file must reconcile to the penny — it is out by ${discrepancy.toFixed(2)} ${statementCurrency}. Nothing has been hidden, but treat this statement as unreliable until the difference is explained.`,
      );
    }

    const needsReview =
      (discrepancy !== null && discrepancy !== 0) ||
      extraction.skippedRows > 0 ||
      aiNote !== null ||
      payload.some((row) => row.amount_base === null && row.currency !== baseCurrency);

    const message = buildMessage({
      inserted: insertedIds.length,
      duplicates,
      skipped: extraction.skippedRows,
      discrepancy,
      currency: statementCurrency,
      exact: exactFormat,
    });

    // Count what this file actually accounts for rather than what this run
    // inserted, so a re-read doesn't report a statement as holding no rows.
    const { count: heldCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("statement_id", statementId);

    await supabase
      .from("statements")
      .update({
        status: needsReview ? "needs_review" : "parsed",
        source_format: format,
        format_version: extraction.formatVersion ?? null,
        transaction_count: heldCount ?? insertedIds.length,
        duplicate_count: duplicates,
        period_start: extraction.meta.period_start ?? firstDate,
        period_end: extraction.meta.period_end ?? lastDate,
        opening_balance: opening,
        closing_balance: closing,
        currency: statementCurrency,
        discrepancy,
        error_message: needsReview ? message : null,
        parsed_at: new Date().toISOString(),
        summary: {
          inserted: insertedIds.length,
          duplicates,
          skipped_rows: extraction.skippedRows,
          notes,
          format,
          categorised_by: categorisedByModel ? { model: categorisedByModel } : null,
        },
      })
      .eq("id", statementId);

    return {
      status: needsReview ? "needs_review" : "parsed",
      inserted: insertedIds.length,
      duplicates,
      skippedRows: extraction.skippedRows,
      discrepancy,
      message,
      notes,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The statement could not be read. Try again.";
    return fail(supabase, statementId, message);
  }
}

function buildMessage(input: {
  inserted: number;
  duplicates: number;
  skipped: number;
  discrepancy: number | null;
  currency: string;
  exact: boolean;
}) {
  const parts = [`${input.inserted} new`];
  if (input.duplicates) parts.push(`${input.duplicates} already imported`);
  if (input.skipped) parts.push(`${input.skipped} rows unreadable`);
  if (input.discrepancy) {
    const amount = `${input.discrepancy > 0 ? "+" : "−"}${Math.abs(input.discrepancy).toFixed(2)} ${input.currency}`;
    parts.push(
      input.exact
        ? `balance out by ${amount} — this file states its own balances, so that is a reading fault`
        : `balance out by ${amount}`,
    );
  }
  return parts.join(", ");
}

/* ------------------------------------------------- post-import enrichment */

async function flagTransfers(
  supabase: Client,
  householdId: string,
  firstDate: string,
  lastDate: string,
) {
  const from = new Date(new Date(firstDate).getTime() - 4 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(new Date(lastDate).getTime() + 4 * 86_400_000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("transactions")
    .select("id, account_id, booked_date, amount, amount_base, direction, is_transfer")
    .eq("household_id", householdId)
    .gte("booked_date", from)
    .lte("booked_date", to)
    .limit(8000);

  const rows = (data ?? []) as Array<{
    id: string;
    account_id: string | null;
    booked_date: string;
    amount: number;
    amount_base: number | null;
    direction: string;
    is_transfer: boolean;
  }>;
  if (rows.length < 2) return;

  const transferIds = detectTransfers(rows);
  const toFlag = rows.filter((row) => transferIds.has(row.id) && !row.is_transfer).map((r) => r.id);
  await updateIn(supabase, toFlag, { is_transfer: true });
}

async function flagRecurring(supabase: Client, householdId: string, lastDate: string) {
  const from = new Date(new Date(lastDate).getTime() - 550 * 86_400_000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("transactions")
    .select("id, merchant, description, booked_date, amount, direction, is_recurring, is_transfer")
    .eq("household_id", householdId)
    .eq("is_transfer", false)
    .gte("booked_date", from)
    .limit(12000);

  const rows = (data ?? []) as Array<{
    id: string;
    merchant: string | null;
    description: string | null;
    booked_date: string;
    amount: number;
    direction: string;
    is_recurring: boolean;
  }>;
  if (rows.length < 3) return;

  const recurringIds = detectRecurring(
    rows.map((row) => ({
      id: row.id,
      merchant: row.merchant,
      description: row.description ?? "",
      booked_date: row.booked_date,
      amount: Number(row.amount),
      direction: row.direction,
    })),
  );

  const toFlag = rows
    .filter((row) => recurringIds.has(row.id) && !row.is_recurring)
    .map((r) => r.id);
  await updateIn(supabase, toFlag, { is_recurring: true });
}

async function updateIn(supabase: Client, ids: string[], values: Record<string, unknown>) {
  for (let start = 0; start < ids.length; start += UPDATE_BATCH) {
    const batch = ids.slice(start, start + UPDATE_BATCH);
    if (!batch.length) continue;
    const { error } = await supabase.from("transactions").update(values).in("id", batch);
    if (error) throw new Error(error.message);
  }
}

/* --------------------------------------------------- rules applied later */

export async function applyRuleToExisting(
  supabase: Client,
  householdId: string,
  ruleId: string,
): Promise<number> {
  const { data: rule } = await supabase
    .from("category_rules")
    .select("id, match_pattern, match_type, category_id, is_active")
    .eq("id", ruleId)
    .maybeSingle();
  if (!rule) throw new Error("That rule no longer exists.");

  const { data } = await supabase
    .from("transactions")
    .select("id, description")
    .eq("household_id", householdId)
    .neq("category_id", rule.category_id)
    .limit(20000);

  const rows = (data ?? []) as Array<{ id: string; description: string | null }>;
  const ids = rows
    .filter((row) => matchRule(row.description ?? "", [rule as CategoryRule]))
    .map((row) => row.id);

  await updateIn(supabase, ids, {
    category_id: rule.category_id,
    is_reviewed: true,
    ai_confidence: 1,
  });

  if (ids.length) {
    const { data: current } = await supabase
      .from("category_rules")
      .select("applied_count")
      .eq("id", ruleId)
      .maybeSingle();
    await supabase
      .from("category_rules")
      .update({ applied_count: (current?.applied_count ?? 0) + ids.length })
      .eq("id", ruleId);
  }

  return ids.length;
}
