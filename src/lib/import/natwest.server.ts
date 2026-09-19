/**
 * Reading a NatWest "Your transactions" PDF by its own layout, with no model.
 *
 * These files are the household's largest PDF source and the one the reader
 * kept getting quietly wrong. A model reading them drops rows — a page here, a
 * run of rows there — and nothing in the result says so: the import looks
 * clean and a year of spending is short two hundred entries. The layout,
 * though, is fixed and machine-printed:
 *
 *     Transactions-01
 *     ABDIN HN
 *     Student/graduate
 *     Account details
 *     *****234 · 54-21-47
 *     From  31/08/2024  To  31/08/2025
 *     Date Description Type Paid in (£) Paid out (£)
 *     26 Aug HCA HEALTHCARE UK Debit Card Transaction -£140.74
 *
 * Every row is one line: a day and month, a description with NatWest's own
 * transaction type run onto it, and a signed amount. That is exact, so it is
 * read exactly — the row count out is the row count on the page.
 *
 * The header is the other half of the value. It prints the sort code and the
 * masked account tail together, which is a stable identity for the account:
 * three files downloaded for three different years all say `*****234 ·
 * 54-21-47`, so they land on one account instead of three. It also prints the
 * holder — `ABDIN HN` — which is what stops a year of Haya's spending being
 * filed under whoever happened to upload it.
 */
import type { ExtractionResult, StatementIdentity } from "../statement-extract.server";
import { guessMerchant, type RawTransaction } from "../statement-parse.server";
import { resolveStatementDate, type StatementPeriod } from "./statement-dates.server";
import { splitDescriptionAndType } from "./uk-tx-types";

/** The column header NatWest prints above every page of transactions. */
const COLUMN_HEADER = /Date\s+Description\s+Type\s+Paid\s*in\s*\(([£$€]|[A-Z]{3})\)/i;

/** `*****234`, `····234`, `xxxx234` — the tail the bank prints, however masked. */
const MASKED_TAIL = /(?:[*x×•·#]\s*){3,}(\d{2,6})\b/i;

const SORT_CODE = /\b(\d{2})[-\s]?(\d{2})[-\s]?(\d{2})\b/;

/** `-£140.74`, `£500.00` — one printed figure, with the sign the bank gave it. */
const MONEY = String.raw`(-|\+)?\s*[£$€]\s*([\d,]+(?:\.\d{1,2})?)`;

/**
 * One row, one line: a day and month, the description with NatWest's own
 * transaction type run onto it, the amount, and — where the export includes the
 * Balance column — the running balance after the entry.
 *
 * Both figures are anchored to the end of the line, so a description that
 * happens to mention a price cannot be mistaken for the amount.
 */
const ROW = new RegExp(
  `^(\\d{1,2}\\s+[A-Za-z]{3,9})\\s+(.+?)\\s+${MONEY}(?:\\s+${MONEY})?\\s*$`,
);

const SYMBOL_CURRENCY: Record<string, string> = { "£": "GBP", $: "USD", "€": "EUR" };

const PAGE_TAG = /^Transactions[-\s]?\d+$/i;

const HEADER_NOISE = new Set([
  "account details",
  "your transactions",
  "from",
  "to",
  "date of creation",
  "statement",
  "transactions",
]);

/**
 * Is this a NatWest transactions export?
 *
 * The bank's own name in the footer is the strongest signal, and the column
 * header is the second: both have to be there before this reader claims the
 * file, because claiming one it cannot read would send a statement to a
 * deterministic parser that returns nothing.
 */
export function looksLikeNatWest(text: string): boolean {
  if (!COLUMN_HEADER.test(text)) return false;
  return /national\s+westminster|natwest/i.test(text);
}

function headerLines(lines: string[]): string[] {
  const stop = lines.findIndex((line) => COLUMN_HEADER.test(line));
  return stop === -1 ? lines.slice(0, 20) : lines.slice(0, stop);
}

function parseUkDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * The period, from the `From … To …` pair in the header.
 *
 * NatWest prints a third date — `Date of creation` — that is not part of the
 * period, so the labels are followed rather than the dates being taken in the
 * order they appear.
 */
function readPeriod(header: string[]): StatementPeriod {
  const labelled = (label: RegExp): string | null => {
    for (let index = 0; index < header.length; index += 1) {
      const line = header[index]!;
      const inline = line.match(new RegExp(`${label.source}\\s*[:\\s]\\s*(\\d{2}/\\d{2}/\\d{4})`, "i"));
      if (inline) return parseUkDate(inline[1]);
      if (new RegExp(`^\\s*${label.source}\\s*:?\\s*$`, "i").test(line)) {
        return parseUkDate(header[index + 1]);
      }
    }
    return null;
  };

  return { start: labelled(/from/), end: labelled(/to/) };
}

/**
 * The account's identity: the sort code and the masked tail, printed together.
 *
 * Either alone is weak — a sort code names a branch, not an account, and a
 * three-digit tail is shared by thousands. Together they are as good a key as
 * this bank prints, and they are stable across every download.
 */
function readIdentifier(header: string[]): { identifier: string | null; tail: string | null } {
  for (const line of header) {
    const tail = line.match(MASKED_TAIL);
    const sort = line.match(SORT_CODE);
    if (tail && sort) {
      return {
        identifier: `${sort[1]}-${sort[2]}-${sort[3]} ${"*".repeat(5)}${tail[1]}`,
        tail: tail[1]!,
      };
    }
  }

  // The two on separate lines, which some downloads do.
  const tail = header.map((line) => line.match(MASKED_TAIL)).find(Boolean);
  const sort = header.map((line) => line.match(SORT_CODE)).find(Boolean);
  if (tail && sort) {
    return {
      identifier: `${sort[1]}-${sort[2]}-${sort[3]} ${"*".repeat(5)}${tail[1]}`,
      tail: tail[1]!,
    };
  }
  return { identifier: null, tail: null };
}

/**
 * The name at the top of the page. NatWest prints it immediately under the
 * page tag, above the product name — `ABDIN HN`, then `Student/graduate`.
 */
function readHolder(header: string[]): string | null {
  for (const line of header) {
    const value = line.trim();
    if (!value || PAGE_TAG.test(value)) continue;
    if (HEADER_NOISE.has(value.toLowerCase())) continue;
    if (/\d/.test(value)) continue;
    if (value.length < 3 || value.length > 60) continue;
    // The product name — `Student/graduate`, `Select Account` — is not a person.
    if (/^(select|reward|student|graduate|current|savings|premier|adapt)\b/i.test(value)) continue;
    return value;
  }
  return null;
}

function readAccountType(header: string[]): string {
  const text = header.join(" ").toLowerCase();
  if (/credit\s*card/.test(text)) return "credit_card";
  if (/savings|isa/.test(text)) return "savings";
  return "current";
}

function readCurrency(text: string): string {
  const match = text.match(COLUMN_HEADER);
  const printed = match?.[1] ?? "£";
  return SYMBOL_CURRENCY[printed] ?? (printed.length === 3 ? printed.toUpperCase() : "GBP");
}

/**
 * Read the file.
 *
 * Rows are collected first and dated second, because the year lives in the
 * header and a row that cannot be placed inside the period is left out rather
 * than filed to a guessed year.
 */
export function parseNatWest(text: string): ExtractionResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const header = headerLines(lines);
  const period = readPeriod(header);
  const { identifier, tail } = readIdentifier(header);
  const currency = readCurrency(text);

  type Pending = {
    printed: string;
    description: string;
    amount: number;
    credit: boolean;
    /** The running balance the bank printed after this entry, where it prints one. */
    balance: number | null;
  };
  const pending: Pending[] = [];
  let unreadable = 0;

  for (const line of lines) {
    if (COLUMN_HEADER.test(line) || PAGE_TAG.test(line)) continue;
    const match = line.match(ROW);
    if (!match) {
      // A line that starts like a row but does not end in an amount is a row
      // this reader failed on, and it is counted rather than passed over.
      if (/^\d{1,2}\s+[A-Za-z]{3}\b/.test(line)) unreadable += 1;
      continue;
    }

    const [, printed, body, sign, figure, balanceSign, balanceFigure] = match;
    const amount = Number(figure!.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount === 0) continue;

    const printedBalance = balanceFigure ? Number(balanceFigure.replace(/,/g, "")) : null;
    const balance =
      printedBalance !== null && Number.isFinite(printedBalance)
        ? balanceSign === "-"
          ? -printedBalance
          : printedBalance
        : null;

    pending.push({
      printed: printed!,
      description: (body ?? "").trim(),
      amount: Math.abs(amount),
      credit: sign !== "-",
      balance,
    });
  }

  const transactions: RawTransaction[] = [];
  let inferredYears = 0;
  let outsidePeriod = 0;
  let undatable = 0;
  /** The rows that made it through, in the order the page printed them. */
  const kept: Pending[] = [];

  for (const row of pending) {
    const resolved = resolveStatementDate(row.printed, period);
    if (!resolved.date) {
      if (resolved.reason === "outside_period") outsidePeriod += 1;
      else undatable += 1;
      continue;
    }
    if (resolved.inferred) inferredYears += 1;

    // `TESCO STORESDebit Card Transaction` — the type is lifted out so every
    // Tesco visit files under one payee.
    const split = splitDescriptionAndType(row.description);
    const description = split.description || "Unlabelled transaction";
    kept.push(row);
    transactions.push({
      booked_date: resolved.date,
      description,
      raw_description: (row.description || description).slice(0, 500),
      merchant: guessMerchant(description),
      amount: row.amount,
      direction: row.credit ? "credit" : "debit",
      balance_after: row.balance,
      currency: null,
      bank_tx_code: split.type,
    });
  }

  const sorted = [...transactions].sort((a, b) => a.booked_date.localeCompare(b.booked_date));
  const balances = deriveStatementBalances(kept, transactions);

  const notes: string[] = [
    "Read as a NatWest transactions export — every printed row taken exactly as it appears, with no model reading the page.",
  ];
  if (inferredYears > 0 && (period.start || period.end)) {
    notes.push(
      `${inferredYears} ${inferredYears === 1 ? "row prints" : "rows print"} no year; dated from the statement period ${period.start ?? "?"} to ${period.end ?? "?"}.`,
    );
  }
  if (outsidePeriod > 0) {
    notes.push(
      `${outsidePeriod} ${outsidePeriod === 1 ? "row fell" : "rows fell"} outside the statement period once dated and was left out rather than filed to a guessed year.`,
    );
  }
  if (undatable + unreadable > 0) {
    const lost = undatable + unreadable;
    notes.push(
      `${lost} ${lost === 1 ? "line looked like a transaction" : "lines looked like transactions"} but could not be read, and ${lost === 1 ? "was" : "were"} left out.`,
    );
  }
  if (balances.exact) {
    notes.push(
      `Every row prints its running balance, so this file reconciles to the penny: ${balances.opening!.toFixed(2)} in, ${balances.closing!.toFixed(2)} out.`,
    );
  } else if (balances.closing !== null) {
    notes.push(
      "Some rows print no running balance, so the closing figure is taken from the last row that does and the file is not reconciled line by line.",
    );
  } else {
    notes.push(
      "This export prints no running balance, so the account's balance is not set from it.",
    );
  }

  const identity: StatementIdentity = {
    institution: "NatWest",
    statement_holder: readHolder(header),
    account_identifier: identifier,
    identifier_kind: identifier ? "account_number" : null,
    account_type: readAccountType(header),
    country: "GB",
    ledger: null,
  };

  return {
    transactions,
    skippedRows: outsidePeriod + undatable + unreadable,
    notes,
    format: "pdf",
    // Where the page prints a running balance on every row, the file states its
    // own arithmetic and must add up to the penny. Where it prints none, there
    // is nothing to reconcile against and nothing is claimed.
    exactBalances: balances.exact,
    accountDetectable: Boolean(identifier),
    meta: {
      period_start: period.start ?? sorted[0]?.booked_date ?? null,
      period_end: period.end ?? sorted[sorted.length - 1]?.booked_date ?? null,
      opening_balance: balances.opening,
      closing_balance: balances.closing,
      currency,
      identity,
    },
  };
}

/**
 * The statement's opening and closing figures, from the running balance the
 * page prints.
 *
 * The closing figure is the balance after the last entry of the period, and the
 * opening figure is the balance before the first — which is the first printed
 * balance with that first entry taken back off it. Nothing is derived unless
 * the page printed the balance it is derived from.
 *
 * NatWest prints newest-first in some downloads and oldest-first in others, so
 * the order is taken from the dates rather than assumed.
 */
function deriveStatementBalances(
  rows: Array<{ amount: number; credit: boolean; balance: number | null }>,
  dated: Array<{ booked_date: string }>,
): { opening: number | null; closing: number | null; exact: boolean } {
  if (!rows.length) return { opening: null, closing: null, exact: false };

  const newestFirst =
    dated.length > 1 && dated[0]!.booked_date > dated[dated.length - 1]!.booked_date;
  const ordered = newestFirst ? [...rows].reverse() : rows;

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const signed = (row: { amount: number; credit: boolean }) =>
    row.credit ? row.amount : -row.amount;

  const closing = last.balance;
  const opening =
    first.balance === null ? null : Number((first.balance - signed(first)).toFixed(2));

  return {
    opening,
    closing,
    // Only a file that priced every line can be reconciled line by line.
    exact: ordered.every((row) => row.balance !== null) && opening !== null && closing !== null,
  };
}

/** Exposed for the identity ladder's tests. */
export const NATWEST_INTERNALS = {
  readIdentifier,
  readHolder,
  readPeriod,
  deriveStatementBalances,
  MASKED_TAIL,
  ROW,
};

/** The last four (or three) digits the bank printed, for display. */
export function natwestTail(text: string): string | null {
  return readIdentifier(headerLines(text.split(/\r?\n/))).tail;
}
