/**
 * Working out which account a statement belongs to — without ever storing the
 * account number.
 *
 * A full account number or IBAN is the one piece of a statement that is worth
 * stealing, and the app has no use for it beyond recognising the same account
 * twice. So it is reduced immediately: an HMAC under a server-held salt, plus
 * the last four digits for display. The salted hash is what matches statement
 * to account; the digits are what a human recognises. Neither can be turned
 * back into the number.
 */
import { createHmac } from "node:crypto";
import type { StatementIdentity } from "../statement-extract.server";
import { bankDomain } from "../ai/banks";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type IdentifierKind = "account_number" | "iban" | "card" | "reference";

export type NormalisedIdentifier = {
  kind: IdentifierKind;
  /** Digits and letters only, upper case — what gets hashed. */
  normalised: string;
  /**
   * Null for a `reference`: a composite key has no printed digits to show, and
   * inventing four would put a number on screen the bank never printed.
   */
  lastFour: string | null;
  hash: string;
  /** "•••• 4821" — safe to render anywhere. Null when there is nothing to mask. */
  mask: string | null;
  /**
   * True when this is a whole identifier only one account in the world carries:
   * an IBAN, a full account number, a card number, or a masked tail pinned to a
   * sort code. False for everything softer — a bare `****234`, or a key built
   * out of the bank, the currency and the holder.
   *
   * Only a positive identifier ever files a statement into an account without
   * being asked. Everything else proposes, because merging two people's
   * accounts is a corruption no later screen can undo.
   */
  positive: boolean;
};

function salt(): string {
  const value = process.env["ACCOUNT_IDENTIFIER_SALT"];
  if (!value) {
    throw new Error(
      "Account matching is not configured — the identifier salt is missing. Statements will still import once an account is chosen by hand.",
    );
  }
  return value;
}

export function maskIdentifier(lastFour: string, kind: IdentifierKind): string {
  const prefix = kind === "card" ? "•••• •••• ••••" : "••••";
  return `${prefix} ${lastFour}`;
}


/**
 * The last rung of the identity ladder: no IBAN, no account number, nothing
 * printed to recognise. A CAMT.053 file from Wise is like this — it names the
 * servicing institution, the currency and the account owner, and that trio is
 * stable across every export from the same account.
 *
 * It is a weaker key than an account number and it is treated as one: it never
 * auto-links, it only proposes. Returns null when too little was named for the
 * key to mean anything.
 */
export function compositeAccountKey(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts
    .map((part) => (part ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter((part) => part.length > 0);
  if (cleaned.length < 2) return null;
  const key = cleaned.join("|");
  return key.replace(/\|/g, "").length >= 6 ? key : null;
}

/** Two or more masking characters in a row: `****234`, `xxxx 4821`, `••••234`. */
const MASK_RUN = /(?:[*x×•#]\s*){2,}/i;

/** `54-21-47`, `54 21 47` — a UK sort code, which needs its separators to be one. */
const SORT_CODE = /\b(\d{2})[-\s](\d{2})[-\s](\d{2})\b/;

function institutionKey(institution: string | null | undefined): string {
  return (institution ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Reduce a printed identifier to something matchable. Returns null when what
 * was printed carries too little signal to be worth matching on — a bank that
 * prints only "****" tells us nothing.
 *
 * A masked number is handled apart from a whole one, because the two are not
 * the same kind of evidence. `*****234 · 54-21-47` is as good as an account
 * number: no two accounts share a sort code and a tail, so three years of
 * NatWest downloads land on one account. `****234` on its own is not — plenty
 * of accounts end 234 — so it is kept as a weak key that recognises the same
 * bank's files as each other and never links them to an account by itself.
 */
export function normaliseIdentifier(
  raw: string | null | undefined,
  hint: IdentifierKind | null,
  context?: { institution?: string | null },
): NormalisedIdentifier | null {
  if (!raw) return null;

  if (hint === "reference") {
    const key = raw.toUpperCase().replace(/[^A-Z0-9|]/g, "");
    if (key.replace(/\|/g, "").length < 6) return null;
    return {
      kind: "reference",
      normalised: key,
      lastFour: null,
      hash: createHmac("sha256", salt()).update(`reference:${key}`).digest("hex"),
      mask: null,
      // The bank, the currency and the holder agreeing is a strong hint and
      // nothing more: two sub-accounts can agree on all three.
      positive: false,
    };
  }

  if (MASK_RUN.test(raw)) return maskedIdentifier(raw, hint, context?.institution ?? null);

  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 4) return null;

  const digits = cleaned.replace(/[^0-9]/g, "");
  if (digits.length < 4) return null;

  const kind: IdentifierKind =
    hint ??
    (/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(cleaned)
      ? "iban"
      : digits.length === 16
        ? "card"
        : "account_number");

  const lastFour = digits.slice(-4);
  const hash = createHmac("sha256", salt()).update(`${kind}:${cleaned}`).digest("hex");

  return {
    kind,
    normalised: cleaned,
    lastFour,
    hash,
    mask: maskIdentifier(lastFour, kind),
    positive: true,
  };
}

/**
 * What the bank left visible when it masked its own statement.
 *
 * The tail is hashed with whatever pins it down — a sort code if the page
 * printed one, otherwise the bank's name — so a tail can never collide with a
 * whole account number, and `****234` at one bank can never match `****234`
 * at another.
 */
function maskedIdentifier(
  raw: string,
  hint: IdentifierKind | null,
  institution: string | null,
): NormalisedIdentifier | null {
  const tailMatch = raw.match(/(?:[*x×•#]\s*){2,}\s*(\d{2,6})/i);
  const tail = tailMatch?.[1] ?? null;
  if (!tail) return null;

  const kind: IdentifierKind = hint && hint !== "reference" ? hint : "account_number";
  const sort = raw.match(SORT_CODE);
  const branch = sort ? `${sort[1]}${sort[2]}${sort[3]}` : null;
  const bank = institutionKey(institution);

  // Nothing pins the tail down: not enough to recognise anything by.
  if (!branch && !bank) return null;

  const scope = branch ? `sort:${branch}` : `bank:${bank}`;
  return {
    kind,
    normalised: `${scope}|mask:${tail}`,
    lastFour: tail,
    hash: createHmac("sha256", salt()).update(`${kind}:mask:${scope}:${tail}`).digest("hex"),
    mask: maskIdentifier(tail, kind),
    // A sort code and a tail together name one account. A tail and a bank name
    // a great many, so it proposes rather than links.
    positive: Boolean(branch),
  };
}


/** Hash of just the last four, for matching a masked statement against a known account. */
export function lastFourHash(lastFour: string, kind: IdentifierKind): string {
  return createHmac("sha256", salt()).update(`last4:${kind}:${lastFour}`).digest("hex");
}

/* ------------------------------------------------------------- fingerprint */

/**
 * Labels the app makes up when a file names no bank. They read as a name and
 * are not one, so they must never act as an institution, a match key or part of
 * an account's identity — two files both called "Imported account" have nothing
 * in common but the app's own vocabulary.
 */
const GENERIC_LABELS = new Set([
  "importedaccount",
  "unknown",
  "unknownaccount",
  "unknownbank",
  "account",
  "statement",
  "bank",
  "n/a",
  "na",
  "none",
]);

/**
 * The institution, as something to match on — or null when what is there is a
 * placeholder rather than a bank.
 */
export function meaningfulInstitution(value: string | null | undefined): string | null {
  const key = (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || key.length < 2 || GENERIC_LABELS.has(key)) return null;
  return value!.trim();
}

/** Who the statement was printed for, reduced to something stable to key on. */
function holderKey(holder: string | null | undefined): string {
  return (holder ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

/**
 * A stable key for "this account, at this bank, in this currency". Two files
 * from the same account in the same batch must land on one proposal, not two.
 */
export function proposalFingerprint(input: {
  institution: string | null;
  identifierHash: string | null;
  lastFour: string | null;
  currency: string | null;
  /**
   * A sub-ledger of the same bank, in the same currency, with no account number
   * on either — Monzo Flex beside a Monzo current account. Without it the two
   * share a key and pool into one account, and every repayment between them
   * reads as spending.
   */
  ledger?: string | null;
  /**
   * The name the statement was printed for. It joins the key only where there
   * is no account number to key on: two nameless Trading 212 exports, one
   * Haya's and one Omar's, are otherwise indistinguishable and would be
   * proposed as a single account holding both people's trades.
   */
  holder?: string | null;
}): string {
  const institution = (meaningfulInstitution(input.institution) ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const base = input.identifierHash ?? (input.lastFour ? `l4:${input.lastFour}` : "noid");
  const ledger = (input.ledger ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const holder = input.identifierHash ? "" : holderKey(input.holder);
  const identity = [base, ledger, holder ? `who:${holder}` : ""].filter(Boolean).join("+");
  return `${institution}|${identity}|${(input.currency ?? "").toUpperCase()}`;
}

/* -------------------------------------------------------- account families */

export type AccountFamily = "investment" | "cash" | "debt" | "other";

const FAMILIES: Record<string, AccountFamily> = {
  isa: "investment",
  gia: "investment",
  sipp: "investment",
  investment: "investment",
  brokerage: "investment",
  current: "cash",
  savings: "cash",
  cash: "cash",
  credit_card: "debt",
  card: "debt",
  loan: "debt",
  mortgage: "debt",
};

export function accountFamily(type: string | null | undefined): AccountFamily {
  return FAMILIES[(type ?? "").toLowerCase()] ?? "other";
}

/**
 * Whether a statement of one kind can belong to an account of another.
 *
 * A brokerage ledger and a credit line are not the same account under any
 * circumstance, and linking them puts share purchases in the spending totals
 * and card repayments in the cost basis. An unrecognised type is not refused —
 * it is simply not evidence either way.
 */
export function compatibleAccountTypes(
  statementType: string | null | undefined,
  accountType: string | null | undefined,
): boolean {
  const left = accountFamily(statementType);
  const right = accountFamily(accountType);
  if (left === "other" || right === "other") return true;
  return left === right;
}


/* ---------------------------------------------------------------- matching */

export type AccountCandidate = {
  id: string;
  nickname: string;
  institution: string | null;
  institution_domain: string | null;
  currency: string;
  country: string | null;
  account_type: string;
  is_active: boolean;
  identifiers: Array<{ hash: string; last_four: string | null; kind: string }>;
};

export type MatchOutcome = {
  account_id: string | null;
  /** 0–1. Only an identifier hash earns full confidence. */
  confidence: number;
  reason: string;
};

function sameInstitution(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const domainA = bankDomain(a);
  const domainB = bankDomain(b);
  if (domainA && domainB) return domainA === domainB;
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const left = norm(a);
  const right = norm(b);
  return left.length > 2 && right.length > 2 && (left.includes(right) || right.includes(left));
}

/**
 * The matching ladder, strongest rung first. Anything below an identifier hash
 * is a suggestion the household confirms, never an automatic link — filing a
 * statement into the wrong account silently corrupts both.
 */
export function matchAccount(
  identity: {
    institution: string | null;
    identifierHash: string | null;
    identifierKind?: IdentifierKind | null;
    lastFourHashes: string[];
    lastFour: string | null;
    currency: string | null;
    country: string | null;
  },
  accounts: AccountCandidate[],
): MatchOutcome {
  const active = accounts.filter((account) => account.is_active);

  if (identity.identifierHash) {
    const exact = active.find((account) =>
      account.identifiers.some((entry) => entry.hash === identity.identifierHash),
    );
    if (exact) {
      // A composite key is a strong hint, not a certainty: it says the bank,
      // the currency and the account holder all agree. It stops short of an
      // automatic link, because two sub-accounts could share all three.
      const composite = identity.identifierKind === "reference";
      return {
        account_id: exact.id,
        confidence: composite ? 0.95 : 1,
        reason: composite
          ? `No account number on this file — the bank, currency and account holder all match ${exact.nickname}.`
          : `The account number on this statement matches ${exact.nickname}.`,
      };
    }
  }

  if (identity.lastFourHashes.length) {
    const byLastFour = active.filter((account) =>
      account.identifiers.some((entry) => identity.lastFourHashes.includes(entry.hash)),
    );
    if (byLastFour.length === 1) {
      const [match] = byLastFour;
      const institutionAgrees = sameInstitution(identity.institution, match!.institution);
      return {
        account_id: match!.id,
        confidence: institutionAgrees ? 0.85 : 0.6,
        reason: institutionAgrees
          ? `Same bank and the last four digits match ${match!.nickname}.`
          : `The last four digits match ${match!.nickname}, but the bank name reads differently.`,
      };
    }
  }

  if (identity.lastFour) {
    const byPrinted = active.filter(
      (account) =>
        account.identifiers.some((entry) => entry.last_four === identity.lastFour) &&
        (!identity.currency || account.currency === identity.currency),
    );
    if (byPrinted.length === 1) {
      return {
        account_id: byPrinted[0]!.id,
        confidence: 0.8,
        reason: `Ends ${identity.lastFour} and holds ${byPrinted[0]!.currency}, like ${byPrinted[0]!.nickname}.`,
      };
    }
  }

  if (identity.institution) {
    const sameBank = active.filter((account) =>
      sameInstitution(identity.institution, account.institution),
    );
    const sameBankAndCurrency = identity.currency
      ? sameBank.filter((account) => account.currency === identity.currency)
      : sameBank;

    if (sameBankAndCurrency.length === 1) {
      const [only] = sameBankAndCurrency;
      return {
        account_id: only!.id,
        confidence: 0.55,
        reason:
          `${only!.nickname} is the only ${identity.currency ?? ""} account you hold at this bank.`.replace(
            "  ",
            " ",
          ),
      };
    }
    if (sameBankAndCurrency.length > 1) {
      return {
        account_id: null,
        confidence: 0,
        reason: `You hold ${sameBankAndCurrency.length} accounts at this bank in this currency — say which one this is.`,
      };
    }
  }

  return {
    account_id: null,
    confidence: 0,
    reason: "Nothing on file matches this statement, so it looks like a new account.",
  };
}

/* ------------------------------------------------------------ persistence */

export async function loadAccountCandidates(
  supabase: Client,
  householdId: string,
): Promise<AccountCandidate[]> {
  const [{ data: accounts }, { data: identifiers }] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, nickname, institution, institution_domain, currency, country, account_type, is_active",
      )
      .eq("household_id", householdId),
    supabase
      .from("account_identifiers")
      .select("account_id, identifier_hash, last4, kind")
      .eq("household_id", householdId),
  ]);

  const grouped = new Map<string, AccountCandidate["identifiers"]>();
  for (const row of identifiers ?? []) {
    const list = grouped.get(row.account_id) ?? [];
    list.push({ hash: row.identifier_hash, last_four: row.last4, kind: row.kind });
    grouped.set(row.account_id, list);
  }

  return (accounts ?? []).map((account: Record<string, unknown>) => ({
    id: account["id"] as string,
    nickname: account["nickname"] as string,
    institution: (account["institution"] as string | null) ?? null,
    institution_domain: (account["institution_domain"] as string | null) ?? null,
    currency: account["currency"] as string,
    country: (account["country"] as string | null) ?? null,
    account_type: account["account_type"] as string,
    is_active: account["is_active"] as boolean,
    identifiers: grouped.get(account["id"] as string) ?? [],
  }));
}

/**
 * Remember this identifier against the account, so the next statement from it
 * matches outright instead of asking again.
 */
export async function rememberIdentifier(
  supabase: Client,
  input: {
    householdId: string;
    accountId: string;
    identifier: NormalisedIdentifier;
    source: "statement" | "manual";
  },
): Promise<void> {
  // Two rows: the identifier itself, and its last four. The second is what
  // lets a bank that masks its own statements ("****4821") still match an
  // account first seen in full.
  const rows = [
    {
      household_id: input.householdId,
      account_id: input.accountId,
      kind: input.identifier.kind,
      identifier_hash: input.identifier.hash,
      last4: input.identifier.lastFour,
      source: input.source,
    },
  ];

  // A composite key has no last four, so there is no masked row to add.
  if (input.identifier.lastFour) {
    rows.push({
      household_id: input.householdId,
      account_id: input.accountId,
      kind: input.identifier.kind,
      identifier_hash: lastFourHash(input.identifier.lastFour, input.identifier.kind),
      last4: input.identifier.lastFour,
      source: input.source,
    });
  }

  await supabase
    .from("account_identifiers")
    .upsert(rows, { onConflict: "household_id,identifier_hash" });
}

/** Every hash a masked "ends 4821" could match, across the kinds we store. */
export function candidateLastFourHashes(lastFour: string | null): string[] {
  if (!lastFour) return [];
  const kinds: IdentifierKind[] = ["account_number", "iban", "card"];
  return kinds.map((kind) => lastFourHash(lastFour, kind));
}

export function identityCountry(
  identity: StatementIdentity,
  currency: string | null,
): string | null {
  if (identity.country) return identity.country;
  const byCurrency: Record<string, string> = {
    GBP: "GB",
    EGP: "EG",
    JOD: "JO",
    USD: "US",
    AED: "AE",
    SAR: "SA",
    EUR: "EU",
  };
  return currency ? (byCurrency[currency] ?? null) : null;
}
