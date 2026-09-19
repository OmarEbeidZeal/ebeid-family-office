/**
 * Reading a Monzo data export — and telling the current account apart from the
 * Flex credit line.
 *
 * Monzo prints the same eighteen columns for both ledgers and names neither.
 * Read naively they pool into one account, which is how a household's card
 * spending came to sit in the same place as its credit line, with every
 * repayment counted twice: once leaving the current account, once arriving on
 * Flex. The two are told apart by what is in the file rather than by its name.
 *
 * Everything here is deterministic. The export carries Monzo's own transaction
 * id, which is a perfect duplicate key, the local amount and currency for a
 * payment made abroad, and the household's own category from the Monzo app —
 * all of it better evidence than a model reading the same rows.
 */
import type { ExtractionResult, StatementIdentity } from "../statement-extract.server";
import {
  guessMerchant,
  parseAmountCell,
  parseDateCell,
  type RawTransaction,
} from "../statement-parse.server";
import { normaliseHeader } from "./providers";

export type MonzoLedger = "current" | "flex";

/** Header tokens, normalised: "Notes and #tags" → "notesandtags". */
const REQUIRED = ["transactionid", "notesandtags"];

const COLUMNS = {
  id: ["transactionid"],
  date: ["date"],
  time: ["time"],
  type: ["type"],
  name: ["name"],
  category: ["category"],
  amount: ["amount"],
  currency: ["currency"],
  localAmount: ["localamount"],
  localCurrency: ["localcurrency"],
  notes: ["notesandtags"],
  description: ["description"],
  moneyOut: ["moneyout"],
  moneyIn: ["moneyin"],
} as const;

type ColumnMap = Record<keyof typeof COLUMNS, number>;

const HEADER_SEARCH_ROWS = 10;

function headerRow(rows: string[][]): { index: number; cells: string[] } | null {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let index = 0; index < limit; index += 1) {
    const cells = (rows[index] ?? []).map(normaliseHeader);
    if (REQUIRED.every((token) => cells.includes(token))) return { index, cells };
  }
  return null;
}

function mapColumns(cells: string[]): ColumnMap {
  const find = (names: readonly string[]) => {
    for (const name of names) {
      const at = cells.indexOf(name);
      if (at >= 0) return at;
    }
    return -1;
  };
  return Object.fromEntries(
    Object.entries(COLUMNS).map(([key, names]) => [key, find(names)]),
  ) as ColumnMap;
}

export function looksLikeMonzo(rows: string[][]): boolean {
  return headerRow(rows) !== null;
}

const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");

/**
 * Which of Monzo's two ledgers this file is.
 *
 * A Flex export says so twice over: it carries purchases the household moved
 * onto the plan ("Paid for by Flex"), and it holds none of the machinery a
 * current account cannot do without — no direct debits, no faster payments, no
 * salary. Either signal alone is enough; both together leave no doubt.
 */
export function detectLedger(rows: string[][], columns: ColumnMap): MonzoLedger {
  let sawFlexType = false;
  let onlyCardOrFlex = true;
  let sawAnyRow = false;

  for (const row of rows) {
    const type = cell(row, columns.type).toLowerCase();
    const note = cell(row, columns.notes).toLowerCase();
    if (!type && !note) continue;
    sawAnyRow = true;

    if (note.includes("paid for by flex")) return "flex";
    if (type === "flex") sawFlexType = true;
    else if (type !== "card payment") onlyCardOrFlex = false;
  }

  return sawAnyRow && sawFlexType && onlyCardOrFlex ? "flex" : "current";
}

/**
 * Monzo's own categories, mapped onto the household's.
 *
 * The household already sorted these in the Monzo app, so the label in the file
 * is its own answer, not a guess — and it costs nothing to read. Only the
 * unambiguous ones are mapped: Monzo's "Shopping" and "General" have no
 * counterpart here, and inventing one would be worse than letting the rules and
 * the categoriser look at the merchant.
 */
const CATEGORY_MAP: Record<string, string> = {
  bills: "Utilities",
  charity: "Charity / Zakat",
  coffee: "Dining",
  desserts: "Dining",
  "eating out": "Dining",
  family: "Family Support",
  groceries: "Groceries",
  holidays: "Travel",
  savings: "Savings Transfer",
  transport: "Transport",
};

/**
 * Flex is a financing facility, not a shop.
 *
 * Money labelled `Flex` is the household borrowing from itself and paying
 * itself back: a drawdown onto the credit line, or an instalment leaving the
 * current account for it. Both sides appear in the exports, and counting
 * either as spending or income double-counts a purchase that is already
 * recorded where it happened.
 *
 * What is not financing is a purchase that happens to sit on the Flex ledger —
 * a named merchant on a Flex row. That is real spending, once, on the credit
 * line. Marking those internal too would quietly delete them from the
 * household's outgoings, which is the same class of error in the other
 * direction.
 */
function isFinancing(
  ledger: MonzoLedger,
  type: string,
  category: string,
  name: string,
  note: string,
): boolean {
  const kind = type.trim().toLowerCase();
  const payee = name.trim().toLowerCase();

  if (kind === "flex") {
    // On the current account, every Flex line is money moving to the credit
    // line — the purchase itself is on the other ledger.
    if (ledger === "current") return true;
    // On the credit line, an instalment or repayment names nobody, or names
    // the facility itself.
    if (!payee) return true;
    if (category.trim().toLowerCase() === "transfers") return true;
    return /^(monzo )?flex\b/.test(payee) || /repayment|instal?ment/.test(`${payee} ${note.toLowerCase()}`);
  }

  // A current-account row paying the facility by name.
  return ledger === "current" && /^(monzo )?flex$/.test(payee);
}

function modal(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!/^[A-Z]{3}$/.test(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

export function parseMonzo(rows: string[][]): ExtractionResult {
  const header = headerRow(rows);
  if (!header) {
    return {
      transactions: [],
      meta: {
        period_start: null,
        period_end: null,
        opening_balance: null,
        closing_balance: null,
        currency: null,
        identity: emptyIdentity(),
      },
      skippedRows: 0,
      notes: ["This does not read as a Monzo export."],
      format: "csv",
    };
  }

  const columns = mapColumns(header.cells);
  const body = rows
    .slice(header.index + 1)
    .filter((row) => row.some((value) => (value ?? "").trim().length > 0));

  const ledger = detectLedger(body, columns);
  const transactions: RawTransaction[] = [];
  const currencies: string[] = [];
  let skippedRows = 0;
  let repayments = 0;
  let purchasesOnFlex = 0;
  let converted = 0;
  let hinted = 0;

  for (const row of body) {
    const date = parseDateCell(cell(row, columns.date), "DMY");
    if (!date) {
      skippedRows += 1;
      continue;
    }

    // Monzo prints the signed amount, and prints it again split across Money
    // Out and Money In. The signed column is authoritative; the pair is the
    // fallback for an export that dropped it.
    const signed = parseAmountCell(cell(row, columns.amount));
    const out = parseAmountCell(cell(row, columns.moneyOut));
    const into = parseAmountCell(cell(row, columns.moneyIn));
    const value =
      signed?.value ??
      (out ? -Math.abs(out.value) : null) ??
      (into ? Math.abs(into.value) : null) ??
      null;
    if (value === null || !Number.isFinite(value)) {
      skippedRows += 1;
      continue;
    }

    const type = cell(row, columns.type);
    const name = cell(row, columns.name);
    const category = cell(row, columns.category);
    const note = cell(row, columns.notes);
    const printed = cell(row, columns.description);
    const currency = (cell(row, columns.currency) || "GBP").toUpperCase();
    currencies.push(currency);

    // The counterparty is the useful description; Monzo's own raw string is
    // kept underneath it, because that is what a rule written against a bank
    // statement matches on.
    const description = name || printed || [type, note].filter(Boolean).join(" ") || "Monzo entry";
    const localCurrency = cell(row, columns.localCurrency).toUpperCase();
    const localAmount = parseAmountCell(cell(row, columns.localAmount));

    const foreign =
      localCurrency && localCurrency !== currency && localAmount && Math.abs(localAmount.value) > 0;
    if (foreign) converted += 1;

    const internal = isFinancing(ledger, type, category, name, note);
    if (internal) repayments += 1;
    else if (type.trim().toLowerCase() === "flex") purchasesOnFlex += 1;

    const hint = CATEGORY_MAP[category.toLowerCase()] ?? null;
    if (hint) hinted += 1;

    transactions.push({
      booked_date: date,
      description: description.slice(0, 300),
      raw_description: (printed || description).slice(0, 500),
      merchant: name || guessMerchant(description),
      amount: Math.abs(value),
      direction: value < 0 ? "debit" : "credit",
      balance_after: null,
      currency,
      bank_reference: cell(row, columns.id) || null,
      bank_tx_code: type || null,
      original_amount: foreign ? Math.abs(localAmount!.value) : null,
      original_currency: foreign ? localCurrency : null,
      fx_rate: foreign
        ? Number((Math.abs(localAmount!.value) / Math.abs(value)).toFixed(6))
        : null,
      notes: note || null,
      category_hint: hint,
      internal,
    });
  }

  const dates = transactions.map((row) => row.booked_date).sort();
  const currency = modal(currencies) ?? "GBP";
  const notes: string[] = [];

  notes.push(
    ledger === "flex"
      ? "Read as a Monzo Flex export — the credit line, kept apart from the current account."
      : "Read as a Monzo current account export.",
  );
  if (repayments) {
    notes.push(
      ledger === "flex"
        ? `${repayments} Flex movements — drawdowns and repayments — are marked as financing, not income.`
        : `${repayments} Flex movements leaving for the credit line are marked as financing, not spending.`,
    );
  }
  if (purchasesOnFlex) {
    notes.push(
      `${purchasesOnFlex} purchases sitting on the Flex line keep their merchant and count as spending, once.`,
    );
  }
  if (converted) notes.push(`${converted} payments were made in another currency and keep it.`);
  if (hinted) {
    notes.push(`${hinted} rows carry your own Monzo category and were filed by it.`);
  }

  /**
   * A credit line opens at nothing: nobody owes anything on a plan they have
   * never used. So on a Flex export the running total of the file is the
   * balance, and the household is told the assumption rather than handed a
   * figure with no provenance.
   */
  let opening: number | null = null;
  let closing: number | null = null;
  if (ledger === "flex" && transactions.length) {
    const net = transactions.reduce(
      (sum, row) => sum + (row.direction === "debit" ? -row.amount : row.amount),
      0,
    );
    opening = 0;
    closing = Number(net.toFixed(2));
    notes.push(
      "The balance is the sum of this file, taken from a line that opens at zero. If this export does not start at your first ever Flex purchase, set the balance yourself.",
    );
  }

  if (closing === null) {
    notes.push(
      "A Monzo current account export carries no balance column, so this file leaves the balance unknown rather than estimating one. The balance comes from a statement that prints it, or from you.",
    );
  }

  const identity: StatementIdentity = {
    institution: "Monzo",
    statement_holder: null,
    account_identifier: null,
    identifier_kind: null,
    account_type: ledger === "flex" ? "credit_card" : "current",
    country: "GB",
    ledger: ledger === "flex" ? "flex" : null,
  };

  return {
    transactions,
    meta: {
      period_start: dates[0] ?? null,
      period_end: dates[dates.length - 1] ?? null,
      opening_balance: opening,
      closing_balance: closing,
      currency,
      identity,
    },
    skippedRows,
    notes,
    format: "csv",
    exactBalances: false,
    accountDetectable: true,
  };
}

function emptyIdentity(): StatementIdentity {
  return {
    institution: null,
    statement_holder: null,
    account_identifier: null,
    identifier_kind: null,
    account_type: null,
    country: null,
  };
}
