/**
 * Conduits: accounts money passes *through*.
 *
 * Two of this household's accounts are not sources of income or destinations of
 * spending at all, and counting them as either doubles the household's own
 * money.
 *
 * Monzo Flex is a credit line. A purchase on Flex is spending — once, on the
 * Flex ledger. Every repayment arriving into Flex from the current account is
 * the same money a second time, so a Flex credit is internal, and Flex nets to
 * zero in income. Interest and fees are the exception: they are a genuine cost
 * the household pays for using it.
 *
 * Wise is a pipe. Money enters, is converted, and leaves again to a UK account
 * or to family abroad. Where both legs are on file the pair is internal; where
 * the far side was never uploaded, a credit in the household's own name is
 * still their own money and not income.
 *
 * Pure, so the import pipeline, the rescan and the tests all reason identically.
 */

export type ConduitAccount = {
  id: string;
  institution?: string | null;
  nickname?: string | null;
  account_type?: string | null;
};

export type ConduitRow = {
  id: string;
  account_id: string | null;
  booked_date: string;
  amount: number;
  amount_base?: number | null;
  direction: string;
  merchant?: string | null;
  description?: string | null;
};

const DAY = 86_400_000;

/** How long money may sit in Wise and still count as passing through. */
const WISE_WINDOW_DAYS = 10;

/** A conversion costs a little, so the two legs never match to the penny. */
const WISE_DRIFT = 0.03;

const norm = (value: string | null | undefined) => (value ?? "").toLowerCase();

export function isFlexAccount(account: ConduitAccount | null | undefined): boolean {
  if (!account) return false;
  const text = `${norm(account.institution)} ${norm(account.nickname)}`;
  if (!text.includes("monzo")) return false;
  return text.includes("flex");
}

export function isWiseAccount(account: ConduitAccount | null | undefined): boolean {
  if (!account) return false;
  const text = `${norm(account.institution)} ${norm(account.nickname)}`;
  return text.includes("wise") || text.includes("transferwise");
}

/** The one thing on a credit line that really is a cost. */
export function isInterestOrFee(row: ConduitRow): boolean {
  const text = `${norm(row.merchant)} ${norm(row.description)}`;
  return /\b(interest|fee|fees|charge|charges|apr)\b/.test(text);
}

const value = (row: ConduitRow) => Math.abs(Number(row.amount_base ?? row.amount));

export function accountIndex(accounts: ConduitAccount[]): Map<string, ConduitAccount> {
  return new Map(accounts.map((account) => [account.id, account]));
}

/**
 * Repayments arriving into a Flex ledger. Purchases (debits) stay as spending,
 * and interest or a fee arriving as a charge is never netted off.
 */
export function flexConduitIds(rows: ConduitRow[], accounts: ConduitAccount[]): Set<string> {
  const index = accountIndex(accounts);
  const internal = new Set<string>();
  for (const row of rows) {
    if (!row.account_id) continue;
    if (!isFlexAccount(index.get(row.account_id))) continue;
    if (row.direction !== "credit") continue;
    if (isInterestOrFee(row)) continue;
    internal.add(row.id);
  }
  return internal;
}

/**
 * Money that entered a Wise balance and left it again — the same money, seen
 * twice. Each credit is spent against at most one later debit so a single
 * payment out cannot absolve two payments in.
 */
export function wiseConduitIds(rows: ConduitRow[], accounts: ConduitAccount[]): Set<string> {
  const index = accountIndex(accounts);
  const internal = new Set<string>();

  const byAccount = new Map<string, ConduitRow[]>();
  for (const row of rows) {
    if (!row.account_id) continue;
    if (!isWiseAccount(index.get(row.account_id))) continue;
    const bucket = byAccount.get(row.account_id);
    if (bucket) bucket.push(row);
    else byAccount.set(row.account_id, [row]);
  }

  for (const bucket of byAccount.values()) {
    const sorted = [...bucket].sort((a, b) => a.booked_date.localeCompare(b.booked_date));
    const debits = sorted.filter((row) => row.direction === "debit");
    const used = new Set<string>();

    for (const credit of sorted) {
      if (credit.direction !== "credit") continue;
      const inValue = value(credit);
      if (inValue <= 0) continue;
      const enteredAt = new Date(credit.booked_date).getTime();
      if (!Number.isFinite(enteredAt)) continue;

      for (const debit of debits) {
        if (used.has(debit.id)) continue;
        const leftAt = new Date(debit.booked_date).getTime();
        if (!Number.isFinite(leftAt)) continue;
        const days = (leftAt - enteredAt) / DAY;
        // A payment out on the same day counts; one before the money arrived
        // cannot be that money leaving.
        if (days < -1 || days > WISE_WINDOW_DAYS) continue;

        const outValue = value(debit);
        if (outValue <= 0) continue;
        const drift = Math.abs(outValue - inValue) / Math.max(outValue, inValue);
        if (drift > WISE_DRIFT) continue;

        used.add(debit.id);
        internal.add(credit.id);
        internal.add(debit.id);
        break;
      }
    }
  }

  return internal;
}

/** Everything the conduit rules mark as the household's own money moving. */
export function conduitIds(rows: ConduitRow[], accounts: ConduitAccount[]): Set<string> {
  const found = new Set<string>();
  for (const id of flexConduitIds(rows, accounts)) found.add(id);
  for (const id of wiseConduitIds(rows, accounts)) found.add(id);
  return found;
}

/**
 * A credit that is the household's own money moving can never be Salary,
 * however the description reads. Income has to arrive from outside.
 */
export function allowedIncomeCategoryId(
  internal: boolean,
  categoryId: string | null,
): string | null {
  return internal ? null : categoryId;
}
