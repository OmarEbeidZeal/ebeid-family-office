/**
 * What the records actually cover.
 *
 * The advisor's context is everything on file, which is not the same thing as
 * everything there is. An account whose statements stop in March, a balance
 * nobody has stated, a salary that appears in no account — each one quietly
 * turns a spending baseline or a runway into fiction. So the coverage block
 * says, in the context itself, where the record ends.
 *
 * Pure: the same builder serves the advisor, the briefing and the tests.
 */

export type CoverageAccountInput = {
  id: string;
  label: string;
  currency: string;
  balanceKnown: boolean;
  firstTransaction: string | null;
  lastTransaction: string | null;
  transactionCount: number;
};

export type CoverageAccount = {
  label: string;
  currency: string;
  balance_known: boolean;
  first_transaction: string | null;
  last_transaction: string | null
  transactions: number;
};

export type Coverage = {
  accounts: CoverageAccount[];
  /** Everything the household has told us is missing, plus what we can see is. */
  known_gaps: string[];
  note: string;
};

export const NO_SALARY_GAP = "no account shows a salary credit";
export const NO_HOUSING_GAP = "no rent or mortgage payment found in any account";

export const COVERAGE_NOTE =
  "This is everything on file. It is not necessarily everything there is. Where known_gaps is not empty, the spending baseline, savings rate, runway and reserve position are incomplete.";

/** A gap the household typed in Settings, tidied but not reworded. */
export function cleanGaps(raw: Array<string | null | undefined> | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw ?? []) {
    const text = (entry ?? "").trim().slice(0, 240);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function buildCoverage(input: {
  accounts: CoverageAccountInput[];
  /** Notes the household wrote in Settings. */
  declaredGaps: Array<string | null | undefined>;
  /** Credits the household has categorised, or the banks described, as pay. */
  salaryCredits: number;
  /** Rent or mortgage payments seen in any account. */
  housingPayments: number;
}): Coverage {
  const accounts = input.accounts.map((account) => ({
    label: account.label,
    currency: account.currency,
    balance_known: account.balanceKnown,
    first_transaction: account.firstTransaction,
    last_transaction: account.lastTransaction,
    transactions: account.transactionCount,
  }));

  const gaps = cleanGaps(input.declaredGaps);

  // Automatic gaps are only claimed once there is something to look through: a
  // household with no transactions on file at all is not missing its salary,
  // it simply has nothing imported yet.
  const anyTransactions = input.accounts.some((account) => account.transactionCount > 0);
  if (anyTransactions) {
    if (input.salaryCredits === 0) gaps.push(NO_SALARY_GAP);
    if (input.housingPayments === 0) gaps.push(NO_HOUSING_GAP);
  }

  const unknownBalances = input.accounts.filter((account) => !account.balanceKnown).length;
  if (unknownBalances > 0) {
    gaps.push(
      unknownBalances === 1
        ? "one account has no stated balance"
        : `${unknownBalances} accounts have no stated balance`,
    );
  }

  return { accounts, known_gaps: gaps, note: COVERAGE_NOTE };
}
