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
import {
  ASSET_CLASS_LABELS,
  DEBT_ACCOUNT_TYPES,
  LIQUID_ACCOUNT_TYPES,
  SOFT_CURRENCIES,
  monthlyEquivalent,
  titleise,
} from "@/lib/format";

export type Slice = { name: string; value: number };

/**
 * The single source of truth for every headline figure in the app.
 * Pass `{ householdWide: true }` to ignore the Me/partner perspective —
 * snapshots are always stored at household level.
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

    const accounts = (accountsQuery.data ?? []).filter(
      (account: AccountRow) => account.is_active && inScope(account.owner_profile_id),
    );
    const assets = (assetsQuery.data ?? []).filter((asset) => inScope(asset.owner_profile_id));
    const liabilities = (liabilitiesQuery.data ?? []).filter((liability) =>
      inScope(liability.owner_profile_id),
    );
    const income = (incomeQuery.data ?? []).filter((row) => inScope(row.owner_profile_id));
    const expenses = (expensesQuery.data ?? []).filter((row) => inScope(row.owner_profile_id));

    const toBase = (amount: number, currency: string) => convert(amount, currency, base);
    const assetValue = (a: { current_value: number; ownership_pct: number; currency: string }) =>
      toBase(Number(a.current_value) * (Number(a.ownership_pct) / 100), a.currency);

    const cashAccounts = accounts.filter((a) => !DEBT_ACCOUNT_TYPES.includes(a.account_type));
    const debtAccounts = accounts.filter((a) => DEBT_ACCOUNT_TYPES.includes(a.account_type));

    const accountAssetTotal = cashAccounts.reduce(
      (sum, a) => sum + toBase(Number(a.current_balance), a.currency),
      0,
    );
    const accountDebtTotal = debtAccounts.reduce(
      (sum, a) => sum + Math.abs(toBase(Number(a.current_balance), a.currency)),
      0,
    );
    const assetTotal = assets.reduce((sum, a) => sum + assetValue(a), 0);
    const liabilityTotal = liabilities.reduce(
      (sum, l) => sum + toBase(Number(l.outstanding_balance), l.currency),
      0,
    );

    const totalAssets = accountAssetTotal + assetTotal;
    const totalLiabilities = accountDebtTotal + liabilityTotal;
    const netWorth = totalAssets - totalLiabilities;

    const liquidCash = cashAccounts
      .filter((a) => LIQUID_ACCOUNT_TYPES.includes(a.account_type))
      .reduce((sum, a) => sum + toBase(Number(a.current_balance), a.currency), 0);
    const liquidAssets = assets.filter((a) => a.is_liquid).reduce((s, a) => s + assetValue(a), 0);
    const liquidNetWorth = liquidCash + liquidAssets - accountDebtTotal;
    const illiquidNetWorth = netWorth - liquidNetWorth;

    // The founder's private stake: always illiquid, always shown separately
    // from spendable wealth.
    const privateStakeValue = assets
      .filter((a) => a.asset_class === "private_equity")
      .reduce((sum, a) => sum + assetValue(a), 0);
    const pensionValue = assets
      .filter((a) => a.asset_class === "pension")
      .reduce((sum, a) => sum + assetValue(a), 0);
    const propertyValue = assets
      .filter((a) => a.asset_class === "property")
      .reduce((sum, a) => sum + assetValue(a), 0);

    const monthlyIncome = income.reduce(
      (sum, row) =>
        sum +
        monthlyEquivalent(
          toBase(Number(row.net_amount ?? row.gross_amount), row.currency),
          row.frequency,
        ),
      0,
    );
    const plannedExpenses = expenses.reduce(
      (sum, row) =>
        sum + monthlyEquivalent(toBase(Number(row.amount), row.currency), row.frequency),
      0,
    );
    const committedExpenses = expenses
      .filter((row) => row.confidence === "committed")
      .reduce(
        (sum, row) =>
          sum + monthlyEquivalent(toBase(Number(row.amount), row.currency), row.frequency),
        0,
      );
    const liabilityPayments = liabilities.reduce(
      (sum, l) => sum + toBase(Number(l.monthly_payment ?? 0), l.currency),
      0,
    );

    const essentialSpend = committedExpenses + liabilityPayments;
    const monthlyExpenses = plannedExpenses + liabilityPayments;
    const netCashflow = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? (netCashflow / monthlyIncome) * 100 : null;
    const runwayMonths = essentialSpend > 0 ? liquidCash / essentialSpend : null;

    const byClass = new Map<string, number>();
    const add = (map: Map<string, number>, key: string, value: number) =>
      map.set(key, (map.get(key) ?? 0) + value);

    for (const account of cashAccounts) {
      const key =
        account.account_type === "crypto"
          ? "Crypto"
          : account.account_type === "sipp"
            ? "Pension"
            : account.account_type === "gia" || account.account_type === "isa"
              ? "Investments"
              : "Cash & deposits";
      add(byClass, key, toBase(Number(account.current_balance), account.currency));
    }
    for (const asset of assets) {
      add(
        byClass,
        ASSET_CLASS_LABELS[asset.asset_class] ?? titleise(asset.asset_class),
        assetValue(asset),
      );
    }

    const byCurrency = new Map<string, number>();
    for (const account of cashAccounts) {
      add(byCurrency, account.currency, toBase(Number(account.current_balance), account.currency));
    }
    for (const asset of assets) {
      add(byCurrency, asset.currency, assetValue(asset));
    }

    const softCurrencyValue = Array.from(byCurrency.entries())
      .filter(([code]) => SOFT_CURRENCIES.includes(code))
      .reduce((sum, [, value]) => sum + value, 0);

    const toSlices = (map: Map<string, number>): Slice[] =>
      Array.from(map.entries())
        .filter(([, value]) => value > 0.5)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    return {
      loading,
      hasData: accounts.length + assets.length + liabilities.length > 0,
      base,
      counts: {
        accounts: accounts.length,
        assets: assets.length,
        liabilities: liabilities.length,
        income: income.length,
      },
      totalAssets,
      totalLiabilities,
      netWorth,
      liquidNetWorth,
      illiquidNetWorth,
      liquidCash,
      privateStakeValue,
      pensionValue,
      propertyValue,
      monthlyIncome,
      monthlyExpenses,
      essentialSpend,
      netCashflow,
      savingsRate,
      runwayMonths,
      allocationByClass: toSlices(byClass),
      allocationByCurrency: toSlices(byCurrency),
      softCurrencyValue,
      softCurrencyShare: totalAssets > 0 ? (softCurrencyValue / totalAssets) * 100 : 0,
    };
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
