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

export type IdentifierKind = "account_number" | "iban" | "card";

export type NormalisedIdentifier = {
  kind: IdentifierKind;
  /** Digits and letters only, upper case — what gets hashed. */
  normalised: string;
  lastFour: string;
  hash: string;
  /** "•••• 4821" — safe to render anywhere. */
  mask: string;
};

const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

function westernDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

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
 * Reduce a printed identifier to something matchable. Returns null when what
 * was printed carries too little signal to be worth matching on — a bank that
 * prints only "****" tells us nothing.
 */
export function normaliseIdentifier(
  raw: string | null | undefined,
  hint: IdentifierKind | null,
): NormalisedIdentifier | null {
  if (!raw) return null;

  const cleaned = westernDigits(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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

  return { kind, normalised: cleaned, lastFour, hash, mask: maskIdentifier(lastFour, kind) };
}

/** Hash of just the last four, for matching a masked statement against a known account. */
export function lastFourHash(lastFour: string, kind: IdentifierKind): string {
  return createHmac("sha256", salt()).update(`last4:${kind}:${lastFour}`).digest("hex");
}

/* ------------------------------------------------------------- fingerprint */

/**
 * A stable key for "this account, at this bank, in this currency". Two files
 * from the same account in the same batch must land on one proposal, not two.
 */
export function proposalFingerprint(input: {
  institution: string | null;
  identifierHash: string | null;
  lastFour: string | null;
  currency: string | null;
}): string {
  const institution = (input.institution ?? "unknown").toLowerCase().replace(/[^a-z0-9]/g, "");
  const identity = input.identifierHash ?? (input.lastFour ? `l4:${input.lastFour}` : "noid");
  return `${institution}|${identity}|${(input.currency ?? "").toUpperCase()}`;
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
      return {
        account_id: exact.id,
        confidence: 1,
        reason: `The account number on this statement matches ${exact.nickname}.`,
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
    const sameBank = active.filter((account) => sameInstitution(identity.institution, account.institution));
    const sameBankAndCurrency = identity.currency
      ? sameBank.filter((account) => account.currency === identity.currency)
      : sameBank;

    if (sameBankAndCurrency.length === 1) {
      const [only] = sameBankAndCurrency;
      return {
        account_id: only!.id,
        confidence: 0.55,
        reason: `${only!.nickname} is the only ${identity.currency ?? ""} account you hold at this bank.`.replace(
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
    {
      household_id: input.householdId,
      account_id: input.accountId,
      kind: input.identifier.kind,
      identifier_hash: lastFourHash(input.identifier.lastFour, input.identifier.kind),
      last4: input.identifier.lastFour,
      source: input.source,
    },
  ];

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

export function identityCountry(identity: StatementIdentity, currency: string | null): string | null {
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
