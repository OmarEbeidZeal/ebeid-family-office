import { useMemo } from "react";
import { useCurrency } from "./useCurrency";
import { useScope } from "./useScope";
import {
  monthlyEquivalent,
  useAccounts,
  useAssets,
  useForecastExpenses,
  useIncomeStreams,
  useLiabilities,
  type AccountRow,
} from "./useFinancials";
import { DEBT_ACCOUNT_TYPES, LIQUID_ACCOUNT_TYPES, titleise } from "@/lib/format";

export function useNetWorth() {
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
    const accounts = (accountsQuery.data ?? []).filter(
      (account: AccountRow) => account.is_active && matches(account.owner_profile_id),
    );
    const assets = (assetsQuery.data ?? []).filter((asset) => matches(asset.owner_profile_id));
    const liabilities = (liabilitiesQuery.data ?? []).filter((liability) =>
      matches(liability.owner_profile_id),
    );
    const income = (incomeQuery.data ?? []).filter((row) => matches(row.owner_profile_id));
    const expenses = (expensesQuery.data ?? []).filter((row) => matches(row.owner_profile_id));

    const toBase = (amount: number, currency: string) => convert(amount, currency, base);

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
    const assetTotal = assets.reduce(
      (sum, a) => sum + toBase(Number(a.current_value) * (Number(a.ownership_pct) / 100), a.currency),
      0,
    );
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
    const liquidAssets = assets
      .filter((a) => a.is_liquid)
      .reduce(
        (sum, a) => sum + toBase(Number(a.current_value) * (Number(a.ownership_pct) / 100), a.currency),
        0,
      );
    const liquidNetWorth = liquidCash + liquidAssets - accountDebtTotal;
    const illiquidNetWorth = netWorth - liquidNetWorth;

    const monthlyIncome = income.reduce(
      (sum, row) =>
        sum +
        monthlyEquivalent(toBase(Number(row.net_amount ?? row.gross_amount), row.currency), row.frequency),
      0,
    );
    const monthlyExpenses = expenses.reduce(
      (sum, row) => sum + monthlyEquivalent(toBase(Number(row.amount), row.currency), row.frequency),
      0,
    );
    const essentialMonthly = expenses
      .filter((row) => row.confidence === "committed")
      .reduce(
        (sum, row) => sum + monthlyEquivalent(toBase(Number(row.amount), row.currency), row.frequency),
        0,
      );
    const liabilityPayments = liabilities.reduce(
      (sum, l) => sum + toBase(Number(l.monthly_payment ?? 0), l.currency),
      0,
    );
    const essentialSpend = essentialMonthly + liabilityPayments;
    const netCashflow = monthlyIncome - monthlyExpenses - liabilityPayments;
    const savingsRate = monthlyIncome > 0 ? (netCashflow / monthlyIncome) * 100 : 0;
    const runwayMonths = essentialSpend > 0 ? liquidCash / essentialSpend : null;

    const byClass = new Map<string, number>();
    for (const account of cashAccounts) {
      const key = account.account_type === "crypto" ? "Crypto" : "Cash & deposits";
      byClass.set(key, (byClass.get(key) ?? 0) + toBase(Number(account.current_balance), account.currency));
    }
    for (const asset of assets) {
      const key = titleise(asset.asset_class);
      byClass.set(
        key,
        (byClass.get(key) ?? 0) +
          toBase(Number(asset.current_value) * (Number(asset.ownership_pct) / 100), asset.currency),
      );
    }

    const byCurrency = new Map<string, number>();
    for (const account of cashAccounts) {
      byCurrency.set(
        account.currency,
        (byCurrency.get(account.currency) ?? 0) + toBase(Number(account.current_balance), account.currency),
      );
    }
    for (const asset of assets) {
      byCurrency.set(
        asset.currency,
        (byCurrency.get(asset.currency) ?? 0) +
          toBase(Number(asset.current_value) * (Number(asset.ownership_pct) / 100), asset.currency),
      );
    }

    const softCurrencies = ["EGP", "JOD"];
    const softExposure = Array.from(byCurrency.entries())
      .filter(([code]) => softCurrencies.includes(code))
      .reduce((sum, [, value]) => sum + value, 0);

    const toSlices = (map: Map<string, number>) =>
      Array.from(map.entries())
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    return {
      loading,
      hasData: accounts.length + assets.length + liabilities.length > 0,
      base,
      totalAssets,
      totalLiabilities,
      netWorth,
      liquidNetWorth,
      illiquidNetWorth,
      monthlyIncome,
      monthlyExpenses: monthlyExpenses + liabilityPayments,
      netCashflow,
      savingsRate,
      runwayMonths,
      allocationByClass: toSlices(byClass),
      allocationByCurrency: toSlices(byCurrency),
      softCurrencyShare: totalAssets > 0 ? (softExposure / totalAssets) * 100 : 0,
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
    loading,
  ]);
}
