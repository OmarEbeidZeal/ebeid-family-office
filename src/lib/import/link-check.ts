/**
 * Whether a statement and an account can be the same thing.
 *
 * Pure, and deliberately not a `.server` file: the confirmation screen asks the
 * same question the importer asks, so it must be able to ask it before the
 * household presses anything. The server still refuses on its own — this is the
 * same rule, shown early.
 */
import { bankDomain } from "../ai/banks";

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

export function sameInstitution(a: string | null, b: string | null): boolean {
  a = meaningfulInstitution(a);
  b = meaningfulInstitution(b);
  if (!a || !b) return false;
  const domainA = bankDomain(a);
  const domainB = bankDomain(b);
  if (domainA && domainB) return domainA === domainB;
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const left = norm(a);
  const right = norm(b);
  return left.length > 2 && right.length > 2 && (left.includes(right) || right.includes(left));
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

/**
 * Why these statements cannot be merged into that account — or null when they
 * can.
 *
 * Three things must agree before a link is allowed: the bank, the currency, and
 * the kind of account. A nickname the app invented when the file named no bank
 * ("Imported account") is not a bank name and is not allowed to stand in for
 * one.
 */
export function linkRefusal(
  proposal: {
    institution: string | null;
    currency: string | null;
    account_type: string | null;
    nickname: string | null;
  },
  account: { nickname: string; institution: string | null; currency: string; account_type: string },
): string | null {
  const statementBank = meaningfulInstitution(proposal.institution);
  const accountBank = meaningfulInstitution(account.institution);
  if (statementBank && accountBank && !sameInstitution(statementBank, accountBank)) {
    return `These statements are from ${statementBank} and ${account.nickname} is held at ${accountBank}. Pick the right account, or add a new one.`;
  }

  if (proposal.currency && proposal.currency !== account.currency) {
    return `These statements are in ${proposal.currency} and ${account.nickname} holds ${account.currency}. A currency is not converted on import — add a separate ${proposal.currency} account.`;
  }

  if (
    proposal.account_type &&
    !compatibleAccountTypes(proposal.account_type, account.account_type)
  ) {
    return `These statements are a ${proposal.account_type.replace(/_/g, " ")} statement and ${account.nickname} is a ${account.account_type.replace(/_/g, " ")} account. Merging them would file investments as spending. Add a new account instead.`;
  }

  return null;
}
