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
import { createJsonRunner, type JsonRunner } from "./ai/runner.server";
import {
  applyMapping,
  extractFromPdfText,
  inferColumnMapping,
  type ExtractionResult,
} from "./statement-extract.server";

import {
  SCANNED_PDF_MESSAGE,
  decodeText,
  detectFileKind,
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
};

function bucketKey(date: string, amount: number, direction: string) {
  return `${date}|${Math.round(Math.abs(amount) * 100)}|${direction}`;
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

/** A failure with a sentence worth showing the household. */
export class StatementFailure extends Error {}

export type LoadedStatementFile = {
  kind: "pdf" | "csv" | "xlsx";
  bytes: Uint8Array;
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
  const kind = detectFileKind(statement.file_name ?? statement.file_path, (file as any).type);
  if (!kind) {
    throw new StatementFailure(
      "Only PDF, CSV and Excel statements can be read. Export one of those formats from your bank.",
    );
  }
  return { kind, bytes };
}

/** File bytes → rows plus everything the statement says about itself. */
export async function extractStatementContent(
  runner: JsonRunner,
  file: LoadedStatementFile,
): Promise<ExtractionResult> {
  if (file.kind === "pdf") {
    const pdf = await extractPdfText(file.bytes);
    if (looksScanned(pdf)) throw new StatementFailure(SCANNED_PDF_MESSAGE);
    return extractFromPdfText(runner, pdf.text);
  }

  const rawRows =
    file.kind === "csv"
      ? await parseDelimitedRows(decodeText(file.bytes))
      : await parseWorkbookRows(file.bytes);
  const rows = rawRows.filter((row) => row.some((cell) => (cell ?? "").trim().length > 0));
  if (rows.length < 2) {
    throw new StatementFailure(
      "This file has no readable rows. Check you exported the transaction list rather than a summary.",
    );
  }
  const mapping = await inferColumnMapping(runner, rows);
  return applyMapping(rows, mapping);
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
    const extractionRunner = await createJsonRunner(
      supabase,
      statement.household_id,
      "extraction",
    );
    const extraction = await extractStatementContent(extractionRunner, file);
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
      .select("booked_date, amount, direction, description, import_fingerprint")
      .eq("account_id", statement.account_id)
      .gte("booked_date", firstDate)
      .lte("booked_date", lastDate);

    const existingByBucket = new Map<string, ExistingRow[]>();
    const fingerprintCounts = new Map<string, number>();
    for (const row of (existingRows ?? []) as ExistingRow[]) {
      const key = bucketKey(row.booked_date, Number(row.amount), row.direction);
      const bucket = existingByBucket.get(key) ?? [];
      bucket.push(row);
      existingByBucket.set(key, bucket);

      const base = baseOf(row.import_fingerprint);
      if (base) fingerprintCounts.set(base, (fingerprintCounts.get(base) ?? 0) + 1);
    }

    const consumed = new Set<ExistingRow>();
    const occurrence = new Map<string, number>();
    const fresh: Array<RawTransaction & { fingerprint: string }> = [];
    let duplicates = 0;

    for (const row of parsed) {
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
    let categoriser: JsonRunner | null = null;
    if (needsAi.length) {
      try {
        categoriser = await createJsonRunner(supabase, statement.household_id, "categorisation");
        const results = await categoriseBatch(
          categoriser,
          needsAi.map((entry) => ({
            description: entry.row.description,
            merchant: entry.row.merchant,
            amount: entry.row.amount,
            direction: entry.row.direction,
            currency: entry.row.currency ?? statementCurrency,
          })),
          categories,
        );

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
        for (const note of categoriser.notes) if (!notes.includes(note)) notes.push(note);
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
      return {
        household_id: statement.household_id,
        account_id: statement.account_id,
        statement_id: statementId,
        booked_date: row.booked_date,
        description: row.description.slice(0, 300),
        raw_description: row.raw_description.slice(0, 500),
        merchant: row.merchant,
        amount: Number(row.amount.toFixed(2)),
        direction: row.direction,
        currency,
        amount_base: amountBase === null ? null : Number(amountBase.toFixed(2)),
        balance_after: row.balance_after,
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
      const movement = parsed.reduce(
        (sum, row) => sum + (row.direction === "credit" ? row.amount : -row.amount),
        0,
      );
      discrepancy = Number((closing - (opening + movement)).toFixed(2));
      if (Math.abs(discrepancy) < 0.02) discrepancy = 0;
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
          categorised_by: categoriser
            ? { provider: categoriser.provider, model: categoriser.model }
            : null,
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
}) {
  const parts = [`${input.inserted} new`];
  if (input.duplicates) parts.push(`${input.duplicates} already imported`);
  if (input.skipped) parts.push(`${input.skipped} rows unreadable`);
  if (input.discrepancy) {
    parts.push(
      `balance out by ${input.discrepancy > 0 ? "+" : "−"}${Math.abs(input.discrepancy).toFixed(2)} ${input.currency}`,
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
