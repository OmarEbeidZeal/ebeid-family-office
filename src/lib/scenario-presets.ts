/**
 * Scenario presets.
 *
 * A scenario is the baseline projection with one thing changed. Every preset
 * asks for the figures it cannot know — a valuation, a monthly cost, a date —
 * rather than assuming them, and stores those inputs so the comparison can be
 * replayed and argued with later.
 */
import { monthIndexOf, type ForecastAssumptions, type ForecastShocks } from "./forecast";

export type ScenarioParamKind =
  "money" | "percent" | "months" | "years" | "date" | "goal" | "income" | "expense" | "currency";

export type ScenarioParam = {
  key: string;
  label: string;
  kind: ScenarioParamKind;
  hint?: string;
  optional?: boolean;
};

export type ScenarioParams = Record<string, string | number>;

export type ScenarioContext = {
  start: Date;
  base: string;
  goals: {
    id: string;
    title: string;
    month: number;
    targetDate: string | null;
    category: string;
  }[];
  income: { id: string; label: string; monthly: number }[];
  expenses: { id: string; label: string; endMonth: number | null; monthly: number }[];
  currencies: string[];
  privateStakeValue: number;
  investments: number;
  hasLiabilities: boolean;
};

export type ResolvedScenario = {
  shocks: ForecastShocks;
  assumptions: Partial<ForecastAssumptions>;
  /** One line describing exactly what was changed, shown beside the results. */
  summary: string;
};

export type ScenarioPreset = {
  key: string;
  name: string;
  headline: string;
  group: "Goals" | "Markets" | "Income" | "Currency & rates";
  params: ScenarioParam[];
  /** Why this preset cannot run yet, given what the household has recorded. */
  unavailable: (ctx: ScenarioContext) => string | null;
  defaults: (ctx: ScenarioContext) => ScenarioParams;
  resolve: (params: ScenarioParams, ctx: ScenarioContext) => ResolvedScenario;
};

const num = (params: ScenarioParams, key: string, fallback = 0) => {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
};

const str = (params: ScenarioParams, key: string) => String(params[key] ?? "");

function monthFromDate(value: string, ctx: ScenarioContext, fallback = 1) {
  const index = monthIndexOf(value, ctx.start);
  if (index === null) return fallback;
  return Math.max(1, index + 1);
}

function isoInYears(ctx: ScenarioContext, years: number) {
  const date = new Date(ctx.start);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function goalLabel(ctx: ScenarioContext, id: string) {
  return ctx.goals.find((goal) => goal.id === id)?.title ?? "the goal";
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    key: "goal_move",
    name: "Move a goal's date",
    headline: "Buy in 2027 instead of 2029 — or the other way round.",
    group: "Goals",
    params: [
      { key: "goalId", label: "Goal", kind: "goal" },
      { key: "date", label: "New completion date", kind: "date" },
    ],
    unavailable: (ctx) =>
      ctx.goals.length ? null : "Add a goal with a target date before modelling a change to it.",
    defaults: (ctx) => ({
      goalId: ctx.goals[0]?.id ?? "",
      date: ctx.goals[0]?.targetDate ?? isoInYears(ctx, 2),
    }),
    resolve: (params, ctx) => {
      const goalId = str(params, "goalId");
      const goal = ctx.goals.find((row) => row.id === goalId);
      const target = monthFromDate(str(params, "date"), ctx, goal?.month ?? 1);
      const shift = goal ? target - goal.month : 0;
      return {
        shocks: { goalShiftMonths: goalId ? { [goalId]: shift } : {} },
        assumptions: {},
        summary: `${goalLabel(ctx, goalId)} completes ${new Date(`${str(params, "date")}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} — ${shift === 0 ? "unchanged" : shift > 0 ? `${shift} months later` : `${Math.abs(shift)} months earlier`}.`,
      };
    },
  },
  {
    key: "rent_longer",
    name: "Rent for longer",
    headline: "Push the purchase out and keep paying rent in the meantime.",
    group: "Goals",
    params: [
      { key: "goalId", label: "Property goal", kind: "goal" },
      { key: "years", label: "Extra years renting", kind: "years" },
      { key: "expenseId", label: "Rent line to extend", kind: "expense", optional: true },
    ],
    unavailable: (ctx) =>
      ctx.goals.some((goal) => goal.category === "property")
        ? null
        : "Add a property goal before modelling a longer rental.",
    defaults: (ctx) => ({
      goalId: ctx.goals.find((goal) => goal.category === "property")?.id ?? ctx.goals[0]?.id ?? "",
      years: 5,
      expenseId: "",
    }),
    resolve: (params, ctx) => {
      const goalId = str(params, "goalId");
      const years = num(params, "years", 5);
      const shift = Math.round(years * 12);
      const expenseId = str(params, "expenseId");
      const shocks: ForecastShocks = { goalShiftMonths: goalId ? { [goalId]: shift } : {} };
      if (expenseId) shocks.expenseEndShiftMonths = { [expenseId]: shift };
      const rent = ctx.expenses.find((row) => row.id === expenseId);
      return {
        shocks,
        assumptions: {},
        summary: `${goalLabel(ctx, goalId)} deferred ${years} year${years === 1 ? "" : "s"}${rent ? `, with ${rent.label} continuing throughout` : ""}.`,
      };
    },
  },
  {
    key: "goal_drop",
    name: "Drop a goal",
    headline: "What the plan looks like without it.",
    group: "Goals",
    params: [{ key: "goalId", label: "Goal", kind: "goal" }],
    unavailable: (ctx) => (ctx.goals.length ? null : "No goals recorded yet."),
    defaults: (ctx) => ({ goalId: ctx.goals[ctx.goals.length - 1]?.id ?? "" }),
    resolve: (params, ctx) => ({
      shocks: { goalsSkipped: [str(params, "goalId")] },
      assumptions: {},
      summary: `${goalLabel(ctx, str(params, "goalId"))} removed from the plan.`,
    }),
  },
  {
    key: "liquidity_event",
    name: "Private stake liquidity event",
    headline: "A secondary sale or exit at a valuation you set.",
    group: "Markets",
    params: [
      { key: "gross", label: "Gross proceeds to the household", kind: "money" },
      {
        key: "taxPct",
        label: "Tax on the gain",
        kind: "percent",
        hint: "CGT, or 14% if BADR applies",
      },
      { key: "date", label: "Completion date", kind: "date" },
    ],
    unavailable: (ctx) =>
      ctx.privateStakeValue > 0
        ? null
        : "Record the private shareholding on the balance sheet before modelling a sale of it.",
    defaults: (ctx) => ({ gross: 0, taxPct: 24, date: isoInYears(ctx, 2) }),
    resolve: (params, ctx) => {
      const gross = num(params, "gross");
      const taxPct = num(params, "taxPct");
      return {
        shocks: {
          liquidityEvent: {
            month: monthFromDate(str(params, "date"), ctx),
            grossProceeds: gross,
            taxPct,
            carryingValue: ctx.privateStakeValue,
          },
        },
        assumptions: {},
        summary: `Stake sold for ${ctx.base} ${gross.toLocaleString("en-GB")} gross, ${taxPct}% tax, against a carrying value of ${ctx.base} ${Math.round(ctx.privateStakeValue).toLocaleString("en-GB")}.`,
      };
    },
  },
  {
    key: "market_drawdown",
    name: "Market drawdown",
    headline: "A one-off fall across invested and pension assets.",
    group: "Markets",
    params: [
      { key: "pct", label: "Fall", kind: "percent" },
      { key: "date", label: "When", kind: "date" },
    ],
    unavailable: (ctx) =>
      ctx.investments > 0
        ? null
        : "No invested balances recorded, so a market fall would have nothing to hit.",
    defaults: (ctx) => ({ pct: 30, date: isoInYears(ctx, 1) }),
    resolve: (params, ctx) => ({
      shocks: {
        marketDrawdown: {
          month: monthFromDate(str(params, "date"), ctx),
          pct: num(params, "pct", 30),
        },
      },
      assumptions: {},
      summary: `Invested and pension assets fall ${num(params, "pct", 30)}% in one month, then resume the assumed return.`,
    }),
  },
  {
    key: "income_pause",
    name: "Income pauses",
    headline: "Maternity leave, a sabbatical, or a gap between roles.",
    group: "Income",
    params: [
      { key: "incomeId", label: "Income stream", kind: "income" },
      { key: "date", label: "Starts", kind: "date" },
      { key: "months", label: "Months paused", kind: "months" },
      {
        key: "replacementPct",
        label: "Share still received",
        kind: "percent",
        hint: "Statutory or enhanced pay as a share of normal income",
      },
    ],
    unavailable: (ctx) =>
      ctx.income.length ? null : "Record an income stream before modelling a pause in it.",
    defaults: (ctx) => ({
      incomeId: ctx.income[0]?.id ?? "",
      date: isoInYears(ctx, 1),
      months: 12,
      replacementPct: 0,
    }),
    resolve: (params, ctx) => {
      const incomeId = str(params, "incomeId");
      const stream = ctx.income.find((row) => row.id === incomeId);
      const months = num(params, "months", 12);
      const replacementPct = num(params, "replacementPct");
      return {
        shocks: {
          incomePause: {
            incomeId: incomeId || null,
            startMonth: monthFromDate(str(params, "date"), ctx),
            months,
            replacementPct,
          },
        },
        assumptions: {},
        summary: `${stream?.label ?? "Income"} drops to ${replacementPct}% for ${months} months.`,
      };
    },
  },
  {
    key: "new_dependant",
    name: "A new child",
    headline: "Ongoing monthly cost plus a one-off setup, both figures yours.",
    group: "Income",
    params: [
      {
        key: "monthly",
        label: "Extra monthly cost",
        kind: "money",
        hint: "Nursery, childcare, everything recurring",
      },
      { key: "setup", label: "One-off setup cost", kind: "money", optional: true },
      { key: "date", label: "Starts", kind: "date" },
      { key: "years", label: "Years at this cost", kind: "years" },
    ],
    unavailable: () => null,
    defaults: (ctx) => ({ monthly: 0, setup: 0, date: isoInYears(ctx, 1), years: 5 }),
    resolve: (params, ctx) => {
      const startMonth = monthFromDate(str(params, "date"), ctx);
      const monthly = num(params, "monthly");
      const setup = num(params, "setup");
      const years = num(params, "years", 5);
      const extras = [];
      if (monthly > 0) {
        extras.push({
          id: "scenario-dependant-monthly",
          label: "New child — monthly cost",
          monthly,
          oneOff: false,
          inflationPct: 4,
          confidence: "committed" as const,
          startMonth,
          endMonth: startMonth + Math.round(years * 12) - 1,
          isEssential: true,
        });
      }
      if (setup > 0) {
        extras.push({
          id: "scenario-dependant-setup",
          label: "New child — setup",
          monthly: setup,
          oneOff: true,
          inflationPct: 0,
          confidence: "committed" as const,
          startMonth,
          endMonth: startMonth,
          isEssential: true,
        });
      }
      return {
        shocks: { extraExpenses: extras },
        assumptions: {},
        summary: `${ctx.base} ${monthly.toLocaleString("en-GB")} a month for ${years} years${setup > 0 ? `, plus ${ctx.base} ${setup.toLocaleString("en-GB")} up front` : ""}.`,
      };
    },
  },
  {
    key: "fx_devaluation",
    name: "Currency devaluation",
    headline: "A further fall in a soft currency you hold.",
    group: "Currency & rates",
    params: [
      { key: "currency", label: "Currency", kind: "currency" },
      { key: "pct", label: "Fall against sterling", kind: "percent" },
      { key: "date", label: "When", kind: "date" },
    ],
    unavailable: (ctx) =>
      ctx.currencies.length
        ? null
        : "No non-sterling assets recorded, so there is no exposure to devalue.",
    defaults: (ctx) => ({
      currency: ctx.currencies.includes("EGP") ? "EGP" : (ctx.currencies[0] ?? "EGP"),
      pct: 25,
      date: isoInYears(ctx, 1),
    }),
    resolve: (params, ctx) => ({
      shocks: {
        fxShock: {
          currency: str(params, "currency"),
          pct: num(params, "pct", 25),
          month: monthFromDate(str(params, "date"), ctx),
        },
      },
      assumptions: {},
      summary: `Everything held in ${str(params, "currency")} loses ${num(params, "pct", 25)}% of its sterling value.`,
    }),
  },
  {
    key: "rate_rise",
    name: "Interest rates rise",
    headline: "Every borrowing costs more, month after month.",
    group: "Currency & rates",
    params: [{ key: "points", label: "Rate rise", kind: "percent", hint: "Percentage points" }],
    unavailable: (ctx) =>
      ctx.hasLiabilities
        ? null
        : "No borrowings recorded, so a rate rise would not change the projection.",
    defaults: () => ({ points: 2 }),
    resolve: (params) => ({
      shocks: { rateShockPct: num(params, "points", 2) },
      assumptions: {},
      summary: `All borrowing costs rise ${num(params, "points", 2)} percentage points.`,
    }),
  },
];

export function presetByKey(key: string | null | undefined) {
  return SCENARIO_PRESETS.find((preset) => preset.key === key) ?? null;
}

/** What a scenario row stores in `assumptions`. */
export type ScenarioDefinition = {
  version: 1;
  presetKey: string | null;
  params: ScenarioParams;
  /** Assumption overrides layered on top of the baseline. */
  overrides: Partial<ForecastAssumptions>;
};

export function emptyDefinition(): ScenarioDefinition {
  return { version: 1, presetKey: null, params: {}, overrides: {} };
}

export function parseDefinition(value: unknown): ScenarioDefinition {
  if (!value || typeof value !== "object") return emptyDefinition();
  const raw = value as Partial<ScenarioDefinition>;
  return {
    version: 1,
    presetKey: typeof raw.presetKey === "string" ? raw.presetKey : null,
    params: raw.params && typeof raw.params === "object" ? (raw.params as ScenarioParams) : {},
    overrides:
      raw.overrides && typeof raw.overrides === "object"
        ? (raw.overrides as Partial<ForecastAssumptions>)
        : {},
  };
}

export function resolveDefinition(
  definition: ScenarioDefinition,
  ctx: ScenarioContext,
): ResolvedScenario {
  const preset = presetByKey(definition.presetKey);
  if (!preset) {
    return {
      shocks: {},
      assumptions: definition.overrides,
      summary: describeOverrides(definition.overrides),
    };
  }
  const resolved = preset.resolve(definition.params, ctx);
  const overrideSummary = describeOverrides(definition.overrides);
  return {
    shocks: resolved.shocks,
    assumptions: { ...resolved.assumptions, ...definition.overrides },
    summary: overrideSummary ? `${resolved.summary} ${overrideSummary}` : resolved.summary,
  };
}

export function describeOverrides(overrides: Partial<ForecastAssumptions>) {
  const parts: string[] = [];
  if (overrides.investmentReturnPct !== undefined)
    parts.push(`return ${overrides.investmentReturnPct}%`);
  if (overrides.inflationPct !== undefined) parts.push(`inflation ${overrides.inflationPct}%`);
  if (overrides.salaryGrowthPct !== undefined)
    parts.push(`salary growth ${overrides.salaryGrowthPct}%`);
  if (overrides.includePossible !== undefined)
    parts.push(overrides.includePossible ? "possible costs included" : "possible costs excluded");
  return parts.length ? `Assumptions: ${parts.join(", ")}.` : "";
}
