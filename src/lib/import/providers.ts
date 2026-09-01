/**
 * Recognising an export by the shape of its header row.
 *
 * A Monzo CSV and a Trading 212 CSV both name no bank anywhere in the file, so
 * the pipeline used to treat them as the same nameless account and pool one
 * household's spending with its share dealing. The header row is the giveaway:
 * only Monzo prints "Notes and #tags", only Trading 212 prints "No. of shares".
 *
 * Matching one of these signatures does two things. It names the institution,
 * which is what keeps two different accounts apart. And where the layout is
 * unambiguous — one signed amount column, or a debit/credit pair — it also maps
 * the columns outright, so a known export is read by code rather than sent to a
 * model that could map it differently on a second upload.
 */
import type { ColumnMapping } from "../statement-extract.server";

type AccountType = "current" | "savings" | "credit_card" | "investment" | "loan" | "other";

type Layout = {
  /** Header names for the transaction date, in order of preference. */
  date: string[];
  description: string[];
  amount?: string[];
  debit?: string[];
  credit?: string[];
  balance?: string[];
  currency?: string[];
  dateFormat: "DMY" | "MDY" | "YMD";
  sign: "negative_is_debit" | "positive_is_debit" | "separate_columns";
};

type ProviderSpec = {
  key: string;
  /** Canonical name, matching the bank list so the row carries the right mark. */
  institution: string | null;
  label: string;
  country: string | null;
  accountType: AccountType | null;
  /** Every one of these must appear in the header row. */
  signature: string[];
  /** Columns whose cells, joined, identify the account this file belongs to. */
  identifierColumns?: string[];
  identifierKind?: "account_number" | "iban" | "card";
  /**
   * Present only when the layout is unambiguous. An investment ledger, where a
   * row's meaning depends on an action word rather than a sign, is deliberately
   * left to the reader.
   */
  layout?: Layout;
};

const SPECS: ProviderSpec[] = [
  {
    key: "monzo",
    institution: "Monzo",
    label: "Monzo export",
    country: "GB",
    accountType: "current",
    signature: ["transactionid", "notesandtags"],
    layout: {
      date: ["date"],
      description: ["name", "description"],
      amount: ["amount"],
      currency: ["currency"],
      dateFormat: "DMY",
      sign: "negative_is_debit",
    },
  },
  {
    key: "starling",
    institution: "Starling Bank",
    label: "Starling export",
    country: "GB",
    accountType: "current",
    signature: ["counterparty", "spendingcategory"],
    layout: {
      date: ["date"],
      description: ["counterparty", "reference"],
      amount: ["amount"],
      balance: ["balance"],
      dateFormat: "DMY",
      sign: "negative_is_debit",
    },
  },
  {
    key: "natwest",
    institution: "NatWest",
    label: "NatWest export",
    country: "GB",
    accountType: "current",
    signature: ["accountname", "accountnumber", "value"],
    identifierColumns: ["accountnumber"],
    identifierKind: "account_number",
    layout: {
      date: ["date"],
      description: ["description", "type"],
      amount: ["value"],
      balance: ["balance"],
      dateFormat: "DMY",
      sign: "negative_is_debit",
    },
  },
  {
    // Lloyds, Halifax, Bank of Scotland and TSB all ship this layout, so the
    // file is not asked to name its bank — the sort code and account number in
    // it identify the account far better than a guessed brand would.
    key: "lloyds-group",
    institution: null,
    label: "Lloyds-format export",
    country: "GB",
    accountType: "current",
    signature: ["sortcode", "accountnumber", "debitamount", "creditamount"],
    identifierColumns: ["sortcode", "accountnumber"],
    identifierKind: "account_number",
    layout: {
      date: ["transactiondate", "date"],
      description: ["transactiondescription", "transactiontype"],
      debit: ["debitamount"],
      credit: ["creditamount"],
      balance: ["balance"],
      dateFormat: "DMY",
      sign: "separate_columns",
    },
  },
  {
    key: "barclays",
    institution: "Barclays",
    label: "Barclays export",
    country: "GB",
    accountType: "current",
    signature: ["subcategory", "memo", "account"],
    identifierColumns: ["account"],
    identifierKind: "account_number",
    layout: {
      date: ["date"],
      description: ["memo", "subcategory"],
      amount: ["amount"],
      dateFormat: "DMY",
      sign: "negative_is_debit",
    },
  },
  {
    key: "nationwide",
    institution: "Nationwide",
    label: "Nationwide export",
    country: "GB",
    accountType: "current",
    signature: ["paidout", "paidin", "transactiontype"],
    layout: {
      date: ["date"],
      description: ["description", "transactiontype"],
      debit: ["paidout"],
      credit: ["paidin"],
      balance: ["balance"],
      dateFormat: "DMY",
      sign: "separate_columns",
    },
  },
  {
    key: "amex",
    institution: "American Express",
    label: "American Express export",
    country: "GB",
    accountType: "credit_card",
    signature: ["cardmember", "amount"],
    identifierColumns: ["account"],
    identifierKind: "card",
    layout: {
      date: ["date"],
      description: ["description", "appearsonyourstatementas"],
      amount: ["amount"],
      dateFormat: "DMY",
      // Amex prints a charge as a positive number and a payment as negative.
      sign: "positive_is_debit",
    },
  },
  {
    key: "wise-statement",
    institution: "Wise",
    label: "Wise statement",
    country: "GB",
    accountType: "current",
    signature: ["transferwiseid", "runningbalance"],
    layout: {
      date: ["date"],
      description: ["description", "paymentreference"],
      amount: ["amount"],
      balance: ["runningbalance"],
      currency: ["currency"],
      dateFormat: "DMY",
      sign: "negative_is_debit",
    },
  },
  /* --------------------------- named, but mapped by the reader --------------- */
  {
    // Revolut prints fees in their own column, so a mapping built from Amount
    // alone would quietly disagree with the running balance. The reader keeps
    // the columns; the signature keeps the account separate.
    key: "revolut",
    institution: "Revolut",
    label: "Revolut export",
    country: "GB",
    accountType: "current",
    signature: ["starteddate", "completeddate", "product"],
  },
  {
    key: "trading212",
    institution: "Trading 212",
    label: "Trading 212 export",
    country: "GB",
    accountType: "investment",
    signature: ["action", "noofshares"],
  },
  {
    key: "freetrade",
    institution: "Freetrade",
    label: "Freetrade export",
    country: "GB",
    accountType: "investment",
    signature: ["buysell", "instrumentcurrency"],
  },
  {
    key: "wise-transfers",
    institution: "Wise",
    label: "Wise transfers export",
    country: "GB",
    accountType: "current",
    signature: ["sourcefeecurrency", "targetamount"],
  },
  {
    key: "paypal",
    institution: "PayPal",
    label: "PayPal export",
    country: null,
    accountType: "other",
    signature: ["fromemailaddress", "gross"],
  },
];

/** Header text reduced to letters and digits: "No. of shares" → "noofshares". */
export function normaliseHeader(value: string | undefined | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnIndex(cells: string[], names: string[] | undefined): number {
  if (!names?.length) return -1;
  for (const name of names) {
    const exact = cells.indexOf(name);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const prefixed = cells.findIndex((cell) => cell.startsWith(name) && cell.length > 0);
    if (prefixed >= 0) return prefixed;
  }
  return -1;
}

function matchesSignature(cells: string[], signature: string[]): boolean {
  return signature.every((token) =>
    cells.some((cell) => cell === token || (cell.length > token.length && cell.startsWith(token))),
  );
}

/** "Amount (GBP)" states the currency in its own title. */
function currencyFromHeader(raw: string | undefined): string | null {
  const found = /\(([A-Za-z]{3})\)/.exec(raw ?? "");
  return found?.[1] ? found[1].toUpperCase() : null;
}

function firstNonEmpty(rows: string[][], indexes: number[]): string | null {
  for (const row of rows) {
    const joined = indexes
      .map((index) => (index >= 0 ? (row[index] ?? "").trim() : ""))
      .filter((value) => value.length > 0)
      .join(" ")
      .trim();
    if (joined.length > 0) return joined;
  }
  return null;
}

function modalCurrency(rows: string[][], index: number): string | null {
  if (index < 0) return null;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const cell = (row[index] ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cell)) continue;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
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

export type DetectedProvider = {
  key: string;
  label: string;
  institution: string | null;
  accountType: AccountType | null;
  country: string | null;
  /** As printed in the file — hashed immediately, never stored. */
  accountIdentifier: string | null;
  identifierKind: "account_number" | "iban" | "card" | null;
  currency: string | null;
  /** Present only for layouts read deterministically. */
  mapping: ColumnMapping | null;
  note: string;
};

/** How many rows from the top are searched for a header — preamble is common. */
const HEADER_SEARCH_ROWS = 25;

/**
 * Recognise a known export. Returns null for anything unrecognised, which is
 * every statement from a bank that does not publish a stable CSV layout.
 */
export function detectProvider(rows: string[][]): DetectedProvider | null {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);

  for (let index = 0; index < limit; index += 1) {
    const raw = rows[index];
    if (!raw) continue;
    const cells = raw.map(normaliseHeader);
    if (cells.filter(Boolean).length < 3) continue;

    const spec = SPECS.find((candidate) => matchesSignature(cells, candidate.signature));
    if (!spec) continue;

    const body = rows.slice(index + 1).filter((row) => row.some((cell) => (cell ?? "").trim()));
    if (!body.length) continue;

    const identifierIndexes = (spec.identifierColumns ?? []).map((name) =>
      columnIndex(cells, [name]),
    );
    const accountIdentifier = identifierIndexes.some((position) => position >= 0)
      ? firstNonEmpty(body, identifierIndexes)
      : null;

    let mapping: ColumnMapping | null = null;
    let currency: string | null = null;

    if (spec.layout) {
      const layout = spec.layout;
      const dateColumn = columnIndex(cells, layout.date);
      const amountColumn = columnIndex(cells, layout.amount);
      const debitColumn = columnIndex(cells, layout.debit);
      const creditColumn = columnIndex(cells, layout.credit);
      const currencyColumn = columnIndex(cells, layout.currency);
      const amountish = amountColumn >= 0 || (debitColumn >= 0 && creditColumn >= 0);

      // A file that matched the signature but lost its date or amount column is
      // not read deterministically — the reader gets it instead of a guess.
      if (dateColumn >= 0 && amountish) {
        currency =
          modalCurrency(body, currencyColumn) ??
          currencyFromHeader(raw[amountColumn >= 0 ? amountColumn : debitColumn]) ??
          currencyFromHeader(raw[columnIndex(cells, layout.balance ?? [])]);

        const descriptionColumns = layout.description
          .map((name) => columnIndex(cells, [name]))
          .filter((position) => position >= 0);

        mapping = {
          header_row_index: index,
          date_column: dateColumn,
          description_columns: descriptionColumns.length ? descriptionColumns : [dateColumn + 1],
          amount_column: amountColumn,
          debit_column: debitColumn,
          credit_column: creditColumn,
          balance_column: columnIndex(cells, layout.balance),
          currency_column: currencyColumn,
          date_format: layout.dateFormat,
          amount_sign_convention: layout.sign,
          currency_code: currency ?? "",
          notes: `Read as a ${spec.label}.`,
          institution: spec.institution ?? "",
          statement_holder: "",
          account_identifier: accountIdentifier ?? "",
          identifier_kind: accountIdentifier ? (spec.identifierKind ?? "account_number") : "",
          account_type: spec.accountType ?? "",
          country: spec.country ?? "",
        };
      }
    }

    return {
      key: spec.key,
      label: spec.label,
      institution: spec.institution,
      accountType: spec.accountType,
      country: spec.country,
      accountIdentifier,
      identifierKind: accountIdentifier ? (spec.identifierKind ?? "account_number") : null,
      currency,
      mapping,
      note: mapping
        ? `Read as a ${spec.label} — columns matched by their headings, not inferred.`
        : `Recognised as a ${spec.label}.`,
    };
  }

  return null;
}
