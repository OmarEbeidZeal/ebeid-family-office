/**
 * QIF (Quicken Interchange Format) — read by code, never by a model.
 *
 * The weakest of the three structured formats and honest about it: QIF carries
 * no account number and no balances, so a QIF import cannot identify its own
 * account and its arithmetic cannot be checked. Everything it does carry —
 * date, amount, payee, memo — is exact.
 */
import { guessMerchant } from "../text";
import { EMPTY_IDENTITY, type ExtractionResult } from "../statement-extract.server";
import {
  inferDateOrder,
  parseAmountCell,
  parseDateCell,
  type DateFormat,
  type RawTransaction,
} from "../statement-parse.server";
import { StatementFailure } from "./failure";

export function looksLikeQif(sample: string): boolean {
  return /^\s*!(type|account|option)/im.test(sample);
}

type QifRecord = {
  account: string | null;
  date: string | null;
  amount: string | null;
  payee: string | null;
  memo: string | null;
  number: string | null;
  category: string | null;
  splits: number;
};

/** Quicken writes 12/31'24 and 31/12/2024 alike; both become 31/12/2024. */
function tidyDate(value: string): string {
  return value.replace(/'/g, "/").replace(/\s+/g, "").trim();
}

function parseRecords(text: string): {
  records: QifRecord[];
  accounts: string[];
  type: string | null;
} {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const records: QifRecord[] = [];
  const accounts: string[] = [];
  let type: string | null = null;
  let currentAccount: string | null = null;
  let inAccountBlock = false;

  let current: QifRecord | null = null;
  let accountName: string | null = null;

  const flush = () => {
    if (inAccountBlock) {
      if (accountName) {
        currentAccount = accountName;
        if (!accounts.includes(accountName)) accounts.push(accountName);
      }
      accountName = null;
      inAccountBlock = false;
      current = null;
      return;
    }
    if (current && (current.date || current.amount)) records.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("!")) {
      flush();
      const header = line.slice(1).toLowerCase();
      if (header.startsWith("account")) inAccountBlock = true;
      else if (header.startsWith("type:")) {
        type = header.slice(5).trim();
        inAccountBlock = header.slice(5).trim().startsWith("account");
      }
      continue;
    }

    if (line === "^") {
      flush();
      continue;
    }

    const code = line[0]!;
    const value = line.slice(1).trim();

    if (inAccountBlock) {
      if (code === "N") accountName = value.slice(0, 80);
      continue;
    }

    current ??= {
      account: currentAccount,
      date: null,
      amount: null,
      payee: null,
      memo: null,
      number: null,
      category: null,
      splits: 0,
    };

    switch (code) {
      case "D":
        current.date = tidyDate(value);
        break;
      case "T":
      case "U":
        current.amount ??= value;
        break;
      case "P":
        current.payee = value.slice(0, 160);
        break;
      case "M":
        current.memo = value.slice(0, 200);
        break;
      case "N":
        current.number = value.slice(0, 24);
        break;
      case "L":
        current.category = value.slice(0, 80);
        break;
      case "S":
        current.splits += 1;
        break;
      default:
        break;
    }
  }
  flush();

  return { records, accounts, type };
}

export function parseQif(text: string): ExtractionResult[] {
  const { records, accounts, type } = parseRecords(text);

  if (type && /invst|invest/.test(type)) {
    throw new StatementFailure(
      "This QIF holds investment transactions rather than bank transactions. Record buys and sells under Portfolio → Trades instead.",
    );
  }
  if (!records.length) {
    throw new StatementFailure(
      "No transactions could be read from this QIF file. Check the export contains a transaction register rather than a category or account list.",
    );
  }

  const order: DateFormat =
    inferDateOrder(records.map((row) => row.date ?? "").filter(Boolean)) ?? "auto";

  const grouped = new Map<string | null, QifRecord[]>();
  for (const record of records) {
    const key = record.account;
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  }

  const groups = [...grouped.entries()];
  return groups.map(([account, rows], index) =>
    buildResult(rows, account, order, index, groups.length, accounts),
  );
}

function buildResult(
  rows: QifRecord[],
  account: string | null,
  order: DateFormat,
  index: number,
  total: number,
  accounts: string[],
): ExtractionResult {
  const transactions: RawTransaction[] = [];
  const notes: string[] = [];
  let skippedRows = 0;
  let splits = 0;

  if (total > 1) notes.push(`Register ${index + 1} of ${total} in this file.`);
  notes.push(
    "QIF carries no balances, so this statement's arithmetic could not be checked against the bank's own figures.",
  );
  if (account) notes.push(`The file names this register "${account}".`);
  else if (accounts.length) notes.push(`The file names the account "${accounts[0]}".`);

  for (const row of rows) {
    const bookedDate = parseDateCell(row.date, order);
    const parsed = parseAmountCell(row.amount);
    if (!bookedDate || !parsed || parsed.value === 0) {
      skippedRows += 1;
      continue;
    }
    if (row.splits) splits += 1;

    const payee = row.payee?.trim() || null;
    const description =
      [payee, row.memo?.trim() || null, row.number ? `Cheque ${row.number}` : null]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 300) || "Transaction";

    transactions.push({
      booked_date: bookedDate,
      value_date: null,
      description,
      raw_description: [row.payee, row.memo, row.category, row.number]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 500),
      merchant: payee ? payee.slice(0, 120) : guessMerchant(description),
      amount: Math.abs(parsed.value),
      direction: parsed.explicitSign ?? (parsed.value < 0 ? "debit" : "credit"),
      balance_after: null,
      currency: null,
      bank_reference: null,
      bank_tx_code: null,
      original_amount: null,
      original_currency: null,
      fx_rate: null,
    });
  }

  if (splits) {
    notes.push(
      `${splits} ${splits === 1 ? "record was" : "records were"} split across categories in the file; each was imported at its full amount and can be split again here.`,
    );
  }

  const dates = transactions.map((row) => row.booked_date).sort();

  return {
    transactions,
    skippedRows,
    notes,
    format: "qif",
    exactBalances: false,
    accountDetectable: false,
    statementReference: account,
    meta: {
      period_start: dates[0] ?? null,
      period_end: dates[dates.length - 1] ?? null,
      opening_balance: null,
      closing_balance: null,
      currency: null,
      identity: { ...EMPTY_IDENTITY },
    },
  };
}
