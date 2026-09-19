/**
 * Net worth, liquidity and cashflow — the pure arithmetic behind every headline
 * figure. Extracted from the dashboard hook so the advisor can reason from
 * exactly the same numbers the household sees on screen.
 *
 * Account balances are authoritative for net worth; listed holdings are the
 * composition *inside* investment accounts and are never added on top.
 */
import { balanceKnown, countUnstatedBalances } from "@/lib/balances";
import {
  ASSET_CLASS_LABELS,
  DEBT_ACCOUNT_TYPES,
  LIQUID_ACCOUNT_TYPES,
  RESERVE_ACCOUNT_TYPES,
  SOFT_CURRENCIES,
  monthlyEquivalent,
  titleise,
} from "@/lib/format";

export type Slice = { name: string; value: number };

export type ToBase = (amount: number, currency: string) => number;

export type NwAccount = {
  account_type: string;
  currency: string;
  /** NULL, or "unknown" as the source, means no balance has been stated. */
  current_balance: number | null;
  /** "unknown" means no balance has been stated; the row stays out of the maths. */
  balance_source?: string | null;
  is_active: boolean;
  owner_profile_id?: string | null;
};


export type NwAsset = {
  asset_class: string;
  currency: string;
  current_value: number;
  ownership_pct: number;
  is_liquid: boolean;
  owner_profile_id?: string | null;
};

export type NwLiability = {
  currency: string;
  outstanding_balance: number;
  monthly_payment: number | null;
  owner_profile_id?: string | null;
};

export type NwIncome = {
  currency: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: string;
  owner_profile_id?: string | null;
};

export type NwExpense = {
  currency: string;
  amount: number;
  frequency: string;
  confidence: string;
  owner_profile_id?: string | null;
};

export type NetWorthInput = {
  accounts: NwAccount[];
  assets: NwAsset[];
  liabilities: NwLiability[];
  income: NwIncome[];
  expenses: NwExpense[];
  toBase: ToBase;
  base: string;
};

export function computeNetWorth(input: NetWorthInput) {
  const { toBase, base } = input;
  const activeAccounts = input.accounts.filter((account) => account.is_active);
  // An account whose balance nobody has stated contributes nothing — not zero,
  // nothing. Counting the placeholder would drag the headline figure down and
  // make every allocation slice wrong; the count is returned instead so the
  // screen can say what is missing.
  const accounts = activeAccounts.filter(balanceKnown);
  const balancesUnstated = countUnstatedBalances(activeAccounts);
  const { assets, liabilities, income, expenses } = input;

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
  // The emergency reserve is a policy figure, not a liquidity figure: only
  // spendable cash counts, and rule 4 measures it in GBP. Non-GBP cash is kept
  // separately so the dashboard can say it exists without counting it.
  const reserveAccounts = cashAccounts.filter((a) =>
    RESERVE_ACCOUNT_TYPES.includes(a.account_type),
  );
  const reserveCash = reserveAccounts
    .filter((a) => a.currency === "GBP")
    .reduce((sum, a) => sum + toBase(Number(a.current_balance), a.currency), 0);
  const otherCurrencyCash = reserveAccounts
    .filter((a) => a.currency !== "GBP")
    .reduce((sum, a) => sum + toBase(Number(a.current_balance), a.currency), 0);

  const liquidAssets = assets.filter((a) => a.is_liquid).reduce((s, a) => s + assetValue(a), 0);
  const liquidNetWorth = liquidCash + liquidAssets - accountDebtTotal;
  const illiquidNetWorth = netWorth - liquidNetWorth;

  // The founder's private stake: always illiquid, always shown separately from
  // spendable wealth.
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
    (sum, row) => sum + monthlyEquivalent(toBase(Number(row.amount), row.currency), row.frequency),
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
  const runwayMonths = essentialSpend > 0 ? reserveCash / essentialSpend : null;

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
    // Something has to have a figure. An account discovered from a statement
    // that printed no balance is not data: a household holding only those has
    // an unknown net worth, and recording it as £0 would write a straight line
    // through the trend chart that never happened.
    hasData: accounts.length + assets.length + liabilities.length > 0,
    base,
    counts: {
      accounts: activeAccounts.length,
      /** Active accounts still waiting for a figure — excluded from every total above. */
      balancesUnstated,
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
    reserveCash,
    otherCurrencyCash,

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
}

export type NetWorthComputation = ReturnType<typeof computeNetWorth>;
