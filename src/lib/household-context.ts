/**
 * The household's real position, assembled once and shared by everything that
 * needs to reason about it: the portfolio's policy panel, the standing briefing
 * and the advisor's system context.
 *
 * Pure. No fetching, no estimating, no defaults standing in for missing data —
 * an unknown comes through as null and every consumer says so out loud.
 */
import {
  DEBT_ACCOUNT_TYPES,
  SOFT_CURRENCIES,
  monthlyEquivalent,
  assetClassLabel,
  accountTypeLabel,
} from "@/lib/format";
import { computeNetWorth, type NetWorthComputation } from "@/lib/networth";
import {
  POLICY_LIMITS,
  currentTaxYear,
  evaluatePolicy,
  isRestrictedSector,
  isTechnology,
  isSpeculative,
  allocationRows,
  type PolicyAllowance,
  type PolicyFinding,
  type PolicyInput,
  type PolicyPosition,
  type Sleeve,
} from "@/lib/policy";
import { sleeveTotals, type Position, type ToBase } from "@/lib/portfolio";

/** Accounts whose balance is a market value rather than cash. */
export const INVESTMENT_ACCOUNT_TYPES = ["isa", "gia", "crypto"];
/** Spendable cash the reserve is measured from. */
export const CASH_ACCOUNT_TYPES = ["current", "savings", "cash"];

export type CtxAccount = {
  id: string;
  nickname: string;
  institution: string | null;
  account_type: string;
  currency: string;
  current_balance: number;
  is_active: boolean;
  country: string;
  last_balance_update: string | null;
  owner_profile_id: string | null;
};

export type CtxAsset = {
  id: string;
  name: string;
  asset_class: string;
  currency: string;
  current_value: number;
  ownership_pct: number;
  is_liquid: boolean;
  last_valued_at: string | null;
  valuation_method: string | null;
  country: string | null;
  owner_profile_id: string | null;
};

export type CtxLiability = {
  id: string;
  name: string;
  liability_type: string;
  currency: string;
  outstanding_balance: number;
  interest_rate: number | null;
  monthly_payment: number | null;
  end_date: string | null;
  owner_profile_id: string | null;
};

export type CtxIncome = {
  id: string;
  label: string;
  income_type: string;
  gross_amount: number;
  net_amount: number | null;
  currency: string;
  frequency: string;
  owner_profile_id: string | null;
};

export type CtxExpense = {
  id: string;
  label: string;
  amount: number;
  currency: string;
  frequency: string;
  confidence: string;
  owner_profile_id: string | null;
};

export type CtxGoal = {
  id: string;
  title: string;
  goal_category: string;
  target_amount: number;
  funded_amount: number;
  currency: string;
  target_date: string | null;
  priority: string;
  status: string;
  country: string | null;
};

export type CtxWatch = {
  id: string;
  ticker: string;
  name: string | null;
  security_type: string | null;
  conviction: string | null;
  target_price: number | null;
  thesis: string;
  falsification: string;
};

export type CtxAllowance = {
  profile_id: string | null;
  tax_year: string;
  isa_used: number;
  jisa_used: number;
  lisa_used: number;
  pension_used: number;
  employer_match_secured: boolean;
};

export type CtxMember = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  role: string;
};

export type CtxSpending = {
  essentialMonthly: number | null;
  lifestyleMonthly: number | null;
  totalMonthly: number | null;
  incomeMonthly: number | null;
  monthsOfData: number;
  topCategories: { name: string; monthly: number; essential: boolean }[];
  movers: { name: string; current: number; previous: number; changePct: number }[];
};

export type ContextInput = {
  now?: Date;
  base: string;
  householdName: string | null;
  members: CtxMember[];
  accounts: CtxAccount[];
  assets: CtxAsset[];
  liabilities: CtxLiability[];
  income: CtxIncome[];
  expenses: CtxExpense[];
  goals: CtxGoal[];
  watchlist: CtxWatch[];
  positions: Position[];
  watchQuotes?: Record<string, { price: number | null; asOf: string | null }>;
  spending: CtxSpending | null;
  allowances: CtxAllowance[];
  marketDataAvailable: boolean;
  marketDataMessage: string | null;
  toBase: ToBase;
};

const round = (value: number | null | undefined, decimals = 0): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function monthsUntil(date: string | null, now: Date): number | null {
  if (!date) return null;
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return null;
  return (target - now.getTime()) / (86_400_000 * 30.44);
}

function personName(member: CtxMember | undefined) {
  return member?.display_name ?? member?.full_name ?? "Unnamed";
}

export type HouseholdContext = ReturnType<typeof buildHouseholdContext>["context"];

export function buildHouseholdContext(input: ContextInput) {
  const now = input.now ?? new Date();
  const { toBase, base } = input;
  const activeAccounts = input.accounts.filter((account) => account.is_active);

  const netWorth: NetWorthComputation = computeNetWorth({
    accounts: activeAccounts,
    assets: input.assets,
    liabilities: input.liabilities,
    income: input.income,
    expenses: input.expenses,
    toBase,
    base,
  });

  // ---- Liquid investable assets -----------------------------------------
  // Investment accounts are valued at their priced holdings when we have them,
  // otherwise at the recorded balance. Holdings never stack on top of the
  // account balance that already contains them.
  const pricedByAccount = new Map<string, number>();
  let unaccountedHoldingsValue = 0;
  for (const position of input.positions) {
    if (!position.priced) continue;
    const accountId = position.holding.account_id;
    if (accountId) {
      pricedByAccount.set(accountId, (pricedByAccount.get(accountId) ?? 0) + (position.marketValueBase ?? 0));
    } else {
      unaccountedHoldingsValue += position.marketValueBase ?? 0;
    }
  }

  let investableTotal = 0;
  let gbpCash = 0;
  const investableAccounts: {
    id: string;
    label: string;
    type: string;
    valueBase: number;
    source: "priced_holdings" | "recorded_balance";
  }[] = [];

  for (const account of activeAccounts) {
    if (DEBT_ACCOUNT_TYPES.includes(account.account_type)) continue;
    const recorded = toBase(Number(account.current_balance), account.currency);
    if (CASH_ACCOUNT_TYPES.includes(account.account_type)) {
      investableTotal += recorded;
      if (account.currency === "GBP") gbpCash += Number(account.current_balance);
      investableAccounts.push({
        id: account.id,
        label: account.nickname,
        type: account.account_type,
        valueBase: recorded,
        source: "recorded_balance",
      });
      continue;
    }
    if (INVESTMENT_ACCOUNT_TYPES.includes(account.account_type)) {
      const priced = pricedByAccount.get(account.id);
      const value = priced && priced > 0 ? priced : recorded;
      investableTotal += value;
      investableAccounts.push({
        id: account.id,
        label: account.nickname,
        type: account.account_type,
        valueBase: value,
        source: priced && priced > 0 ? "priced_holdings" : "recorded_balance",
      });
    }
    // SIPP and anything else locked stays out of the investable pool.
  }

  const liquidNonAccountAssets = input.assets.filter(
    (asset) =>
      asset.is_liquid && asset.asset_class !== "private_equity" && asset.asset_class !== "pension",
  );
  const liquidAssetValue = liquidNonAccountAssets.reduce(
    (sum, asset) => sum + toBase(Number(asset.current_value) * (Number(asset.ownership_pct) / 100), asset.currency),
    0,
  );
  investableTotal += liquidAssetValue + unaccountedHoldingsValue;

  // ---- Sleeves, equity pool, weights ------------------------------------
  const sleeveValues = sleeveTotals(input.positions);
  const equityPoolBase = input.positions
    .filter((p) => p.priced && ["stock", "etf", "fund"].includes(p.securityType))
    .reduce((sum, p) => sum + (p.marketValueBase ?? 0), 0);

  const policyPositions: PolicyPosition[] = input.positions.map((position) => ({
    id: position.id,
    ticker: position.ticker,
    name: position.name,
    sleeve: position.sleeve as Sleeve,
    securityType: position.securityType,
    valueBase: position.priced ? (position.marketValueBase ?? null) : null,
    costBase: position.costBase,
    weightPct:
      position.priced && investableTotal > 0
        ? ((position.marketValueBase ?? 0) / investableTotal) * 100
        : null,
    industry: position.industry,
    country: position.country,
    hasThesis: position.hasThesis,
    priced: position.priced,
  }));

  // ---- Spending, surplus, reserve ---------------------------------------
  const observedEssential = input.spending?.essentialMonthly ?? null;
  const essentialMonthly =
    observedEssential && observedEssential > 0
      ? observedEssential
      : netWorth.essentialSpend > 0
        ? netWorth.essentialSpend
        : null;
  const essentialSource: PolicyInput["essentialSource"] =
    observedEssential && observedEssential > 0
      ? "observed"
      : netWorth.essentialSpend > 0
        ? "planned"
        : "none";

  const observedSurplus =
    input.spending?.incomeMonthly != null && input.spending?.totalMonthly != null
      ? input.spending.incomeMonthly - input.spending.totalMonthly
      : null;
  const monthlySurplus =
    observedSurplus !== null ? observedSurplus : netWorth.monthlyIncome > 0 ? netWorth.netCashflow : null;
  const surplusSource = observedSurplus !== null ? "observed" : netWorth.monthlyIncome > 0 ? "planned" : "none";

  // ---- Goals -------------------------------------------------------------
  const goals = input.goals.map((goal) => {
    const targetBase = toBase(Number(goal.target_amount), goal.currency);
    const fundedBase = toBase(Number(goal.funded_amount), goal.currency);
    const monthsAway = monthsUntil(goal.target_date, now);
    const shortfall = Math.max(targetBase - fundedBase, 0);
    return {
      id: goal.id,
      title: goal.title,
      category: goal.goal_category,
      country: goal.country,
      currency: goal.currency,
      target_native: round(Number(goal.target_amount)),
      target_base: round(targetBase),
      funded_base: round(fundedBase),
      funded_pct: targetBase > 0 ? round((fundedBase / targetBase) * 100, 1) : null,
      shortfall_base: round(shortfall),
      target_date: goal.target_date,
      months_away: round(monthsAway, 1),
      monthly_required:
        monthsAway && monthsAway > 0 && shortfall > 0 ? round(shortfall / monthsAway) : null,
      priority: goal.priority,
      status: goal.status,
    };
  });

  // ---- Allowances --------------------------------------------------------
  const taxYear = currentTaxYear(now);
  const allowanceRows: (PolicyAllowance & {
    profileId: string | null;
    isaUsed: number;
    pensionUsed: number;
    jisaUsed: number;
    lisaUsed: number;
  })[] = input.members.map((member) => {
    const row = input.allowances.find(
      (allowance) => allowance.profile_id === member.id && allowance.tax_year === taxYear.label,
    );
    const isaUsed = Number(row?.isa_used ?? 0);
    const pensionUsed = Number(row?.pension_used ?? 0);
    return {
      person: personName(member),
      profileId: member.id,
      recorded: !!row,
      isaUsed,
      pensionUsed,
      jisaUsed: Number(row?.jisa_used ?? 0),
      lisaUsed: Number(row?.lisa_used ?? 0),
      isaRemaining: Math.max(POLICY_LIMITS.isaAllowance - isaUsed, 0),
      pensionRemaining: Math.max(POLICY_LIMITS.pensionAllowance - pensionUsed, 0),
      employerMatchSecured: !!row?.employer_match_secured,
    };
  });

  // ---- Debt --------------------------------------------------------------
  const debts = [
    ...input.liabilities.map((liability) => ({
      name: liability.name,
      kind: liability.liability_type,
      ratePct: liability.interest_rate === null ? null : Number(liability.interest_rate),
      balanceBase: toBase(Number(liability.outstanding_balance), liability.currency),
      monthlyPaymentBase: toBase(Number(liability.monthly_payment ?? 0), liability.currency),
      endDate: liability.end_date,
    })),
    ...activeAccounts
      .filter((account) => DEBT_ACCOUNT_TYPES.includes(account.account_type))
      .map((account) => ({
        name: `${account.nickname} (${accountTypeLabel(account.account_type)})`,
        kind: account.account_type,
        ratePct: null,
        balanceBase: Math.abs(toBase(Number(account.current_balance), account.currency)),
        monthlyPaymentBase: 0,
        endDate: null,
      })),
  ].filter((debt) => debt.balanceBase > 0);

  const highRateDebts = debts
    .filter((debt) => (debt.ratePct ?? 0) > POLICY_LIMITS.highRateDebtPct)
    .map((debt) => ({ name: debt.name, ratePct: debt.ratePct ?? 0, balanceBase: debt.balanceBase }))
    .sort((a, b) => b.ratePct - a.ratePct);

  // ---- Currency exposure --------------------------------------------------
  const currencyExposure = netWorth.allocationByCurrency.map((slice) => ({
    currency: slice.name,
    value_base: round(slice.value),
    pct_of_assets: netWorth.totalAssets > 0 ? round((slice.value / netWorth.totalAssets) * 100, 1) : null,
    soft: SOFT_CURRENCIES.includes(slice.name),
  }));

  // ---- Policy evaluation --------------------------------------------------
  const policyInput: PolicyInput = {
    base,
    netWorth: netWorth.netWorth,
    investableTotal,
    privateStakeValue: netWorth.privateStakeValue,
    gbpCash,
    essentialMonthly,
    essentialSource,
    monthlySurplus,
    sleeveValues,
    equityPoolBase,
    positions: policyPositions,
    unpricedCount: input.positions.filter((p) => !p.priced).length,
    softCurrencyValue: netWorth.softCurrencyValue,
    highRateDebts,
    goals: goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      targetBase: goal.target_base ?? 0,
      fundedBase: goal.funded_base ?? 0,
      targetDate: goal.target_date,
      monthsAway: goal.months_away,
      priority: goal.priority,
      status: goal.status,
    })),
    allowances: allowanceRows,
    daysToTaxYearEnd: taxYear.daysRemaining,
    now: now.toISOString(),
  };

  const findings: PolicyFinding[] = evaluatePolicy(policyInput);
  const allocation = allocationRows(sleeveValues, investableTotal);

  // ---- Stale records worth flagging ---------------------------------------
  const staleAssets = input.assets
    .filter((asset) => {
      if (!asset.last_valued_at) return true;
      const days = (now.getTime() - new Date(asset.last_valued_at).getTime()) / 86_400_000;
      return days > 180;
    })
    .map((asset) => ({
      name: asset.name,
      asset_class: assetClassLabel(asset.asset_class),
      value_base: round(toBase(Number(asset.current_value) * (Number(asset.ownership_pct) / 100), asset.currency)),
      last_valued_at: asset.last_valued_at,
    }));

  const staleAccounts = activeAccounts
    .filter((account) => {
      if (!account.last_balance_update) return true;
      const days = (now.getTime() - new Date(account.last_balance_update).getTime()) / 86_400_000;
      return days > 60;
    })
    .map((account) => ({
      name: account.nickname,
      last_balance_update: account.last_balance_update,
    }));

  // ---- Watchlist ----------------------------------------------------------
  const watchlist = input.watchlist.map((item) => {
    const quote = input.watchQuotes?.[item.ticker.toUpperCase()];
    const price = quote?.price ?? null;
    const target = item.target_price === null ? null : Number(item.target_price);
    return {
      ticker: item.ticker,
      name: item.name,
      conviction: item.conviction,
      target_price: target,
      price,
      price_as_of: quote?.asOf ?? null,
      distance_to_target_pct: target && price ? round(((target - price) / price) * 100, 1) : null,
      crossed_target: target !== null && price !== null ? price >= target : null,
      thesis: item.thesis,
      falsification: item.falsification,
    };
  });

  const context = {
    as_of: now.toISOString(),
    base_currency: base,
    household: {
      name: input.householdName,
      members: input.members.map((member) => ({ name: personName(member), role: member.role })),
    },
    net_worth: {
      total: round(netWorth.netWorth),
      assets: round(netWorth.totalAssets),
      liabilities: round(netWorth.totalLiabilities),
      liquid: round(netWorth.liquidNetWorth),
      illiquid: round(netWorth.illiquidNetWorth),
      private_company_stake: round(netWorth.privateStakeValue),
      property: round(netWorth.propertyValue),
      pension: round(netWorth.pensionValue),
    },
    investable: {
      total: round(investableTotal),
      note: "Liquid investable assets: cash, ISA, GIA and crypto accounts plus liquid assets. Excludes the private company stake, property, and pensions.",
      accounts: investableAccounts.map((account) => ({
        label: account.label,
        type: accountTypeLabel(account.type),
        value_base: round(account.valueBase),
        valued_from: account.source,
      })),
      priced_holdings_value: round(
        input.positions.reduce((sum, p) => sum + (p.priced ? (p.marketValueBase ?? 0) : 0), 0),
      ),
      unpriced_holdings: input.positions.filter((p) => !p.priced).length,
      equity_pool: round(equityPoolBase),
    },
    liquidity: {
      gbp_cash: round(gbpCash),
      essential_monthly: round(essentialMonthly),
      essential_source: essentialSource,
      months_covered:
        essentialMonthly && essentialMonthly > 0 ? round(gbpCash / essentialMonthly, 1) : null,
      target_months: POLICY_LIMITS.reserveMonths,
      shortfall_base:
        essentialMonthly && essentialMonthly > 0
          ? round(Math.max(POLICY_LIMITS.reserveMonths * essentialMonthly - gbpCash, 0))
          : null,
    },
    cashflow: {
      monthly_income: round(
        input.spending?.incomeMonthly != null ? input.spending.incomeMonthly : netWorth.monthlyIncome,
      ),
      monthly_spend: round(
        input.spending?.totalMonthly != null ? input.spending.totalMonthly : netWorth.monthlyExpenses,
      ),
      monthly_surplus: round(monthlySurplus),
      surplus_source: surplusSource,
      savings_rate_pct: round(netWorth.savingsRate, 1),
      months_of_statement_data: input.spending?.monthsOfData ?? 0,
      top_categories: (input.spending?.topCategories ?? []).map((category) => ({
        name: category.name,
        monthly: round(category.monthly),
        essential: category.essential,
      })),
      movers: (input.spending?.movers ?? []).map((mover) => ({
        name: mover.name,
        this_month: round(mover.current),
        last_month: round(mover.previous),
        change_pct: round(mover.changePct, 1),
      })),
    },
    allocation: allocation.map((row) => ({
      sleeve: row.sleeve,
      label: row.label,
      value_base: round(row.value),
      actual_pct: round(row.actualPct, 1),
      target_pct: row.targetPct,
      cap_pct: row.capPct,
      drift_pp: round(row.driftPp, 1),
      status: row.status,
    })),
    holdings: input.positions.map((position) => ({
      ticker: position.ticker,
      name: position.name,
      sleeve: position.sleeve,
      security_type: position.securityType,
      quantity: position.quantity,
      avg_cost: position.avgCost,
      currency: position.priceCurrency,
      price: position.price,
      price_as_of: position.asOf,
      priced: position.priced,
      price_problem: position.priced ? null : position.quoteError,
      value_base: round(position.marketValueBase),
      cost_base: round(position.costBase),
      unrealised_pct: round(position.unrealisedPct, 1),
      day_change_pct: round(position.dayChangePct, 2),
      weight_of_investable_pct:
        position.priced && investableTotal > 0
          ? round(((position.marketValueBase ?? 0) / investableTotal) * 100, 2)
          : null,
      weight_of_portfolio_pct: round(position.portfolioWeightPct, 2),
      industry: position.industry,
      country: position.country,
      speculative: isSpeculative(position.sleeve as Sleeve),
      technology: isTechnology({
        securityType: position.securityType,
        industry: position.industry,
        name: position.name,
      }),
      restricted_sector: isRestrictedSector({
        securityType: position.securityType,
        industry: position.industry,
        name: position.name,
        ticker: position.ticker,
      }),
      has_written_thesis: position.hasThesis,
      thesis: position.holding.thesis ?? null,
      falsification: position.holding.falsification ?? null,
    })),
    watchlist,
    goals,
    income: input.income.map((row) => ({
      label: row.label,
      type: row.income_type,
      owner: personName(input.members.find((member) => member.id === row.owner_profile_id)),
      monthly_base: round(
        monthlyEquivalent(
          toBase(Number(row.net_amount ?? row.gross_amount), row.currency),
          row.frequency,
        ),
      ),
      frequency: row.frequency,
    })),
    debts: debts.map((debt) => ({
      name: debt.name,
      kind: debt.kind,
      rate_pct: debt.ratePct,
      balance_base: round(debt.balanceBase),
      monthly_payment_base: round(debt.monthlyPaymentBase),
      end_date: debt.endDate,
    })),
    currency_exposure: currencyExposure,
    soft_currency_pct: round(netWorth.softCurrencyShare, 1),
    allowances: {
      tax_year: taxYear.label,
      days_to_5_april: taxYear.daysRemaining,
      isa_allowance: POLICY_LIMITS.isaAllowance,
      pension_annual_allowance: POLICY_LIMITS.pensionAllowance,
      per_person: allowanceRows.map((row) => ({
        person: row.person,
        recorded: row.recorded,
        isa_used: round(row.isaUsed),
        isa_remaining: round(row.isaRemaining),
        pension_used: round(row.pensionUsed),
        pension_remaining: round(row.pensionRemaining),
        employer_match_secured: row.employerMatchSecured,
      })),
    },
    stale_records: {
      assets_over_180_days: staleAssets,
      accounts_over_60_days: staleAccounts,
    },
    policy: findings.map((finding) => ({
      rule: finding.rule,
      id: finding.id,
      status: finding.status,
      headline: finding.headline,
    })),
    market_data: {
      available: input.marketDataAvailable,
      note:
        input.marketDataMessage ??
        (input.marketDataAvailable
          ? "Live prices available."
          : "No live prices — do not quote or estimate any price."),
    },
  };

  return { context, policyInput, findings, netWorth, investableTotal, taxYear, allowanceRows };
}

export type HouseholdContextResult = ReturnType<typeof buildHouseholdContext>;
