/**
 * CAMT.053 (ISO 20022 XML) — read by code, never by a model.
 *
 * The schema is unambiguous: every field is where the specification says it
 * is, so putting a language model anywhere near this format would only invent
 * an error rate where none needs to exist. Nothing here calls the network.
 *
 * One file may carry several `Stmt` elements — banks routinely export several
 * accounts, or several periods, in one document — so this returns a list, and
 * each becomes its own statement record matched to its own account.
 *
 * Version-agnostic by construction. Banks offer anything from
 * `camt.053.001.02` to `camt.053.001.10`, sometimes in the same download, and
 * the household should never have to care which. Elements are matched by local
 * name with the namespace stripped, nothing is validated against an XSD, and
 * every field is read tolerantly — a code that is plain text in .02 and a
 * composite from .08 onward reads the same either way. The namespace is read
 * for one purpose only: to record which version a file was, so an oddity can
 * be traced back to its source later.
 */
import { XMLParser } from "fast-xml-parser";
import { bankFromBic } from "../ai/banks";
import type { ExtractionResult, StatementIdentity } from "../statement-extract.server";
import type { RawTransaction } from "../statement-parse.server";
import { StatementFailure } from "./failure";


/* -------------------------------------------------------------- primitives */

type Unknown = unknown;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Walks a path of element names, tolerating absent branches. */
function at(node: Unknown, ...path: string[]): Unknown {
  let cursor: Unknown = node;
  for (const step of path) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[step];
    if (Array.isArray(cursor)) cursor = cursor[0];
  }
  return cursor;
}

/**
 * Every occurrence of the final element, not just the first.
 *
 * The distinction is the whole statement: `Ntry`, `Bal` and `TxDtls` repeat,
 * and reading only the first would silently drop transactions and lose the
 * closing balance — a quiet, plausible, wrong statement.
 */
function list(node: Unknown, ...path: string[]): Unknown[] {
  const last = path[path.length - 1];
  if (!last) return asArray(node);
  const parent = path.length > 1 ? at(node, ...path.slice(0, -1)) : node;
  if (parent === null || parent === undefined || typeof parent !== "object") return [];
  return asArray((parent as Record<string, unknown>)[last]);
}

/** The text of an element, whether it carries attributes or not. */
function text(node: Unknown): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const inner = (node as Record<string, unknown>)["#text"];
    if (typeof inner === "string") return inner.trim() || null;
    if (typeof inner === "number") return String(inner);
  }
  return null;
}

function attr(node: Unknown, name: string): string | null {
  if (node && typeof node === "object") {
    const value = (node as Record<string, unknown>)[`@_${name}`];
    if (typeof value === "string") return value.trim() || null;
  }
  return null;
}

export type Money = { value: number; currency: string | null };

function money(node: Unknown): Money | null {
  const raw = text(node);
  if (raw === null) return null;
  // ISO 20022 amounts are plain decimals; a stray separator is tolerated
  // rather than trusted, because a wrong amount is worse than a skipped one.
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, raw.includes(".") ? "" : ".");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return { value, currency: attr(node, "Ccy") };
}

/** `Dt` (a date) or `DtTm` (a timestamp) reduced to yyyy-mm-dd. */
function isoDate(node: Unknown): string | null {
  const raw = text(node) ?? text(at(node, "Dt")) ?? text(at(node, "DtTm"));
  if (!raw) return null;
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0]! : null;
}

/**
 * A code that may be plain text or a composite, read the same way either way.
 *
 * This single tolerance is what makes the reader version-agnostic. `Sts` is
 * `<Sts>BOOK</Sts>` in .02 and `<Sts><Cd>BOOK</Cd></Sts>` from .08; balance
 * types, account types and transaction codes moved the same way at various
 * points. Take the element's own text when it has one, otherwise its `Cd`, and
 * fall back to a proprietary code — never branch on the schema version.
 */
function codeOf(node: Unknown): string | null {
  return (
    text(node) ??
    text(at(node, "Cd")) ??
    text(at(node, "Prtry")) ??
    text(at(node, "Prtry", "Cd")) ??
    text(at(node, "CdOrPrtry", "Cd")) ??
    text(at(node, "CdOrPrtry", "Prtry")) ??
    text(at(node, "CdOrPrtry")) ??
    null
  );
}

/** A flag that may be `true`, `1` or `Y`, and may be wrapped like a code. */
function flag(node: Unknown): boolean {
  const raw = (codeOf(node) ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "y" || raw === "yes";
}

const minor = (value: number) => Math.round(value * 100);

/* ------------------------------------------------------------------ detect */

export function looksLikeCamt(sample: string): boolean {
  return /BkToCstmrStmt/.test(sample);
}

/**
 * Which CAMT.053 version the file declares, e.g. `camt.053.001.08`.
 *
 * Recorded, never acted on. The reader behaves identically whatever this says;
 * it exists so that if one file ever reads oddly, the version it came from is
 * on the statement record rather than lost with the upload.
 */
export function camtVersion(xml: string): string | null {
  const match = xml.match(/camt\.053\.001\.(\d{2})/i);
  return match ? `camt.053.001.${match[1]}` : null;
}

/* ------------------------------------------------------------------ parser */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Local names only: `<Ntry>`, `<ns:Ntry>` and `<camt:Ntry>` are one element,
  // and the namespace version never reaches the reading code.
  removeNSPrefix: true,
  processEntities: true,
});

type Direction = "debit" | "credit";

function direction(node: Unknown, fallback: Direction = "debit"): Direction {
  const indicator = (codeOf(at(node, "CdtDbtInd")) ?? "").toUpperCase();
  if (indicator === "CRDT") return "credit";
  if (indicator === "DBIT") return "debit";
  return fallback;
}


function flip(value: Direction): Direction {
  return value === "credit" ? "debit" : "credit";
}

/* --------------------------------------------------------------- identity */

const ACCOUNT_TYPES: Record<string, string> = {
  CACC: "current",
  TRAN: "current",
  SLRY: "current",
  CASH: "cash",
  SVGS: "savings",
  ONDP: "savings",
  CARD: "credit_card",
  CHAR: "current",
  COMM: "current",
  LOAN: "loan",
  MGLD: "mortgage",
  MORT: "mortgage",
  MOMA: "mortgage",
};

function accountType(node: Unknown): string | null {
  const code = codeOf(at(node, "Tp"));
  if (!code) return null;
  const mapped = ACCOUNT_TYPES[code.toUpperCase()];
  if (mapped) return mapped;
  const lower = code.toLowerCase();
  if (lower.includes("sav")) return "savings";
  if (lower.includes("card")) return "credit_card";
  if (lower.includes("curr") || lower.includes("check") || lower.includes("cheq")) return "current";
  return null;
}

function partyName(node: Unknown): string | null {
  return text(at(node, "Nm")) ?? text(at(node, "Pty", "Nm")) ?? null;
}

function readIdentity(stmt: Unknown): {
  identity: StatementIdentity;
  currency: string | null;
} {
  const account = at(stmt, "Acct");
  const iban = text(at(account, "Id", "IBAN"));
  const other = text(at(account, "Id", "Othr", "Id"));
  const scheme = (codeOf(at(account, "Id", "Othr", "SchmeNm")) ?? "").toUpperCase();

  const servicer = at(account, "Svcr", "FinInstnId");
  const bic = text(at(servicer, "BICFI")) ?? text(at(servicer, "BIC"));
  const servicerName = text(at(servicer, "Nm")) ?? (bic ? bankFromBic(bic) : null);

  const identifier = iban ?? other;
  const kind: StatementIdentity["identifier_kind"] = iban
    ? "iban"
    : identifier
      ? scheme.includes("CARD")
        ? "card"
        : "account_number"
      : null;

  const country =
    (iban && /^[A-Z]{2}/.test(iban) ? iban.slice(0, 2) : null) ??
    text(at(servicer, "PstlAdr", "Ctry")) ??
    (bic && bic.length >= 6 ? bic.slice(4, 6) : null);

  const holder = partyName(at(account, "Ownr")) ?? text(at(account, "Nm"));

  return {
    identity: {
      institution: servicerName,
      statement_holder: holder,
      account_identifier: identifier,
      identifier_kind: kind,
      account_type: accountType(account),
      country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
    },
    currency: text(at(account, "Ccy")),
  };
}

/* --------------------------------------------------------------- balances */

type BalanceReading = { value: number; date: string | null };

function readBalances(
  stmt: Unknown,
  currency: string | null,
): { opening: BalanceReading | null; closing: BalanceReading | null; notes: string[] } {
  const byCode = new Map<string, BalanceReading>();
  const notes: string[] = [];

  for (const balance of list(stmt, "Bal")) {
    // `Tp/CdOrPrtry/Cd` in most versions, a plain `Tp/Cd` or bare `Tp` in some
    // dialects — read whichever the file happens to use.
    const code = (
      codeOf(at(balance, "Tp", "CdOrPrtry")) ??
      codeOf(at(balance, "Tp")) ??
      ""
    ).toUpperCase();
    if (!code) continue;

    const amount = money(at(balance, "Amt"));
    if (!amount) continue;
    // A currency other than the account's belongs to a different leg of a
    // multi-currency statement and must not be reconciled against these rows.
    if (currency && amount.currency && amount.currency !== currency) continue;

    const signed =
      (codeOf(at(balance, "CdtDbtInd")) ?? "").toUpperCase() === "DBIT"
        ? -Math.abs(amount.value)
        : Math.abs(amount.value);


    // The first of a repeated code wins: banks list the statement's own pair
    // before any supplementary readings.
    if (!byCode.has(code)) byCode.set(code, { value: signed, date: isoDate(at(balance, "Dt")) });
  }

  const opening = byCode.get("OPBD") ?? byCode.get("PRCD") ?? byCode.get("OPAV") ?? null;
  const closing = byCode.get("CLBD") ?? byCode.get("CLAV") ?? byCode.get("ITBD") ?? null;

  if (!byCode.has("OPBD") && opening) {
    notes.push(
      byCode.has("PRCD")
        ? "Opening balance taken from the previously closed booked balance."
        : "Opening balance taken from the available balance — the booked opening was not stated.",
    );
  }
  if (!byCode.has("CLBD") && closing) {
    notes.push("Closing balance taken from the available balance rather than the booked balance.");
  }

  return { opening, closing, notes };
}

/* ------------------------------------------------------------ transactions */

type Detail = {
  merchant: string | null;
  reference: string | null;
  remittance: string | null;
  bankReference: string | null;
  amount: Money | null;
  direction: Direction | null;
  original: Money | null;
  fxRate: number | null;
};

/**
 * What the payment says about itself.
 *
 * Structured remittance wins wherever both are present — a creditor reference
 * or an invoice number is the bank's own identifier for the payment, while the
 * unstructured line is free text a person typed. Newer versions populate the
 * structured block far more often, and taking it is most of the gain from
 * them; the free-text line remains the fallback for .02 files and for banks
 * that never fill the structured block in.
 */
function remittanceOf(txDetail: Unknown): string | null {
  const info = at(txDetail, "RmtInf");

  const structured = list(info, "Strd")
    .flatMap((entry) =>
      [
        text(at(entry, "CdtrRefInf", "Ref")),
        text(at(entry, "RfrdDocInf", "Nb")),
        text(at(entry, "AddtlRmtInf")),

      ].filter((line): line is string => Boolean(line)),
    )
    .filter((line, index, all) => all.indexOf(line) === index);
  if (structured.length) return structured.join(" ").replace(/\s+/g, " ").trim();

  const unstructured = list(info, "Ustrd")
    .map((line) => text(line))
    .filter((line): line is string => Boolean(line));
  return unstructured.length ? unstructured.join(" ").replace(/\s+/g, " ").trim() : null;
}


/** The other side of the transaction: who was paid, or who paid. */
function counterparty(txDetail: Unknown, flow: Direction): string | null {
  const parties = at(txDetail, "RltdPties");
  const creditor = partyName(at(parties, "Cdtr"));
  const debtor = partyName(at(parties, "Dbtr"));
  const preferred = flow === "debit" ? creditor : debtor;
  return preferred ?? (flow === "debit" ? debtor : creditor) ?? null;
}

function foreignAmount(txDetail: Unknown): { original: Money | null; rate: number | null } {
  const details = at(txDetail, "AmtDtls");
  if (!details) return { original: null, rate: null };

  const instructed = money(at(details, "InstdAmt", "Amt"));
  const counterValue = money(at(details, "CntrValAmt", "Amt"));

  const rateText =
    text(at(details, "InstdAmt", "CcyXchg", "XchgRate")) ??
    text(at(details, "TxAmt", "CcyXchg", "XchgRate")) ??
    text(at(details, "CntrValAmt", "CcyXchg", "XchgRate"));
  const rate = rateText ? Number(rateText) : null;

  return {
    original: instructed ?? counterValue,
    rate: rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null,
  };
}

function readDetail(txDetail: Unknown, entryFlow: Direction): Detail {
  const flow = direction(txDetail, entryFlow);
  const { original, rate } = foreignAmount(txDetail);
  return {
    merchant: counterparty(txDetail, flow),
    reference:
      text(at(txDetail, "Refs", "EndToEndId")) ??
      text(at(txDetail, "Refs", "TxId")) ??
      text(at(txDetail, "Refs", "MsgId")),
    remittance: remittanceOf(txDetail) ?? text(at(txDetail, "AddtlTxInf")),
    bankReference: text(at(txDetail, "Refs", "AcctSvcrRef")),
    amount: money(at(txDetail, "Amt")),
    direction: flow,
    original,
    fxRate: rate,
  };
}

function describe(merchant: string | null, detail: string | null, fallback: string | null): string {
  const parts = [merchant, detail]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0);
  const unique = parts.filter(
    (part, index) =>
      parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index,
  );
  const joined = unique.join(" · ").trim();
  return (joined || (fallback ?? "").trim() || "Transaction").slice(0, 300);
}

const NON_REFERENCES = new Set(["NONREF", "NOTPROVIDED", "NOTREF", "NA", "N/A", "-"]);

function usableReference(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 4) return null;
  if (NON_REFERENCES.has(trimmed.toUpperCase())) return null;
  return trimmed.slice(0, 120);
}

/* ------------------------------------------------------------------ export */

export function parseCamt053(xml: string): ExtractionResult[] {
  let document: Record<string, unknown>;
  try {
    document = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new StatementFailure(
      "This XML file could not be read. Re-export the CAMT.053 statement from your bank — the file looks truncated or corrupted.",
    );
  }

  const envelope = (at(document, "Document") ?? document) as Record<string, unknown> | undefined;
  const wrapper = envelope?.["BkToCstmrStmt"];
  const root = (Array.isArray(wrapper) ? wrapper[0] : wrapper) as
    Record<string, unknown> | undefined;
  const statements = asArray(root?.["Stmt"] as Unknown);

  if (!statements.length) {
    throw new StatementFailure(
      "This XML file has no bank-to-customer statement in it. Export CAMT.053 (account statement) rather than CAMT.052 or CAMT.054.",
    );
  }

  return statements.map((stmt, index) => readStatement(stmt, index, statements.length));
}

function readStatement(stmt: Unknown, index: number, total: number): ExtractionResult {
  const { identity, currency } = readIdentity(stmt);
  const notes: string[] = [];
  if (total > 1) notes.push(`Statement ${index + 1} of ${total} in this file.`);

  const statementReference = text(at(stmt, "Id")) ?? text(at(stmt, "ElctrncSeqNb"));
  const { opening, closing, notes: balanceNotes } = readBalances(stmt, currency);
  notes.push(...balanceNotes);
  if (!opening || !closing) {
    notes.push(
      "This statement does not state both an opening and a closing balance, so its arithmetic could not be checked.",
    );
  }

  const transactions: RawTransaction[] = [];
  let pending = 0;
  let skippedRows = 0;
  let splitEntries = 0;

  for (const entry of list(stmt, "Ntry")) {
    const status = (codeOf(at(entry, "Sts")) ?? "BOOK").toUpperCase();
    if (status !== "BOOK") {
      // A pending entry books later; importing it now would double-count it.
      pending += 1;
      continue;
    }

    const entryAmount = money(at(entry, "Amt"));
    const bookedDate = isoDate(at(entry, "BookgDt")) ?? isoDate(at(entry, "ValDt"));
    if (!entryAmount || !bookedDate) {
      skippedRows += 1;
      continue;
    }

    const reversed = (text(at(entry, "RvslInd")) ?? "").toLowerCase() === "true";
    const entryFlow = reversed ? flip(direction(entry)) : direction(entry);
    const valueDate = isoDate(at(entry, "ValDt"));
    const entryReference = usableReference(
      text(at(entry, "AcctSvcrRef")) ?? text(at(entry, "NtryRef")),
    );
    const txCode =
      codeOf(at(entry, "BkTxCd", "Domn", "Fmly", "SubFmlyCd")) ??
      codeOf(at(entry, "BkTxCd", "Domn", "Cd")) ??
      codeOf(at(entry, "BkTxCd", "Prtry"));
    const entryInfo = text(at(entry, "AddtlNtryInf"));

    const details = list(entry, "NtryDtls")
      .flatMap((block) => list(block, "TxDtls"))
      .map((txDetail) => readDetail(txDetail, entryFlow));

    const push = (row: {
      amount: number;
      flow: Direction;
      detail: Detail | null;
      reference: string | null;
    }) => {
      const detail = row.detail;
      const merchant = detail?.merchant ?? null;
      const description = describe(merchant, detail?.remittance ?? null, entryInfo ?? txCode);
      const original =
        detail?.original && detail.original.currency && detail.original.currency !== currency
          ? detail.original
          : null;

      transactions.push({
        booked_date: bookedDate,
        value_date: valueDate,
        description,
        raw_description: [merchant, detail?.remittance, entryInfo, detail?.reference, txCode]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 500),
        merchant: merchant ? merchant.slice(0, 120) : null,
        amount: Math.abs(row.amount),
        direction: row.flow,
        balance_after: null,
        currency: entryAmount.currency ?? currency,
        bank_reference: row.reference,
        bank_tx_code: txCode ? txCode.slice(0, 40) : null,
        original_amount: original ? Math.abs(original.value) : null,
        original_currency: original ? original.currency : null,
        fx_rate: original ? (detail?.fxRate ?? null) : null,
      });
    };

    // A batched entry is several transactions posted as one line. Splitting it
    // is the whole point of the detail block — but only when the parts add up,
    // because a split that does not reconcile is a parsing fault, not a saving.
    if (details.length > 1) {
      const partsTotal = details.reduce((sum, part) => {
        const value = part.amount?.value ?? 0;
        const flow = part.direction ?? entryFlow;
        return sum + (flow === "credit" ? minor(Math.abs(value)) : -minor(Math.abs(value)));
      }, 0);
      const entryTotal =
        entryFlow === "credit"
          ? minor(Math.abs(entryAmount.value))
          : -minor(Math.abs(entryAmount.value));

      if (details.every((part) => part.amount) && partsTotal === entryTotal) {
        splitEntries += 1;
        for (const part of details) {
          push({
            amount: Math.abs(part.amount!.value),
            flow: part.direction ?? entryFlow,
            detail: part,
            reference: usableReference(part.bankReference ?? part.reference) ?? entryReference,
          });
        }
        continue;
      }

      notes.push(
        `One batched entry on ${bookedDate} was kept whole: its ${details.length} parts do not add up to the entry total.`,
      );
    }

    push({
      amount: Math.abs(entryAmount.value),
      flow: entryFlow,
      detail: details[0] ?? null,
      reference: entryReference ?? usableReference(details[0]?.bankReference ?? null),
    });
  }

  if (pending) {
    notes.push(
      `${pending} pending ${pending === 1 ? "entry was" : "entries were"} left out — they import once the bank books them.`,
    );
  }
  if (splitEntries) {
    notes.push(
      `${splitEntries} batched ${splitEntries === 1 ? "entry was" : "entries were"} split into their component transactions.`,
    );
  }

  const dates = transactions.map((row) => row.booked_date).sort();
  const periodStart = isoDate(at(stmt, "FrToDt", "FrDtTm")) ?? dates[0] ?? null;
  const periodEnd = isoDate(at(stmt, "FrToDt", "ToDtTm")) ?? dates[dates.length - 1] ?? null;

  return {
    transactions,
    skippedRows,
    notes,
    format: "camt053",
    exactBalances: opening !== null && closing !== null,
    accountDetectable: Boolean(identity.account_identifier),
    statementReference,
    meta: {
      period_start: periodStart,
      period_end: periodEnd,
      opening_balance: opening?.value ?? null,
      closing_balance: closing?.value ?? null,
      currency: currency ? currency.toUpperCase() : null,
      identity,
    },
  };
}
