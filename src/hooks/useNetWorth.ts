import { useMemo } from "react";
import { useCurrency } from "./useCurrency";
import { useScope } from "./useScope";
import {
  useAccounts,
  useAssets,
  useForecastExpenses,
  useIncomeStreams,
  useLiabilities,
  type AccountRow,
} from "./useFinancials";
import { computeNetWorth, type Slice } from "@/lib/networth";

export type { Slice };

/**
 * The single source of truth for every headline figure in the app.
 * Pass `{ householdWide: true }` to ignore the Me/partner perspective —
 * snapshots are always stored at household level.
 *
 * The arithmetic itself lives in `@/lib/networth` so the advisor reasons from
 * the same numbers the dashboard displays.
 */
export function useNetWorth(options?: { householdWide?: boolean }) {
  const householdWide = options?.householdWide ?? false;
  const { convert, base } = useCurrency();
  const { matches } = useScope();
  const accountsQuery = useAccounts();
  const assetsQuery = useAssets();
  const liabilitiesQuery = useLiabilities();
  const incomeQuery = useIncomeStreams();
  const expensesQuery = useForecastExpenses();

  const loading =
    accountsQuery.isLoading ||
    assetsQuery.isLoading ||
    liabilitiesQuery.isLoading ||
    incomeQuery.isLoading ||
    expensesQuery.isLoading;

  return useMemo(() => {
    const inScope = (ownerProfileId: string | null | undefined) =>
      householdWide ? true : matches(ownerProfileId);

    const computed = computeNetWorth({
      accounts: (accountsQuery.data ?? []).filter((account: AccountRow) =>
        inScope(account.owner_profile_id),
      ),
      assets: (assetsQuery.data ?? []).filter((asset) => inScope(asset.owner_profile_id)),
      liabilities: (liabilitiesQuery.data ?? []).filter((liability) =>
        inScope(liability.owner_profile_id),
      ),
      income: (incomeQuery.data ?? []).filter((row) => inScope(row.owner_profile_id)),
      expenses: (expensesQuery.data ?? []).filter((row) => inScope(row.owner_profile_id)),
      toBase: (amount: number, currency: string) => convert(amount, currency, base),
      base,
    });

    return { loading, ...computed };
  }, [
    accountsQuery.data,
    assetsQuery.data,
    liabilitiesQuery.data,
    incomeQuery.data,
    expensesQuery.data,
    convert,
    base,
    matches,
    householdWide,
    loading,
  ]);
}

export type NetWorthSummary = ReturnType<typeof useNetWorth>;
