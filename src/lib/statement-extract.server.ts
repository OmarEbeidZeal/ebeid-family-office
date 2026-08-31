/**
 * Turning a raw file into candidate transactions — and into an identity.
 *
 * Tabular files: the AI sees the header plus fifteen sample rows and returns a
 * column mapping; the mapping is then applied to the whole file in code. Never
 * send thousands of rows to a model — it is slow, expensive and gets truncated.
 *
 * PDFs: the text layer is chunked and read by the extraction model.
 *
 * Both paths also read whose account this is: the bank's name, the holder, the
 * masked account number printed on the page. That is what lets a statement
 * arrive without anyone first telling the app which account it belongs to.
 *
 * Statements are English-language UK, Egyptian, Jordanian and US formats.
 */
import { completeJson } from "./ai/gateway.server";
import {
  inferDateOrder,
  guessMerchant,
  parseAmountCell,
  parseDateCell,
  type DateFormat,
  type RawTransaction,
} from "./statement-parse.server";

/** What the statement says about itself. */
export type StatementIdentity = {
  institution: string | null;
  statement_holder: string | null;
  /**
   * The account number, IBAN or card number as printed — often already masked
   * by the bank. Held only long enough to derive a hash and the last four; it
   * is never written to the database.
   */
  account_identifier: string | null;
  identifier_kind: "account_number" | "iban" | "card" | null;
  account_type: string | null;
  country: string | null;
};

export type StatementMeta = {
  period_start: string | null;
  period_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  currency: string | null;
  identity: StatementIdentity;
};

export const EMPTY_IDENTITY: StatementIdentity = {
  institution: null,
  statement_holder: null,
  account_identifier: null,
  identifier_kind: null,
  account_type: null,
  country: null,
};

export type ExtractionResult = {
  transactions: RawTransaction[];
  meta: StatementMeta;
  /** Rows that looked like data but could not be read. */
  skippedRows: number;
  notes: string[];
};

export const MAX_TRANSACTIONS = 6000;

/* --------------------------------------------------------- shared identity */

const IDENTITY_PROPERTIES = {
  institution: { type: "string" },
  statement_holder: { type: "string" },
  account_identifier: { type: "string" },
  identifier_kind: { type: "string", enum: ["account_number", "iban", "card", ""] },
  account_type: {
    type: "string",
    enum: ["current", "savings", "credit_card", "investment", "loan", "mortgage", "other", ""],
  },
  country: { type: "string" },
} as const;

const IDENTITY_KEYS = [
  "institution",
  "statement_holder",
  "account_identifier",
  "identifier_kind",
  "account_type",
  "country",
] as const;

const IDENTITY_RULES = `Also read who the statement belongs to:
- institution: the bank or broker's name exactly as printed ("HSBC UK Bank plc", "Commercial International Bank", "Arab Bank"). Empty when the page never names it.
- statement_holder: the account holder's name as printed. Empty if absent.
- account_identifier: the account number, IBAN or card number as printed, including any masking the bank applied (for example "****4821" or "GB29 NWBK 6016 1331 9268 19"). Prefer an IBAN when both appear. Empty if none is printed.
- identifier_kind: which of those it is. Empty when there is no identifier.
- account_type: what kind of account the statement is for, from the list. Empty when unclear.
- country: ISO 3166-1 alpha-2 for where the account is held (GB, EG, JO, US, AE), inferred from the bank, address, currency or sort code. Empty when genuinely unclear.
Never guess an account number, a name or a bank you cannot see in the text.`;

type RawIdentity = {
  institution?: string;
  statement_holder?: string;
  account_identifier?: string;
  identifier_kind?: string;
  account_type?: string;
  country?: string;
};

function cleanIdentity(raw: RawIdentity | null | undefined): StatementIdentity {
  const text = (value: string | undefined, max = 120) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed.slice(0, max) : null;
  };
  const kind = text(raw?.identifier_kind);
  const country = text(raw?.country, 2);

  return {
    institution: text(raw?.institution),
    statement_holder: text(raw?.statement_holder),
    account_identifier: text(raw?.account_identifier, 64),
    identifier_kind: kind === "iban" || kind === "card" || kind === "account_number" ? kind : null,
    account_type: text(raw?.account_type, 24),
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
  };
}

/* ------------------------------------------------------------ tabular files */

type ColumnMapping = {
  header_row_index: number;
  date_column: number;
  description_columns: number[];
  amount_column: number;
  debit_column: number;
  credit_column: number;
  balance_column: number;
  currency_column: number;
  date_format: string;
  amount_sign_convention: string;
  currency_code: string;
  notes: string;
} & RawIdentity;

const MAPPING_SCHEMA = {
  type: "object",
  properties: {
    header_row_index: { type: "integer" },
    date_column: { type: "integer" },
    description_columns: { type: "array", items: { type: "integer" } },
    amount_column: { type: "integer" },
    debit_column: { type: "integer" },
    credit_column: { type: "integer" },
    balance_column: { type: "integer" },
    currency_column: { type: "integer" },
    date_format: { type: "string", enum: ["DMY", "MDY", "YMD"] },
    amount_sign_convention: {
      type: "string",
      enum: ["negative_is_debit", "positive_is_debit", "separate_columns"],
    },
    currency_code: { type: "string" },
    notes: { type: "string" },
    ...IDENTITY_PROPERTIES,
  },
  required: [
    "header_row_index",
    "date_column",
    "description_columns",
    "amount_column",
    "debit_column",
    "credit_column",
    "balance_column",
    "currency_column",
    "date_format",
    "amount_sign_convention",
    "currency_code",
    "notes",
    ...IDENTITY_KEYS,
  ],
  additionalProperties: false,
} as const;

const MAPPING_SYSTEM = `You map bank statement exports to a fixed schema. Statements are English-language exports from UK, Egyptian, Jordanian and US banks, and preamble rows above the header are common.

Rules:
- Column indexes are zero-based positions in the row arrays you are shown.
- header_row_index is the zero-based index, within the preview rows given, of the row containing column titles. Use -1 if the file has no header row.
- Use -1 for any column that does not exist.
- If the file has one signed amount column, set amount_column and choose negative_is_debit or positive_is_debit by looking at the sample values (money leaving an account is usually negative).
- If the file has separate money-in and money-out columns, set debit_column (money out) and credit_column (money in), set amount_column to -1, and use separate_columns.
- description_columns may list several columns that should be joined with a space.
- date_format describes the order of the numbers in the date column. Only report YMD when the year genuinely comes first.
- currency_code is the ISO code if the file states one, otherwise an empty string.
- notes: one short sentence naming the bank or format if you recognise it, otherwise empty.

${IDENTITY_RULES}
Export files often carry the bank name, holder and account number in the preamble rows above the header — read them from there.`;

/** Header row plus the first fifteen data rows — never the whole file. */
export const PREVIEW_ROWS = 16;

export async function inferColumnMapping(previewRows: string[][]): Promise<ColumnMapping> {
  const preview = previewRows
    .filter((row) => row.some((cell) => (cell ?? "").trim().length > 0))
    .slice(0, PREVIEW_ROWS)
    .map((row, index) => `${index}: ${JSON.stringify(row)}`)
    .join("\n");

  return completeJson<ColumnMapping>("extraction", {
    system: MAPPING_SYSTEM,
    user: `Here are the first rows of a bank statement export. Map its columns and read whose account it is.\n\n${preview}`,
    schemaName: "column_mapping",
    schema: MAPPING_SCHEMA,
    maxTokens: 4000,
  });
}

function joinCells(row: string[], indexes: number[]): string {
  return indexes
    .map((index) => (index >= 0 ? (row[index] ?? "") : ""))
    .filter((value) => value.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Statements print their own opening and closing balances on marker lines that
 * carry no movement. Reading them is what makes balance validation honest: a
 * closing figure derived from the last running balance can never disagree with
 * the transactions, so it would never catch a row the parser missed.
 */
const OPENING_MARKERS =
  /(opening|brought\s*forward|balance\s*b\/?f|b\/?fwd|start(ing)?\s+balance|previous\s+balance)/i;
const CLOSING_MARKERS =
  /(closing|carried\s*forward|balance\s*c\/?f|c\/?fwd|end(ing)?\s+balance|final\s+balance)/i;

function balanceAnchor(text: string): "opening" | "closing" | null {
  if (!/balance|forward|b\/f|c\/f/i.test(text)) return null;
  if (CLOSING_MARKERS.test(text)) return "closing";
  if (OPENING_MARKERS.test(text)) return "opening";
  return null;
}

function anchorValue(row: string[], balanceColumn: number): number | null {
  if (balanceColumn >= 0) {
    const cell = parseAmountCell(row[balanceColumn]);
    if (cell) return cell.value;
  }
  // Fall back to the last numeric cell on the line — marker rows often sit
  // outside the transaction columns.
  for (let index = row.length - 1; index >= 0; index -= 1) {
    const cell = parseAmountCell(row[index]);
    if (cell) return cell.value;
  }
  return null;
}

export function applyMapping(rows: string[][], mapping: ColumnMapping): ExtractionResult {
  const start = Math.max(0, mapping.header_row_index + 1);
  const body = rows.slice(start);
  const notes: string[] = [];
  if (mapping.notes?.trim()) notes.push(mapping.notes.trim());

  // Trust the file over the model when the sample proves the date order.
  const dateSamples = body
    .slice(0, 40)
    .map((row) => (mapping.date_column >= 0 ? (row[mapping.date_column] ?? "") : ""))
    .filter(Boolean);
  const provenOrder = inferDateOrder(dateSamples);
  const dateFormat: DateFormat = (provenOrder ??
    (mapping.date_format as DateFormat) ??
    "auto") as DateFormat;
  if (provenOrder && provenOrder !== mapping.date_format) {
    notes.push(`Date order read from the file as ${provenOrder}.`);
  }

  const descriptionColumns = mapping.description_columns?.length
    ? mapping.description_columns
    : [mapping.date_column + 1];

  const transactions: RawTransaction[] = [];
  let skippedRows = 0;
  let balanceColumnUsable = mapping.balance_column >= 0;
  let statedOpening: number | null = null;
  let statedClosing: number | null = null;

  for (const row of body) {
    if (!row.some((cell) => (cell ?? "").trim().length > 0)) continue;

    const anchor = balanceAnchor(row.join(" "));
    if (anchor) {
      const value = anchorValue(row, mapping.balance_column);
      if (value !== null) {
        if (anchor === "opening") statedOpening ??= value;
        else statedClosing = value;
        continue;
      }
    }

    const dateCell = mapping.date_column >= 0 ? row[mapping.date_column] : undefined;
    const bookedDate = parseDateCell(dateCell, dateFormat);
    if (!bookedDate) {
      // Footer text and running-total rows land here; only count rows that
      // carried a number, so trailing notes don't look like data loss.
      if (row.some((cell) => /\d/.test(cell ?? ""))) skippedRows += 1;
      continue;
    }

    let amount: number | null = null;
    let direction: "debit" | "credit" | null = null;

    if (mapping.amount_sign_convention === "separate_columns" || mapping.amount_column < 0) {
      const debit = mapping.debit_column >= 0 ? parseAmountCell(row[mapping.debit_column]) : null;
      const credit =
        mapping.credit_column >= 0 ? parseAmountCell(row[mapping.credit_column]) : null;
      if (debit && Math.abs(debit.value) > 0) {
        amount = Math.abs(debit.value);
        direction = "debit";
      } else if (credit && Math.abs(credit.value) > 0) {
        amount = Math.abs(credit.value);
        direction = "credit";
      }
    } else {
      const parsed = parseAmountCell(row[mapping.amount_column]);
      if (parsed && Math.abs(parsed.value) > 0) {
        amount = Math.abs(parsed.value);
        if (parsed.explicitSign) {
          direction = parsed.explicitSign;
        } else if (mapping.amount_sign_convention === "positive_is_debit") {
          direction = parsed.value > 0 ? "debit" : "credit";
        } else {
          direction = parsed.value < 0 ? "debit" : "credit";
        }
      }
    }

    if (amount === null || direction === null) {
      skippedRows += 1;
      continue;
    }

    const description = joinCells(row, descriptionColumns) || "Unlabelled transaction";
    const balanceCell = balanceColumnUsable ? parseAmountCell(row[mapping.balance_column]) : null;
    if (balanceColumnUsable && !balanceCell) balanceColumnUsable = false;

    const currencyCell =
      mapping.currency_column >= 0 ? (row[mapping.currency_column] ?? "").trim() : "";

    transactions.push({
      booked_date: bookedDate,
      description,
      raw_description: row.join(" | ").slice(0, 500),
      merchant: guessMerchant(description),
      amount,
      direction,
      balance_after: balanceCell ? balanceCell.value : null,
      currency: /^[A-Za-z]{3}$/.test(currencyCell) ? currencyCell.toUpperCase() : null,
    });

    if (transactions.length >= MAX_TRANSACTIONS) {
      notes.push(`Stopped after ${MAX_TRANSACTIONS} rows — split the file and import the rest.`);
      break;
    }
  }

  const sorted = [...transactions].sort((a, b) => a.booked_date.localeCompare(b.booked_date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // A balance the statement states outright beats one inferred from the running
  // balance column, because only the stated figure can disagree with the rows.
  let opening: number | null = statedOpening;
  let closing: number | null = statedClosing;
  if (
    opening === null &&
    first &&
    first.balance_after !== null &&
    first.balance_after !== undefined
  ) {
    opening =
      first.direction === "debit"
        ? first.balance_after + first.amount
        : first.balance_after - first.amount;
  }
  if (closing === null && last && last.balance_after !== null && last.balance_after !== undefined) {
    closing = last.balance_after;
  }

  const identity = cleanIdentity(mapping);
  const currency = /^[A-Z]{3}$/.test(mapping.currency_code?.toUpperCase() ?? "")
    ? mapping.currency_code.toUpperCase()
    : (transactions.find((t) => t.currency)?.currency ?? null);

  return {
    transactions,
    skippedRows,
    notes,
    meta: {
      period_start: first?.booked_date ?? null,
      period_end: last?.booked_date ?? null,
      opening_balance: opening,
      closing_balance: closing,
      currency,
      identity,
    },
  };
}

/* ----------------------------------------------------------------- PDF text */

const META_SCHEMA = {
  type: "object",
  properties: {
    period_start: { type: "string" },
    period_end: { type: "string" },
    opening_balance: { type: "string" },
    closing_balance: { type: "string" },
    currency: { type: "string" },
    ...IDENTITY_PROPERTIES,
  },
  required: [
    "period_start",
    "period_end",
    "opening_balance",
    "closing_balance",
    "currency",
    ...IDENTITY_KEYS,
  ],
  additionalProperties: false,
} as const;

const PDF_SCHEMA = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          direction: { type: "string", enum: ["debit", "credit"] },
          balance_after: { type: "string" },
        },
        required: ["date", "description", "amount", "direction", "balance_after"],
        additionalProperties: false,
      },
    },
  },
  required: ["transactions"],
  additionalProperties: false,
} as const;

const PDF_SYSTEM = `You read the text layer of an English-language bank statement and return its transactions exactly as printed.

Absolute rules:
- Never invent, estimate or complete a transaction. If a line is unreadable, leave it out.
- amount is always a positive number. direction is "debit" for money leaving the account and "credit" for money arriving.
- date must be ISO yyyy-mm-dd. Use the statement's own date convention; UK, Egyptian and Jordanian statements are day-first unless the text clearly shows otherwise.
- description is the merchant or narrative text as printed, without the amount or balance.
- balance_after is the running balance printed on that line, as plain digits, or "" when the statement does not print one.
- Ignore summary blocks, interest-rate tables, page headers, footers and marketing text.`;

const CHUNK_SIZE = 9000;
const MAX_CHUNKS = 24;

function chunkText(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > CHUNK_SIZE && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export async function extractFromPdfText(text: string): Promise<ExtractionResult> {
  const chunks = chunkText(text);
  const notes: string[] = [];
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      "This PDF is larger than a single import can read reliably. Split it into shorter date ranges, or download the CSV from your bank.",
    );
  }

  const metaPromise = completeJson<
    {
      period_start: string;
      period_end: string;
      opening_balance: string;
      closing_balance: string;
      currency: string;
    } & RawIdentity
  >("extraction", {
    system: `You read bank statement headers. Return the statement period, opening and closing balances and the ISO currency code exactly as printed. Use an empty string for anything the text does not state. Dates must be ISO yyyy-mm-dd.

${IDENTITY_RULES}`,
    user: `Statement text (start):\n\n${text.slice(0, 4000)}\n\nStatement text (end):\n\n${text.slice(-2500)}`,
    schemaName: "statement_meta",
    schema: META_SCHEMA,
    maxTokens: 3000,
  }).catch(() => null);

  const results: RawTransaction[] = [];
  const CONCURRENCY = 3;

  for (let start = 0; start < chunks.length; start += CONCURRENCY) {
    const batch = chunks.slice(start, start + CONCURRENCY);
    const parsed = await Promise.all(
      batch.map((chunk) =>
        completeJson<{
          transactions: Array<{
            date: string;
            description: string;
            amount: number;
            direction: "debit" | "credit";
            balance_after: string;
          }>;
        }>("extraction", {
          system: PDF_SYSTEM,
          user: `Statement text section ${start + batch.indexOf(chunk) + 1} of ${chunks.length}:\n\n${chunk}`,
          schemaName: "pdf_transactions",
          schema: PDF_SCHEMA,
          maxTokens: 16000,
        }),
      ),
    );

    for (const page of parsed) {
      for (const row of page.transactions ?? []) {
        const bookedDate = parseDateCell(row.date, "YMD") ?? parseDateCell(row.date, "auto");
        const amount = Math.abs(Number(row.amount));
        if (!bookedDate || !Number.isFinite(amount) || amount === 0) continue;
        const description = (row.description ?? "").trim() || "Unlabelled transaction";
        const balance = parseAmountCell(row.balance_after);
        results.push({
          booked_date: bookedDate,
          description,
          raw_description: description.slice(0, 500),
          merchant: guessMerchant(description),
          amount,
          direction: row.direction === "credit" ? "credit" : "debit",
          balance_after: balance ? balance.value : null,
          currency: null,
        });
      }
    }
  }

  const meta = await metaPromise;
  const sorted = [...results].sort((a, b) => a.booked_date.localeCompare(b.booked_date));
  const opening = meta?.opening_balance ? parseAmountCell(meta.opening_balance) : null;
  const closing = meta?.closing_balance ? parseAmountCell(meta.closing_balance) : null;

  const firstDate = sorted[0]?.booked_date ?? null;
  const lastDate = sorted[sorted.length - 1]?.booked_date ?? null;
  const periodStart = meta?.period_start
    ? (parseDateCell(meta.period_start, "YMD") ?? firstDate)
    : firstDate;
  const periodEnd = meta?.period_end
    ? (parseDateCell(meta.period_end, "YMD") ?? lastDate)
    : lastDate;

  return {
    transactions: results,
    skippedRows: 0,
    notes,
    meta: {
      period_start: periodStart,
      period_end: periodEnd,
      opening_balance: opening ? opening.value : null,
      closing_balance: closing ? closing.value : null,
      currency: /^[A-Za-z]{3}$/.test(meta?.currency ?? "")
        ? (meta?.currency ?? "").toUpperCase()
        : null,
      identity: cleanIdentity(meta),
    },
  };
}
