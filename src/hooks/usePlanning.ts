import { useCallback, useMemo } from "react";

import { useCurrency } from "./useCurrency";
import { useNetWorth } from "./useNetWorth";
import { useScope } from "./useScope";
import { useObservedSpending } from "./useObservedSpending";
import {
  useAccounts,
  useAssets,
  useCategories,
  useForecastExpenses,
  useGoalLineItems,
  useGoals,
  useIncomeStreams,
  useLiabilities,
  type AccountRow,
  type AssetRow,
  type ForecastExpenseRow,
  type GoalLineItemRow,
  type GoalRow,
  type IncomeRow,
  type LiabilityRow,
} from "./useFinancials";
import { computeGoalPlan, type GoalInput, type GoalLineItemInput } from "@/lib/goal-math";
import {
  DEFAULT_ASSUMPTIONS,
  monthIndexOf,
  runProjection,
  startOfNextMonth,
  type CurrencyExposure,
  type ForecastAssumptions,
  type ForecastExpense,
  type ForecastGoalEvent,
  type ForecastIncome,
  type ForecastInput,
  type ForecastLiability,
  type ForecastShocks,
} from "@/lib/forecast";
import { DEBT_ACCOUNT_TYPES, LOCKED_ACCOUNT_TYPES, monthlyEquivalent } from "@/lib/format";
import type { ScenarioContext } from "@/lib/scenario-presets";

/** Growth and inflation rates are stored as fractions (0.03) and shown as percentages. */
export const rateToPct = (value: number | null | undefined) => Number(value ?? 0) * 100;
export const pctToRate = (value: number) => value / 100;

const INVESTMENT_ACCOUNT_TYPES = ["isa", "gia", "crypto"];

export type SurplusEstimate = {
  /** Monthly surplus in base currency, or null when there is nothing to judge it from. */
  value: number | null;
  source: "observed" | "planned" | null;
  label: string;
  detail: string;
};

/**
 * What the household actually has spare each month. Observed statement history
 * wins over planned figures — a budget is an intention, a bank statement is a
 * fact — and when neither exists the answer is null rather than a guess.
 */
export function useMonthlySurplus(): SurplusEstimate {
  // Scoped, like everything else: "Me" has to mean my surplus, not ours.
  const nw = useNetWorth();
  const observed = useObservedSpending();

  return useMemo(() => {
    const income = observed.incomeBaseline;
    const spend = observed.spendBaseline;
    if (income !== null && spend !== null && observed.completeMonthCount >= 2) {
      return {
        value: income - spend,
        source: "observed",
        label: "Observed surplus",
        detail: `Median of ${observed.completeMonthCount} complete months of imported statements.`,
      };
    }
    if (nw.counts.income > 0) {
      return {
        value: nw.netCashflow,
        source: "planned",
        label: "Planned surplus",
        detail:
          "From recorded income and planned outgoings. Import statements for a figure based on what actually happens.",
      };
    }
    return {
      value: null,
      source: null,
      label: "Surplus unknown",
      detail: "Record income and outgoings, or import statements, before goals can be run-rated.",
    };
  }, [
    nw.counts.income,
    nw.netCashflow,
    observed.incomeBaseline,
    observed.spendBaseline,
    observed.completeMonthCount,
  ]);
}

export type GoalPlan = ReturnType<typeof computeGoalPlan>;

export function toGoalInput(goal: GoalRow): GoalInput {
  return {
    id: goal.id,
    title: goal.title,
    goal_category: goal.goal_category,
    country: goal.country,
    currency: goal.currency,
    target_amount: Number(goal.target_amount),
    funded_amount: Number(goal.funded_amount),
    target_date: goal.target_date,
    priority: goal.priority,
    status: goal.status,
    sort_order: goal.sort_order ?? 0,
    financed_amount: Number(goal.financed_amount ?? 0),
    financed_rate: goal.financed_rate === null ? null : Number(goal.financed_rate),
    financed_term_years:
      goal.financed_term_years === null ? null : Number(goal.financed_term_years),
    owner_profile_id: goal.owner_profile_id,
  };
}

export function toLineItemInput(item: GoalLineItemRow): GoalLineItemInput {
  return {
    id: item.id,
    goal_id: item.goal_id,
    label: item.label,
    kind: item.kind,
    estimated_cost: Number(item.estimated_cost),
    currency: item.currency,
    is_purchased: item.is_purchased,
    sort_order: item.sort_order ?? 0,
  };
}

/**
 * Every goal with its all-in cost, required monthly contribution and status,
 * seen from whichever side of the household is selected. Joint and unassigned
 * goals belong to both, so they survive a personal view.
 */
export function useGoalPlan() {
  const { convert, base } = useCurrency();
  const { matches } = useScope();
  const goalsQuery = useGoals();
  const itemsQuery = useGoalLineItems();
  const surplus = useMonthlySurplus();

  const loading = goalsQuery.isLoading || itemsQuery.isLoading;
  const goals = useMemo(
    () => (goalsQuery.data ?? []).filter((goal) => matches(goal.owner_profile_id)),
    [goalsQuery.data, matches],
  );
  const goalIds = useMemo(() => new Set(goals.map((goal) => goal.id)), [goals]);
  const lineItems = useMemo(
    () => (itemsQuery.data ?? []).filter((item) => goalIds.has(item.goal_id)),
    [itemsQuery.data, goalIds],
  );

  const plan = useMemo(
    () =>
      computeGoalPlan({
        goals: goals.map(toGoalInput),
        lineItems: lineItems.map(toLineItemInput),
        toBase: (amount: number, currency: string) => convert(amount, currency, base),
        monthlySurplus: surplus.value,
      }),
    [goals, lineItems, convert, base, surplus.value],
  );

  const itemsByGoal = useMemo(() => {
    const map = new Map<string, GoalLineItemRow[]>();
    for (const item of lineItems) {
      const list = map.get(item.goal_id) ?? [];
      list.push(item);
      map.set(item.goal_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    }
    return map;
  }, [lineItems]);

  /**
   * Re-run the same arithmetic at a hypothetical monthly contribution. The
   * "what if" slider on the goals page uses this so the projection it shows is
   * the plan's own maths, not a second, looser model.
   */
  const replan = useCallback(
    (monthlySurplus: number | null) =>
      computeGoalPlan({
        goals: goals.map(toGoalInput),
        lineItems: lineItems.map(toLineItemInput),
        toBase: (amount: number, currency: string) => convert(amount, currency, base),
        monthlySurplus,
      }),
    [goals, lineItems, convert, base],
  );

  return { loading, plan, goals, lineItems, itemsByGoal, surplus, base, replan };
}

// ---------------------------------------------------------------------------
// Forecast assembly
// ---------------------------------------------------------------------------

function bucketOfAccount(account: AccountRow) {
  if (DEBT_ACCOUNT_TYPES.includes(account.account_type)) return "debt" as const;
  if (LOCKED_ACCOUNT_TYPES.includes(account.account_type)) return "pension" as const;
  if (INVESTMENT_ACCOUNT_TYPES.includes(account.account_type)) return "investments" as const;
  return "cash" as const;
}

function bucketOfAsset(asset: AssetRow) {
  if (asset.asset_class === "pension") return "pension" as const;
  if (asset.is_liquid) return "investments" as const;
  return "illiquid" as const;
}

export type ForecastSource = {
  input: ForecastInput;
  start: Date;
  /** Why the projection cannot be trusted yet, in the household's own terms. */
  gaps: string[];
  hasData: boolean;
  scenarioContext: ScenarioContext;
};

/**
 * Builds the projection input from recorded data only. Every figure traces
 * back to an account, asset, liability, income stream, expense line or goal —
 * nothing here is invented, and gaps are reported rather than filled.
 */
export function useForecastSource(
  assumptions: ForecastAssumptions = DEFAULT_ASSUMPTIONS,
): ForecastSource {
  const { convert, base } = useCurrency();
  const { matches } = useScope();
  const accountsQuery = useAccounts();
  const assetsQuery = useAssets();
  const liabilitiesQuery = useLiabilities();
  const incomeQuery = useIncomeStreams();
  const expensesQuery = useForecastExpenses();
  const categoriesQuery = useCategories();
  const observed = useObservedSpending();
  const { plan } = useGoalPlan();

  return useMemo(() => {
    const toBase = (amount: number, currency: string) => convert(Number(amount), currency, base);
    const start = startOfNextMonth();
    // The projection is only as scoped as the page showing it: "Me" must
    // project my position, not the household's.
    const accounts = (accountsQuery.data ?? []).filter(
      (account) => account.is_active && matches(account.owner_profile_id),
    );
    const assets = (assetsQuery.data ?? []).filter((row) => matches(row.owner_profile_id));
    const liabilityRows = (liabilitiesQuery.data ?? []).filter((row) =>
      matches(row.owner_profile_id),
    );
    const incomeRows = (incomeQuery.data ?? []).filter((row) => matches(row.owner_profile_id));
    const expenseRows = (expensesQuery.data ?? []).filter((row) => matches(row.owner_profile_id));
    const categories = categoriesQuery.data ?? [];

    let cash = 0;
    let investments = 0;
    let pension = 0;
    let illiquid = 0;
    const exposure = new Map<string, CurrencyExposure>();
    const bumpExposure = (
      currency: string,
      key: "cash" | "investments" | "illiquid",
      value: number,
    ) => {
      const row = exposure.get(currency) ?? { currency, cash: 0, investments: 0, illiquid: 0 };
      row[key] += value;
      exposure.set(currency, row);
    };

    const debtAccounts: AccountRow[] = [];
    for (const account of accounts) {
      const value = toBase(account.current_balance, account.currency);
      const bucket = bucketOfAccount(account);
      if (bucket === "debt") {
        debtAccounts.push(account);
        continue;
      }
      if (bucket === "cash") {
        cash += value;
        bumpExposure(account.currency, "cash", value);
      } else if (bucket === "investments") {
        investments += value;
        bumpExposure(account.currency, "investments", value);
      } else {
        pension += value;
        bumpExposure(account.currency, "investments", value);
      }
    }

    let privateStakeValue = 0;
    for (const asset of assets) {
      const value = toBase(
        Number(asset.current_value) * (Number(asset.ownership_pct) / 100),
        asset.currency,
      );
      const bucket = bucketOfAsset(asset);
      if (bucket === "pension") {
        pension += value;
        bumpExposure(asset.currency, "investments", value);
      } else if (bucket === "investments") {
        investments += value;
        bumpExposure(asset.currency, "investments", value);
      } else {
        illiquid += value;
        bumpExposure(asset.currency, "illiquid", value);
      }
      if (asset.asset_class === "private_equity") privateStakeValue += value;
    }

    const liabilities: ForecastLiability[] = [
      ...liabilityRows.map((row: LiabilityRow) => ({
        id: row.id,
        label: row.name,
        balance: toBase(row.outstanding_balance, row.currency),
        annualRatePct: row.interest_rate === null ? null : Number(row.interest_rate),
        monthlyPayment:
          row.monthly_payment === null ? null : toBase(row.monthly_payment, row.currency),
        endMonth: monthIndexOf(row.end_date, start),
      })),
      ...debtAccounts.map((account) => ({
        id: account.id,
        label: account.nickname,
        balance: Math.abs(toBase(account.current_balance, account.currency)),
        annualRatePct: null,
        monthlyPayment: null,
        endMonth: null,
      })),
    ].filter((row) => row.balance > 0.5);

    const income: ForecastIncome[] = incomeRows.map((row: IncomeRow) => ({
      id: row.id,
      label: row.label,
      monthly: monthlyEquivalent(
        toBase(Number(row.net_amount ?? row.gross_amount), row.currency),
        row.frequency,
      ),
      growthPct: rateToPct(row.annual_growth_rate),
      incomeType: row.income_type,
      startMonth: null,
      endMonth: null,
    }));

    const essentialCategories = new Set(
      categories.filter((category) => category.is_essential).map((category) => category.id),
    );

    const expenses: ForecastExpense[] = expenseRows.map((row: ForecastExpenseRow) => {
      const amountBase = toBase(row.amount, row.currency);
      const oneOff = row.frequency === "one_off";
      const startMonth = monthIndexOf(row.start_date, start);
      const endMonth = monthIndexOf(row.end_date, start);
      return {
        id: row.id,
        label: row.label,
        monthly: oneOff ? amountBase : monthlyEquivalent(amountBase, row.frequency),
        oneOff,
        inflationPct: rateToPct(row.inflation_rate),
        confidence: (row.confidence as ForecastExpense["confidence"]) ?? "committed",
        // A one-off with no date lands in the first month rather than never.
        startMonth: oneOff
          ? Math.max(1, (startMonth ?? 0) + 1)
          : startMonth === null
            ? null
            : startMonth + 1,
        endMonth: endMonth === null ? null : endMonth + 1,
        isEssential: row.category_id ? essentialCategories.has(row.category_id) : false,
      };
    });

    const goals: ForecastGoalEvent[] = plan.rows
      .filter((row) => row.goal.status !== "achieved" && row.goal.status !== "paused")
      .map((row) => {
        const index = monthIndexOf(row.goal.target_date, start);
        return {
          id: row.goal.id,
          title: row.goal.title,
          month: index === null ? 0 : Math.max(1, index + 1),
          // The whole cash cost leaves at completion: money already set aside
          // is sitting in the accounts this projection starts from.
          cashOutflow: row.cashNeeded,
          capitalValue: row.capitalValue,
          financedAmount: row.financed,
          financedRatePct: row.goal.financed_rate,
          financedTermYears: row.goal.financed_term_years,
          priorityRank: row.priorityRank,
          skipped: index === null || row.allIn <= 0,
        };
      })
      .filter((goal) => !goal.skipped);

    const gaps: string[] = [];
    if (!income.length)
      gaps.push("No income streams recorded, so the projection has nothing coming in.");
    if (!expenses.length && observed.essentialBaseline === null)
      gaps.push(
        "No planned outgoings and no imported statements, so monthly costs are missing from the projection.",
      );
    const undatedGoals = plan.open.filter((row) => row.goal.target_date === null).length;
    if (undatedGoals > 0)
      gaps.push(
        `${undatedGoals} goal${undatedGoals === 1 ? "" : "s"} without a target date ${undatedGoals === 1 ? "is" : "are"} left out of the projection.`,
      );
    const unpricedGoals = plan.open.filter((row) => row.allIn <= 0).length;
    if (unpricedGoals > 0)
      gaps.push(
        `${unpricedGoals} unpriced goal${unpricedGoals === 1 ? "" : "s"} cannot be projected until ${unpricedGoals === 1 ? "it has" : "they have"} a cost.`,
      );

    const input: ForecastInput = {
      base,
      cash,
      investments,
      pension,
      illiquid,
      privateStakeValue,
      income,
      expenses,
      liabilities,
      goals,
      exposureByCurrency: Array.from(exposure.values()),
      essentialMonthly: observed.essentialBaseline,
      assumptions,
      startDate: start,
    };

    const scenarioContext: ScenarioContext = {
      start,
      base,
      goals: plan.open.map((row) => {
        const index = monthIndexOf(row.goal.target_date, start);
        return {
          id: row.goal.id,
          title: row.goal.title,
          month: index === null ? 1 : Math.max(1, index + 1),
          targetDate: row.goal.target_date,
          category: row.goal.goal_category,
        };
      }),
      income: income.map((row) => ({ id: row.id, label: row.label, monthly: row.monthly })),
      expenses: expenses.map((row) => ({
        id: row.id,
        label: row.label,
        endMonth: row.endMonth,
        monthly: row.monthly,
      })),
      currencies: Array.from(exposure.keys()).filter((code) => code !== base),
      privateStakeValue,
      investments,
      hasLiabilities: liabilities.length > 0,
    };

    return {
      input,
      start,
      gaps,
      hasData: accounts.length + assets.length + income.length + expenses.length > 0,
      scenarioContext,
    };
  }, [
    accountsQuery.data,
    assetsQuery.data,
    liabilitiesQuery.data,
    incomeQuery.data,
    expensesQuery.data,
    categoriesQuery.data,
    observed.essentialBaseline,
    plan,
    assumptions,
    matches,
    convert,
    base,
  ]);
}

/** The baseline projection, plus a helper for running a variant of it. */
export function useProjection(assumptions: ForecastAssumptions, shocks?: ForecastShocks) {
  const source = useForecastSource(assumptions);
  const result = useMemo(
    () => runProjection({ ...source.input, assumptions, shocks: shocks ?? {} }),
    [source.input, assumptions, shocks],
  );
  return { source, result };
}
