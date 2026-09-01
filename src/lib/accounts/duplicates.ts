/**
 * Spotting the same account held twice.
 *
 * When a statement prints no account number, the importer has nothing to
 * recognise it by, so a second file from the same account can be confirmed as a
 * second account. That is how one NatWest current account came to exist twice.
 * The app made the mess, so the app points it out: same bank, same currency,
 * same type, and no printed identifier that says otherwise.
 *
 * Deliberately conservative. Two accounts with different last four digits are
 * two accounts, and a file that names no bank at all is never guessed at —
 * a wrong merge silently welds two histories together.
 */

export type DuplicateCandidate = {
  id: string;
  nickname: string;
  institution: string | null;
  institution_domain?: string | null;
  currency: string;
  account_type: string;
  is_active: boolean;
  identifier_mask?: string | null;
  discovered_from?: string | null;
  created_at?: string | null;
  /** How many statements stand behind the account, when known. */
  statements?: number;
};

export type DuplicateGroup = {
  key: string;
  /** Plain sentence naming what the two rows have in common. */
  reason: string;
  /** Best candidate to keep first — the one with the most behind it. */
  accounts: DuplicateCandidate[];
};

function institutionKey(account: DuplicateCandidate): string | null {
  const domain = account.institution_domain?.trim().toLowerCase();
  if (domain) return domain;
  const name = account.institution?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return name && name.length > 2 ? name : null;
}

function maskDigits(mask: string | null | undefined): string | null {
  const digits = (mask ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Whichever row deserves to be the one that stays. */
function keeperFirst(a: DuplicateCandidate, b: DuplicateCandidate): number {
  const byStatements = (b.statements ?? 0) - (a.statements ?? 0);
  if (byStatements !== 0) return byStatements;
  const byMask = Number(Boolean(maskDigits(b.identifier_mask))) -
    Number(Boolean(maskDigits(a.identifier_mask)));
  if (byMask !== 0) return byMask;
  const left = a.created_at ?? "";
  const right = b.created_at ?? "";
  return left.localeCompare(right);
}

export function findDuplicateAccounts(accounts: DuplicateCandidate[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateCandidate[]>();

  for (const account of accounts) {
    if (!account.is_active) continue;
    const bank = institutionKey(account);
    // No bank name means no basis for the claim. Those files are asked about
    // one at a time instead of being guessed into a pair.
    if (!bank) continue;
    const key = `${bank}|${account.currency.toUpperCase()}|${account.account_type}`;
    const list = groups.get(key) ?? [];
    list.push(account);
    groups.set(key, list);
  }

  const result: DuplicateGroup[] = [];

  for (const [key, list] of groups) {
    if (list.length < 2) continue;

    // Split on printed identifiers: rows that name different digits are
    // different accounts and must not be offered as a merge.
    const byMask = new Map<string, DuplicateCandidate[]>();
    for (const account of list) {
      const digits = maskDigits(account.identifier_mask) ?? "";
      const bucket = byMask.get(digits) ?? [];
      bucket.push(account);
      byMask.set(digits, bucket);
    }

    const unmasked = byMask.get("") ?? [];
    const maskedGroups = [...byMask.entries()].filter(([digits]) => digits !== "");

    // Same digits printed twice is the strongest case there is.
    for (const [digits, bucket] of maskedGroups) {
      if (bucket.length < 2) continue;
      result.push({
        key: `${key}|${digits}`,
        reason: `Both end ${digits} at the same bank and hold ${bucket[0]!.currency}.`,
        accounts: [...bucket].sort(keeperFirst),
      });
    }

    // Rows with no digits at all: only pair them with each other, and only when
    // there is nothing masked to distinguish them from.
    if (unmasked.length >= 2 && maskedGroups.length === 0) {
      const [first] = unmasked;
      result.push({
        key: `${key}|nomask`,
        reason: `${unmasked.length} ${first!.currency} ${first!.account_type.replace(/_/g, " ")} accounts at ${first!.institution ?? "the same bank"}, none of which printed an account number.`,
        accounts: [...unmasked].sort(keeperFirst),
      });
    }
  }

  return result.sort((a, b) => b.accounts.length - a.accounts.length);
}
