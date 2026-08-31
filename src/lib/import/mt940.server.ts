/**
 * MT940 (SWIFT customer statement) — read by code, never by a model.
 *
 * Cruder than CAMT.053: the narrative in `:86:` is semi-structured at best.
 * But the amounts, the dates and the balances are exact and positional, so
 * nothing about the money is ever inferred.
 *
 * One file can hold several statements — a new `:20:` starts each — so this
 * returns a list.
 */
import { bankFromBic } from "../ai/banks";
import { guessMerchant } from "../text";
import type { ExtractionResult, StatementIdentity } from "../statement-extract.server";
import type { RawTransaction } from "../statement-parse.server";
import { StatementFailure } from "./failure";

/* -------------------------------------------------------------- primitives */

/**
 * SWIFT amounts carry a decimal comma and never a thousands separator, so the
 * last separator is always the decimal point. That matters for the dinar:
 * "1234,567" is 1,234.567 JOD, not 1,234,567.
 */
export function swiftAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const cut = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  const normalised =
    cut >= 0
      ? `${cleaned.slice(0, cut).replace(/[,.]/g, "")}.${cleaned.slice(cut + 1) || "0"}`
      : cleaned;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

function isoFromYymmdd(raw: string): string | null {
  const year = Number(raw.slice(0, 2));
  const month = Number(raw.slice(2, 4));
  const day = Number(raw.slice(4, 6));
  return buildIso(year > 70 ? 1900 + year : 2000 + year, month, day);
}

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** `:61:` prints the entry date as MMDD only, so the year comes from the value date. */
function entryDate(valueIso: string, mmdd: string | undefined): string {
  if (!mmdd) return valueIso;
  const month = Number(mmdd.slice(0, 2));
  const day = Number(mmdd.slice(2, 4));
  const valueYear = Number(valueIso.slice(0, 4));
  const valueMonth = Number(valueIso.slice(5, 7));

  let year = valueYear;
  if (month - valueMonth > 6) year -= 1;
  else if (valueMonth - month > 6) year += 1;

  return buildIso(year, month, day) ?? valueIso;
}

/* ------------------------------------------------------------------ detect */

export function looksLikeMt940(sample: string): boolean {
  return /(^|\n)\s*:20:/.test(sample) && /(^|\n)\s*:(61|60[FM]):/.test(sample);
}

/* ------------------------------------------------------------------ fields */

type Field = { tag: string; value: string };

const TAG_LINE = /^:(\d{2}[A-Z]?):(.*)$/;

/** Splits the file into tagged fields, folding continuation lines into them. */
function readFields(text: string): Field[] {
  const body = text
    .replace(/\r\n?/g, "\n")
    // SWIFT envelope blocks, when the file was saved straight off the wire.
    .replace(/^\{[1-3]:[^}]*\}/gm, "")
    .replace(/^\{4:\s*$/gm, "")
    .replace(/^-\}\s*$/gm, "");

  const fields: Field[] = [];
  for (const line of body.split("\n")) {
    const match = line.match(TAG_LINE);
    if (match) {
      fields.push({ tag: match[1]!, value: (match[2] ?? "").trim() });
      continue;
    }
    const current = fields[fields.length - 1];
    if (current && line.trim() && line.trim() !== "-") {
      current.value = `${current.value}\n${line.trim()}`;
    }
  }
  return fields;
}

/* ---------------------------------------------------------------- balances */

type Balance = { value: number; currency: string | null; date: string | null };

const BALANCE = /^([CD])(\d{6})([A-Za-z]{3})([\d.,]+)/;

function readBalance(value: string): Balance | null {
  const match = value.replace(/\s/g, "").match(BALANCE);
  if (!match) return null;
  const amount = swiftAmount(match[4]!);
  if (amount === null) return null;
  return {
    value: match[1] === "D" ? -Math.abs(amount) : Math.abs(amount),
    currency: match[3]!.toUpperCase(),
    date: isoFromYymmdd(match[2]!),
  };
}

/* ------------------------------------------------------------- the :86: line */

const SUBFIELD = /\?(\d{2})([^?]*)/g;
const SEPA_TAG = /\b(EREF|KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE|IBAN|BIC|COAM|OAMT)\+/;

type Narrative = { description: string; merchant: string | null; reference: string | null };

/**
 * `:86:` is free text in principle. In practice banks use one of two
 * conventions, and reading them turns a wall of text into a merchant.
 */
function readNarrative(raw: string | null): Narrative {
  const text = (raw ?? "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { description: "", merchant: null, reference: null };

  if (text.includes("?")) {
    const purpose: string[] = [];
    const name: string[] = [];
    let heading: string | null = null;
    let reference: string | null = null;

    for (const match of text.matchAll(SUBFIELD)) {
      const code = Number(match[1]);
      const value = (match[2] ?? "").trim();
      if (!value) continue;
      if (code === 0) heading = value;
      else if (code >= 20 && code <= 29) purpose.push(value);
      else if (code === 32 || code === 33) name.push(value);
      else if (code === 34 || code === 31) reference ??= value;
    }

    const merchant = name.join(" ").trim() || null;
    const description = [heading, purpose.join(" ").trim()].filter(Boolean).join(" · ").trim();
    return { description: description || text, merchant, reference };
  }

  if (SEPA_TAG.test(text)) {
    const grab = (tag: string) => {
      const match = text.match(
        new RegExp(
          `${tag}\\+(.*?)(?=\\b(?:EREF|KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE|IBAN|BIC|COAM|OAMT)\\+|$)`,
        ),
      );
      return match?.[1]?.trim() || null;
    };
    const purpose = grab("SVWZ");
    const payer = grab("ABWA") ?? grab("ABWE");
    return {
      description: purpose ?? text,
      merchant: payer,
      reference: grab("EREF") ?? grab("KREF"),
    };
  }

  return { description: text, merchant: null, reference: null };
}

/* -------------------------------------------------------------- statements */

const LINE = /^(\d{6})(\d{4})?(RC|RD|EC|ED|C|D)([A-Za-z])?([\d][\d,.]*)([NFS][A-Z0-9]{3})?(.*)$/;

const NON_REFERENCES = new Set(["NONREF", "NOTPROVIDED", "NOTREF", "NA", "N/A", "-", ""]);

function usableReference(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length < 4) return null;
  if (NON_REFERENCES.has(trimmed.toUpperCase())) return null;
  return trimmed.slice(0, 120);
}

const CREDIT_MARKS = new Set(["C", "RD", "ED"]);

function readIdentity(
  accountField: string | null,
  bic: string | null,
  currency: string | null,
): StatementIdentity {
  const raw = (accountField ?? "").replace(/\n/g, " ").trim();
  const parts = raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = parts.length ? parts : raw ? [raw] : [];

  // The identifier is the token carrying the digits; a leading BIC or sort
  // code prefix is a hint about the bank, not the account. A trailing currency
  // code is stripped — but never from something already shaped like an IBAN.
  const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
  let identifier: string | null = null;
  for (const part of candidates) {
    const bare = part.replace(/\s/g, "").toUpperCase();
    const compact = IBAN_SHAPE.test(bare) ? bare : bare.replace(/[A-Z]{3}$/, "");
    const digits = compact.replace(/\D/g, "");
    if (digits.length >= 6) identifier = compact;
  }
  if (!identifier && candidates.length) {
    const compact = candidates[candidates.length - 1]!.replace(/\s/g, "").toUpperCase();
    if (compact.replace(/\D/g, "").length >= 4) identifier = compact;
  }

  const isIban = identifier ? /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(identifier) : false;
  const prefix = candidates.length > 1 ? candidates[0]! : null;
  const institution =
    bankFromBic(bic) ??
    bankFromBic(prefix) ??
    (identifier && isIban ? bankFromBic(identifier.slice(4, 8)) : null);

  const country =
    (identifier && isIban ? identifier.slice(0, 2) : null) ??
    (bic && bic.length >= 6 ? bic.slice(4, 6).toUpperCase() : null) ??
    (currency === "GBP" ? "GB" : currency === "JOD" ? "JO" : currency === "EGP" ? "EG" : null);

  return {
    institution,
    statement_holder: null,
    account_identifier: identifier,
    identifier_kind: identifier ? (isIban ? "iban" : "account_number") : null,
    account_type: null,
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
  };
}

export function parseMt940(text: string): ExtractionResult[] {
  const envelope = text.match(/\{1:F01([A-Z0-9]{8,11})/);
  const headerBic = envelope?.[1] ?? null;

  const fields = readFields(text);
  if (!fields.length) {
    throw new StatementFailure(
      "This file has no MT940 tags in it. Re-export the statement from your bank as MT940.",
    );
  }

  // A new :20: begins a new statement; everything before the first one is
  // envelope noise.
  const blocks: Field[][] = [];
  for (const field of fields) {
    if (field.tag === "20" || !blocks.length) blocks.push([]);
    blocks[blocks.length - 1]!.push(field);
  }

  const results = blocks
    .filter((block) => block.some((field) => field.tag === "61" || field.tag.startsWith("60")))
    .map((block, index, all) => readStatement(block, headerBic, index, all.length));

  if (!results.length) {
    throw new StatementFailure(
      "This MT940 file has no statement lines in it — no `:61:` entries and no balances. Check you exported the transaction list rather than a header.",
    );
  }
  return results;
}

function readStatement(
  block: Field[],
  headerBic: string | null,
  index: number,
  total: number,
): ExtractionResult {
  const first = (tag: string): string | null =>
    block.find((field) => field.tag === tag)?.value ?? null;

  const opening = readBalance(first("60F") ?? first("60M") ?? "");
  const closing = readBalance(first("62F") ?? first("62M") ?? "");
  const available = readBalance(first("64") ?? "");
  const currency = opening?.currency ?? closing?.currency ?? available?.currency ?? null;

  const identity = readIdentity(first("25"), headerBic, currency);
  const notes: string[] = [];
  if (total > 1) notes.push(`Statement ${index + 1} of ${total} in this file.`);
  if (!opening || !closing) {
    notes.push(
      "This statement does not print both an opening and a closing balance, so its arithmetic could not be checked.",
    );
  }

  const transactions: RawTransaction[] = [];
  let skippedRows = 0;
  let reversals = 0;

  for (let position = 0; position < block.length; position += 1) {
    const field = block[position]!;
    if (field.tag !== "61") continue;

    const [head, ...rest] = field.value.split("\n");
    const match = (head ?? "").replace(/\s+/g, " ").trim().match(LINE);
    if (!match) {
      skippedRows += 1;
      continue;
    }

    const valueIso = isoFromYymmdd(match[1]!);
    if (!valueIso) {
      skippedRows += 1;
      continue;
    }
    const amount = swiftAmount(match[5]!);
    if (amount === null || amount === 0) {
      skippedRows += 1;
      continue;
    }

    const mark = match[3]!.toUpperCase();
    const isReversal = mark.startsWith("R") || mark.startsWith("E");
    if (isReversal) reversals += 1;

    const bookedDate = entryDate(valueIso, match[2]);
    const txCode = match[6] ?? null;
    // References live on the `:61:` line itself, before and after the `//`.
    // A continuation line is supplementary detail, not part of the reference —
    // folding it in would corrupt the very key used to spot duplicates.
    const [customerRef, bankRefRaw] = (match[7] ?? "").trim().split("//");
    const supplementary = rest.join(" ").replace(/\s+/g, " ").trim();

    const narrativeField = block[position + 1]?.tag === "86" ? block[position + 1]!.value : null;
    const narrative = readNarrative(narrativeField);

    const body =
      narrative.description || supplementary || customerRef?.trim() || txCode || "Transaction";
    const description = [body, isReversal ? "(reversal)" : null]
      .filter(Boolean)
      .join(" ")
      .slice(0, 300);

    transactions.push({
      booked_date: bookedDate,
      value_date: valueIso,
      description,
      raw_description: `${head ?? ""} ${supplementary} ${narrativeField ?? ""}`
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500),
      // The reversal marker is ours, not the bank's — a merchant is only ever
      // read from what the file actually said.
      merchant: narrative.merchant?.slice(0, 120) ?? guessMerchant(body),

      amount: Math.abs(amount),
      direction: CREDIT_MARKS.has(mark) ? "credit" : "debit",
      balance_after: null,
      currency,
      bank_reference:
        usableReference(bankRefRaw) ??
        usableReference(customerRef) ??
        usableReference(narrative.reference),
      bank_tx_code: txCode,
      original_amount: null,
      original_currency: null,
      fx_rate: null,
    });
  }

  if (reversals) {
    notes.push(
      `${reversals} ${reversals === 1 ? "entry is a reversal and has been" : "entries are reversals and have been"} recorded in the opposite direction.`,
    );
  }

  const dates = transactions.map((row) => row.booked_date).sort();

  return {
    transactions,
    skippedRows,
    notes,
    format: "mt940",
    exactBalances: Boolean(opening && closing),
    accountDetectable: Boolean(identity.account_identifier),
    statementReference: first("28C") ?? first("20"),
    meta: {
      period_start: opening?.date ?? dates[0] ?? null,
      period_end: closing?.date ?? dates[dates.length - 1] ?? null,
      opening_balance: opening?.value ?? null,
      closing_balance: closing?.value ?? null,
      currency: currency ? currency.toUpperCase() : null,
      identity,
    },
  };
}
