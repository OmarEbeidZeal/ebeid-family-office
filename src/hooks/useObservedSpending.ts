import { useMemo } from "react";
import { useCurrency } from "./useCurrency";
import { useCategories } from "./useFinancials";
import { useTransactionHistory } from "./useTransactions";
import {
  baselineFrom,
  categorySpend,
  currentMonthKey,
  monthlyTotals,
  recentMonthKeys,
  recurringCosts,
  shiftMonth,
  topMerchants,
  type MonthTotals,
} from "@/lib/spending";

export const SPENDING_MONTHS = 24;

/**
 * Spending as it actually happened, from imported statements only. Every
 * figure here is observed — nothing is estimated, and when there isn't enough
 * history the baselines come back null so callers can say so plainly.
 */
export function useObservedSpending(monthsBack = SPENDING_MONTHS) {
  const { convert, base } = useCurrency();
  const historyQuery = useTransactionHistory(monthsBack);
  const categoriesQuery = useCategories();

  const loading = historyQuery.isLoading || categoriesQuery.isLoading;

  return useMemo(() => {
    const rows = historyQuery.data ?? [];
    const categories = categoriesQuery.data ?? [];
    const toBase = (amount: number, currency: string) => convert(amount, currency, base);

    const months = recentMonthKeys(monthsBack);
    const totals: MonthTotals[] = monthlyTotals(rows, categories, toBase, months);
    const withActivity = totals.filter((month) => month.count > 0);
    const completeMonths = totals.filter((month) => month.complete && month.count > 0);

    const thisMonth = currentMonthKey();
    const lastMonth = shiftMonth(thisMonth, -1);

    return {
      loading,
      base,
      rows,
      categories,
      hasData: rows.length > 0,
      months: totals,
      /** Months with activity, trimmed to the first month that has any. */
      activeMonths: withActivity.length
        ? totals.slice(totals.findIndex((month) => month.month === withActivity[0]!.month))
        : [],
      completeMonthCount: completeMonths.length,
      thisMonth,
      lastMonth,
      essentialBaseline: baselineFrom(totals, (month) => month.essential),
      lifestyleBaseline: baselineFrom(totals, (month) => month.lifestyle),
      spendBaseline: baselineFrom(totals, (month) => month.expenses),
      incomeBaseline: baselineFrom(totals, (month) => month.income),
      uncategorisedBaseline: baselineFrom(totals, (month) => month.uncategorised),
      /** Typical monthly move into the household's own savings or investment pots. */
      movedBaseline: baselineFrom(totals, (month) => month.moved),
      /** Everything the statements show leaving and arriving, nothing netted off. */
      grossOutBaseline: baselineFrom(totals, (month) => month.grossOut),
      grossInBaseline: baselineFrom(totals, (month) => month.grossIn),
      categories24: categories,
      breakdown: (currentKey: string, previousKey: string) =>
        categorySpend(rows, categories, toBase, currentKey, previousKey),
      recurring: recurringCosts(rows, categories, toBase),
      merchants: (sinceMonth: string, limit?: number) =>
        topMerchants(rows, categories, toBase, sinceMonth, limit),
    };
  }, [historyQuery.data, categoriesQuery.data, convert, base, monthsBack, loading]);
}

export type ObservedSpending = ReturnType<typeof useObservedSpending>;
