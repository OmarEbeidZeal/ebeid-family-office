import type { CategoryRow } from "@/hooks/useFinancials";
import type { TransactionRow } from "@/hooks/useTransactions";
import { normaliseDescription } from "@/lib/text";

export type ToBase = (amount: number, currency: string) => number;

export const UNCATEGORISED_LABEL = "Uncategorised";

/**
 * Money moved between the household's own pots is not spending. Anything in
 * the Transfer group — or matched to an account of its own — is reported as
 * money set aside, never as an expense.
 */
export const TRANSFER_GROUP = "Transfer";

export function transferCategoryIds(categories: CategoryRow[]) {
  return new Set(
    categories.filter((category) => category.category_group === TRANSFER_GROUP).map((c) => c.id),
  );
}

function isMovement(row: TransactionRow, transferIds: Set<string>) {
  return row.is_transfer || (!!row.category_id && transferIds.has(row.category_id));
}

/* ------------------------------------------------------------------ months */

export function monthKeyOf(isoDate: string) {
  return isoDate.slice(0, 7);
}

export function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ascending list of month keys ending with the current month. */
export function recentMonthKeys(count: number) {
  const end = currentMonthKey();
  return Array.from({ length: count }, (_, index) => shiftMonth(end, index - (count - 1)));
}

export function monthLabel(key: string, style: "short" | "long" = "short") {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, 1));
  return date.toLocaleDateString("en-GB", {
    month: style === "long" ? "long" : "short",
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------ values */

/**
 * Every figure is sterling. `amount_base` was converted at the rate for the
 * transaction's own date during import; today's rate is only a fallback.
 */
export function baseValue(row: TransactionRow, toBase: ToBase) {
  return row.amount_base !== null && row.amount_base !== undefined
    ? Math.abs(Number(row.amount_base))
    : Math.abs(toBase(Number(row.amount), row.currency));
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/* ----------------------------------------------------------------- monthly */

export type MonthTotals = {
  month: string;
  label: string;
  /** True income: what arrived from outside the household. */
  income: number;
  /** True spending: what left the household for good. */
  expenses: number;
  essential: number;
  lifestyle: number;
  uncategorised: number;
  /** Money moved to the household's own savings or investment pots. */
  moved: number;
  /**
   * Every debit and every credit, internal moves and financing included — what
   * the bank statements add up to before anything is netted off. Kept beside
   * the true figures because a household that moves £90k between its own
   * accounts should be able to see both, and confuse neither for the other.
   */
  grossOut: number;
  grossIn: number;
  net: number;
  savingsRate: number | null;
  count: number;
  complete: boolean;
};

export function monthlyTotals(
  rows: TransactionRow[],
  categories: CategoryRow[],
  toBase: ToBase,
  months: string[],
): MonthTotals[] {
  const essentialIds = new Set(categories.filter((c) => c.is_essential).map((c) => c.id));
  const transferIds = transferCategoryIds(categories);
  const thisMonth = currentMonthKey();

  const totals = new Map<string, MonthTotals>(
    months.map((month) => [
      month,
      {
        month,
        label: monthLabel(month),
        income: 0,
        expenses: 0,
        essential: 0,
        lifestyle: 0,
        uncategorised: 0,
        moved: 0,
        grossOut: 0,
        grossIn: 0,
        net: 0,
        savingsRate: null,
        count: 0,
        complete: month < thisMonth,
      },
    ]),
  );

  for (const row of rows) {
    const entry = totals.get(monthKeyOf(row.booked_date));
    if (!entry) continue;
    const value = baseValue(row, toBase);

    if (row.direction === "credit") entry.grossIn += value;
    else entry.grossOut += value;

    if (isMovement(row, transferIds)) {
      entry.moved += row.direction === "debit" ? value : -value;
      continue;
    }

    entry.count += 1;
    if (row.direction === "credit") {
      entry.income += value;
      continue;
    }
    entry.expenses += value;
    if (!row.category_id) entry.uncategorised += value;
    else if (essentialIds.has(row.category_id)) entry.essential += value;
    else entry.lifestyle += value;
  }

  return months.map((month) => {
    const entry = totals.get(month)!;
    entry.net = entry.income - entry.expenses;
    entry.savingsRate = entry.income > 0 ? (entry.net / entry.income) * 100 : null;
    return entry;
  });
}

/**
 * The two figures, kept apart on purpose.
 *
 * `gross` is what the statements add up to: every credit, every debit, including
 * the money that only passed through Wise and the Flex repayments that are the
 * same purchase a second time. `true` is what actually entered and left the
 * household. Reporting one as the other is how a household that moves £90k
 * between its own accounts appears to earn it.
 */
export type FlowSummary = {
  gross_in: number;
  gross_out: number;
  true_income: number;
  true_spending: number;
  months: number;
};

export function flowSummary(months: MonthTotals[]): FlowSummary {
  const sum = (pick: (month: MonthTotals) => number) =>
    months.reduce((total, month) => total + pick(month), 0);
  return {
    gross_in: sum((month) => month.grossIn),
    gross_out: sum((month) => month.grossOut),
    true_income: sum((month) => month.income),
    true_spending: sum((month) => month.expenses),
    months: months.length,
  };
}


/** Median of the last complete months, so one unusual month can't skew planning. */
export function baselineFrom(
  months: MonthTotals[],
  pick: (month: MonthTotals) => number,
  window = 6,
  minimum = 2,
) {
  const complete = months.filter((month) => month.complete && month.count > 0).slice(-window);
  if (complete.length < minimum) return null;
  return median(complete.map(pick));
}

/* ---------------------------------------------------------------- category */

export type CategorySpend = {
  id: string | null;
  name: string;
  group: string;
  essential: boolean;
  current: number;
  previous: number;
  change: number | null;
  count: number;
  rows: TransactionRow[];
};

export function categorySpend(
  rows: TransactionRow[],
  categories: CategoryRow[],
  toBase: ToBase,
  currentKey: string,
  previousKey: string,
): CategorySpend[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const transferIds = transferCategoryIds(categories);
  const totals = new Map<string, CategorySpend>();

  for (const row of rows) {
    if (row.direction !== "debit" || isMovement(row, transferIds)) continue;

    const key = monthKeyOf(row.booked_date);
    if (key !== currentKey && key !== previousKey) continue;

    const category = row.category_id ? byId.get(row.category_id) : undefined;
    const id = category?.id ?? null;
    const mapKey = id ?? "__none";
    const entry = totals.get(mapKey) ?? {
      id,
      name: category?.name ?? UNCATEGORISED_LABEL,
      group: category?.category_group ?? "Unassigned",
      essential: category?.is_essential ?? false,
      current: 0,
      previous: 0,
      change: null,
      count: 0,
      rows: [],
    };

    const value = baseValue(row, toBase);
    if (key === currentKey) {
      entry.current += value;
      entry.count += 1;
      entry.rows.push(row);
    } else {
      entry.previous += value;
    }
    totals.set(mapKey, entry);
  }

  return [...totals.values()]
    .map((entry) => ({
      ...entry,
      change: entry.previous > 0 ? ((entry.current - entry.previous) / entry.previous) * 100 : null,
      rows: entry.rows.sort((a, b) => baseValue(b, toBase) - baseValue(a, toBase)),
    }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous);
}

/* --------------------------------------------------------------- recurring */

export type RecurringCost = {
  key: string;
  label: string;
  category: string | null;
  monthly: number;
  annual: number;
  occurrences: number;
  months: number;
  latest: number;
  earliest: number;
  creep: number | null;
  lastDate: string;
  currency: string;
};

/**
 * A standing cost is a payee charged in three or more distinct months at a
 * stable amount and at roughly one charge a month — or one the importer
 * already flagged as recurring. Supermarkets and other everyday payees that
 * happen to be visited often are deliberately excluded: a standing cost is
 * something you could cancel, not something you buy.
 */
export function recurringCosts(
  rows: TransactionRow[],
  categories: CategoryRow[],
  toBase: ToBase,
): RecurringCost[] {
  const byId = new Map(categories.map((category) => [category.id, category.name]));
  const transferIds = transferCategoryIds(categories);
  const groups = new Map<
    string,
    {
      label: string;
      currency: string;
      category: string | null;
      entries: { date: string; value: number }[];
      flagged: boolean;
    }
  >();

  for (const row of rows) {
    if (row.direction !== "debit" || isMovement(row, transferIds)) continue;
    const label = row.merchant?.trim() || normaliseDescription(row.description ?? "");
    if (!label) continue;
    // Keyed with the currency so the same brand billed in two countries stays
    // two separate standing costs.
    const key = `${label.toLowerCase()}|${row.currency}`;
    const group = groups.get(key) ?? {
      label,
      currency: row.currency,
      category: row.category_id ? (byId.get(row.category_id) ?? null) : null,
      entries: [],
      flagged: false,
    };
    group.entries.push({ date: row.booked_date, value: baseValue(row, toBase) });
    if (row.is_recurring) group.flagged = true;
    if (!group.category && row.category_id) group.category = byId.get(row.category_id) ?? null;
    groups.set(key, group);
  }

  const results: RecurringCost[] = [];
  for (const [key, group] of groups) {
    const entries = group.entries.sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(entries.map((entry) => monthKeyOf(entry.date)));
    if (months.size < 2) continue;

    const values = entries.map((entry) => entry.value);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread =
      mean > 0
        ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) /
          mean
        : 1;
    // Roughly one charge a month; a payee hit five times in three months is
    // shopping, not a subscription.
    const cadence = entries.length / months.size;
    if (cadence > 1.5) continue;

    const steady = months.size >= 3 && spread < 0.25;
    if (!steady && !(group.flagged && spread < 0.4)) continue;

    const monthly = values.reduce((sum, value) => sum + value, 0) / months.size;
    const earliest = values[0]!;
    const latest = values[values.length - 1]!;

    results.push({
      key,
      label: group.label,
      category: group.category,
      monthly,
      annual: monthly * 12,
      occurrences: entries.length,
      months: months.size,
      latest,
      earliest,
      creep: earliest > 0 ? ((latest - earliest) / earliest) * 100 : null,
      lastDate: entries[entries.length - 1]!.date,
      currency: group.currency,
    });
  }

  // The same brand billed in two countries produces two costs that would
  // otherwise read identically, so name the currency when that happens.
  const labelCounts = new Map<string, number>();
  for (const cost of results) {
    const seen = labelCounts.get(cost.label.toLowerCase()) ?? 0;
    labelCounts.set(cost.label.toLowerCase(), seen + 1);
  }
  for (const cost of results) {
    if ((labelCounts.get(cost.label.toLowerCase()) ?? 0) > 1) {
      cost.label = `${cost.label} · ${cost.currency}`;
    }
  }

  return results.sort((a, b) => b.annual - a.annual);
}

/* --------------------------------------------------------------- merchants */

export type MerchantSpend = { label: string; total: number; count: number };

export function topMerchants(
  rows: TransactionRow[],
  categories: CategoryRow[],
  toBase: ToBase,
  sinceMonth: string,
  limit = 8,
): MerchantSpend[] {
  const transferIds = transferCategoryIds(categories);
  const totals = new Map<string, MerchantSpend>();
  for (const row of rows) {
    if (row.direction !== "debit" || isMovement(row, transferIds)) continue;
    if (monthKeyOf(row.booked_date) < sinceMonth) continue;
    const label = row.merchant?.trim() || (row.description ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const entry = totals.get(key) ?? { label, total: 0, count: 0 };
    entry.total += baseValue(row, toBase);
    entry.count += 1;
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

/* ------------------------------------------------------------------ splits */

export type SplitPart = { transaction_id: string; category_id: string | null; amount: number };

/** Replaces each split transaction with one row per part, pro-rating the base amount. */
export function expandSplits(rows: TransactionRow[], parts: SplitPart[]): TransactionRow[] {
  if (!parts.length) return rows;
  const byTransaction = new Map<string, SplitPart[]>();
  for (const part of parts) {
    const bucket = byTransaction.get(part.transaction_id);
    if (bucket) bucket.push(part);
    else byTransaction.set(part.transaction_id, [part]);
  }
  if (!byTransaction.size) return rows;

  return rows.flatMap((row) => {
    const split = byTransaction.get(row.id);
    if (!split?.length || !row.amount) return [row];
    return split.map((part, index) => {
      const amount = Number(part.amount);
      const share = amount / row.amount;
      return {
        ...row,
        id: `${row.id}:${index}`,
        amount,
        amount_base: row.amount_base === null ? null : Number((row.amount_base * share).toFixed(2)),
        category_id: part.category_id,
      };
    });
  });
}
