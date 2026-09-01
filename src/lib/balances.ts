/**
 * What a balance is worth knowing.
 *
 * An account discovered from a statement that carried no closing figure has no
 * balance at all — not a balance of zero. The two look identical in a numeric
 * column, so the difference is carried in `balance_source`: "unknown" means the
 * stored 0 is a placeholder and must never reach a total, a chart, an allocation
 * or the advisor's context. A zero net worth caused by three unstated balances
 * is a lie the household would have to spot for itself; an account that says
 * "balance not set" is not.
 */

export type BalanceCarrier = {
  current_balance: number;
  /** "manual" | "statement" | "unknown"; absent on older callers, read as known. */
  balance_source?: string | null;
};

/** True when a figure has actually been stated — typed by hand or read off a statement. */
export function balanceKnown(account: BalanceCarrier): boolean {
  return (account.balance_source ?? "manual") !== "unknown";
}

/** The balance, or null when nobody has ever stated one. */
export function statedBalance(account: BalanceCarrier): number | null {
  return balanceKnown(account) ? Number(account.current_balance) : null;
}

/** Only the accounts whose balance is a real figure. */
export function withKnownBalance<T extends BalanceCarrier>(accounts: T[]): T[] {
  return accounts.filter(balanceKnown);
}

/** How many of these accounts are still waiting for a balance. */
export function countUnstatedBalances(accounts: BalanceCarrier[]): number {
  return accounts.reduce((count, account) => count + (balanceKnown(account) ? 0 : 1), 0);
}

/** The sentence the UI uses wherever a total had to leave accounts out. */
export function unstatedBalanceNote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 account has no balance yet, so it is left out of this total."
    : `${count} accounts have no balance yet, so they are left out of this total.`;
}
