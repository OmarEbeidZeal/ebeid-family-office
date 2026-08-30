/**
 * Goal arithmetic: the all-in cost, what it takes per month, and whether the
 * household's actual surplus covers it.
 *
 * Pure functions over structural inputs, so the goals page, the forecast and
 * the advisor all answer from identical numbers. Nothing here estimates a cost
 * the household has not entered — an unpriced goal comes back `unpriced`.
 */

export type ToBase = (amount: number, currency: string) => number;

export type GoalInput = {
  id: string;
  title: string;
  goal_category: string;
  country: string | null;
  currency: string;
  target_amount: number;
  funded_amount: number;
  target_date: string | null;
  priority: string;
  status: string;
  sort_order: number;
  financed_amount: number;
  financed_rate: number | null;
  financed_term_years: number | null;
  owner_profile_id: string | null;
};

export type GoalLineItemInput = {
  id: string;
  goal_id: string;
  label: string;
  kind: string;
  estimated_cost: number;
  currency: string;
  is_purchased: boolean;
  sort_order: number;
};

export const LINE_ITEM_KINDS = [
  { value: "purchase", label: "Purchase price", capital: true },
  { value: "tax", label: "Tax / duty", capital: false },
  { value: "fees", label: "Professional fees", capital: false },
  { value: "survey", label: "Survey", capital: false },
  { value: "mortgage", label: "Lender fees", capital: false },
  { value: "moving", label: "Moving", capital: false },
  { value: "furnishing", label: "Furnishing", capital: false },
  { value: "contingency", label: "Contingency", capital: false },
  { value: "other", label: "Other", capital: false },
] as const;

export const LINE_ITEM_KIND_LABELS: Record<string, string> = Object.fromEntries(
  LINE_ITEM_KINDS.map((kind) => [kind.value, kind.label]),
);

/** Line-item kinds whose spend becomes an asset rather than a cost. */
const CAPITAL_KINDS = new Set<string>(
  LINE_ITEM_KINDS.filter((kind) => kind.capital).map((kind) => kind.value),
);

export const PRIORITY_RANK: Record<string, number> = {
  must_have: 0,
  want: 1,
  nice_to_have: 2,
};

export type GoalStatus =
  "achieved" | "on_track" | "behind" | "at_risk" | "unpriced" | "undated" | "paused";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  achieved: "Achieved",
  on_track: "On track",
  behind: "Behind",
  at_risk: "At risk",
  unpriced: "Unpriced",
  undated: "No date",
  paused: "Paused",
};

export type GoalHorizon = "near" | "medium" | "long";

export const HORIZON_RULES: Record<
  GoalHorizon,
  { label: string; maxEquityPct: number; guidance: string }
> = {
  near: {
    label: "Under 2 years",
    maxEquityPct: 0,
    guidance:
      "Policy rule 11: money needed inside two years is held in cash. A 20% drawdown three months before completion cannot be waited out.",
  },
  medium: {
    label: "2–5 years",
    maxEquityPct: 40,
    guidance:
      "Policy rule 11: up to 40% equity at this horizon, the balance in cash or short bonds.",
  },
  long: {
    label: "Over 5 years",
    maxEquityPct: 100,
    guidance: "Policy rule 11: beyond five years the standard portfolio allocation applies.",
  },
};

const MS_PER_MONTH = 86_400_000 * 30.4375;

export function monthsUntil(date: string | null | undefined, from = new Date()): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  return (target - from.getTime()) / MS_PER_MONTH;
}

export function horizonOf(months: number | null): GoalHorizon | null {
  if (months === null) return null;
  if (months < 24) return "near";
  if (months <= 60) return "medium";
  return "long";
}

export type GoalCosts = {
  /** Sum of every line item, in base currency. */
  allIn: number;
  /** Line-item spend that becomes an asset (the purchase price itself). */
  capital: number;
  /** All-in less the capital portion — the part that is pure cost. */
  frictionCost: number;
  /** Line items already paid for. */
  secured: number;
  /** Line items still sitting at zero — prompts nobody has priced yet. */
  unpricedItems: number;
  byKind: { kind: string; label: string; total: number; count: number }[];
  itemCount: number;
};

export function costOfLineItems(items: GoalLineItemInput[], toBase: ToBase): GoalCosts {
  const byKind = new Map<string, { total: number; count: number }>();
  let allIn = 0;
  let capital = 0;
  let secured = 0;

  for (const item of items) {
    const value = toBase(Number(item.estimated_cost), item.currency);
    allIn += value;
    if (CAPITAL_KINDS.has(item.kind)) capital += value;
    if (item.is_purchased) secured += value;
    const bucket = byKind.get(item.kind) ?? { total: 0, count: 0 };
    bucket.total += value;
    bucket.count += 1;
    byKind.set(item.kind, bucket);
  }

  return {
    allIn,
    capital,
    frictionCost: allIn - capital,
    secured,
    unpricedItems: items.filter((item) => Number(item.estimated_cost) <= 0).length,
    itemCount: items.length,
    byKind: Array.from(byKind.entries())
      .map(([kind, bucket]) => ({
        kind,
        label: LINE_ITEM_KIND_LABELS[kind] ?? kind,
        total: bucket.total,
        count: bucket.count,
      }))
      .sort((a, b) => b.total - a.total),
  };
}

export type GoalPlanRow = {
  goal: GoalInput;
  items: GoalLineItemInput[];
  costs: GoalCosts;
  /** The headline figure on the goal record, in base currency. */
  headline: number;
  /** Line-item total where one exists, otherwise the headline. */
  allIn: number;
  /** How far the costed breakdown exceeds the headline figure. */
  gap: number;
  hasBreakdown: boolean;
  funded: number;
  financed: number;
  /** Cash the household has to find: all-in, less borrowing, less what is set aside. */
  remaining: number;
  /** Total cash at completion, before anything already set aside. */
  cashNeeded: number;
  progressPct: number;
  monthsRemaining: number | null;
  requiredMonthly: number | null;
  allocatedMonthly: number;
  /** Months to fund at the allocated rate — null when nothing is allocated. */
  monthsAtCurrentRate: number | null;
  slipMonths: number | null;
  status: GoalStatus;
  statusReason: string;
  horizon: GoalHorizon | null;
  priorityRank: number;
  /** Value that lands on the balance sheet when the goal completes. */
  capitalValue: number;
  /** Net worth cost of completing: the friction that buys nothing. */
  netWorthCost: number;
};

export type GoalPlanInput = {
  goals: GoalInput[];
  lineItems: GoalLineItemInput[];
  toBase: ToBase;
  /** Real monthly surplus available to fund goals; null when unknown. */
  monthlySurplus: number | null;
  today?: Date;
};

export function orderGoals(goals: GoalInput[]) {
  return [...goals].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    const priority = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (priority !== 0) return priority;
    if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
    if (a.target_date) return -1;
    if (b.target_date) return 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Every open goal, in priority order, with the monthly contribution each needs
 * and the share of real surplus it gets. Surplus is handed out top-down: when
 * it runs out, the goals at the bottom of the list are the ones that give.
 */
export function computeGoalPlan(input: GoalPlanInput) {
  const today = input.today ?? new Date();
  const itemsByGoal = new Map<string, GoalLineItemInput[]>();
  for (const item of input.lineItems) {
    const list = itemsByGoal.get(item.goal_id) ?? [];
    list.push(item);
    itemsByGoal.set(item.goal_id, list);
  }
  for (const list of itemsByGoal.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  }

  const ordered = orderGoals(input.goals);

  const draft = ordered.map((goal) => {
    const items = itemsByGoal.get(goal.id) ?? [];
    const costs = costOfLineItems(items, input.toBase);
    const headline = input.toBase(Number(goal.target_amount), goal.currency);
    // Prompt rows added with no figure yet must not make a priced goal look
    // unpriced: the breakdown only takes over once it carries a real cost.
    const hasBreakdown = costs.allIn > 0;
    const allIn = hasBreakdown ? costs.allIn : headline;
    const funded = input.toBase(Number(goal.funded_amount), goal.currency);
    const financed = input.toBase(Number(goal.financed_amount ?? 0), goal.currency);
    const cashNeeded = Math.max(0, allIn - financed);
    const remaining = Math.max(0, cashNeeded - funded);
    const monthsRemaining = monthsUntil(goal.target_date, today);
    const capitalValue = hasBreakdown
      ? costs.capital
      : goal.goal_category === "property"
        ? headline
        : 0;

    return {
      goal,
      items,
      costs,
      headline,
      allIn,
      gap: hasBreakdown ? allIn - headline : 0,
      hasBreakdown,
      funded,
      financed,
      cashNeeded,
      remaining,
      progressPct: cashNeeded > 0 ? Math.min(100, (funded / cashNeeded) * 100) : 0,
      monthsRemaining,
      horizon: horizonOf(monthsRemaining),
      priorityRank: PRIORITY_RANK[goal.priority] ?? 9,
      capitalValue,
      netWorthCost: Math.max(0, allIn - capitalValue),
    };
  });

  // Required monthly contribution from today. A goal already funded needs
  // nothing; a goal whose date has passed needs the whole balance now.
  const withRequirement = draft.map((row) => {
    const unpriced = row.allIn <= 0;
    const settled = row.goal.status === "achieved" || (!unpriced && row.remaining <= 0.5);
    const divisor = row.monthsRemaining === null ? null : Math.max(row.monthsRemaining, 1);
    const requiredMonthly =
      settled || unpriced || divisor === null ? null : row.remaining / divisor;
    return { ...row, requiredMonthly, unpriced, settled };
  });

  let pool = input.monthlySurplus !== null ? Math.max(0, input.monthlySurplus) : null;

  const rows: GoalPlanRow[] = withRequirement.map((row) => {
    let allocatedMonthly = 0;
    if (pool !== null && row.requiredMonthly !== null && row.goal.status !== "paused") {
      allocatedMonthly = Math.min(row.requiredMonthly, pool);
      pool -= allocatedMonthly;
    }

    const monthsAtCurrentRate =
      allocatedMonthly > 0 ? row.remaining / allocatedMonthly : row.remaining > 0 ? null : 0;
    const slipMonths =
      monthsAtCurrentRate !== null && row.monthsRemaining !== null
        ? Math.max(0, monthsAtCurrentRate - row.monthsRemaining)
        : null;

    const { status, statusReason } = classify(row, allocatedMonthly, slipMonths, input);

    return {
      goal: row.goal,
      items: row.items,
      costs: row.costs,
      headline: row.headline,
      allIn: row.allIn,
      gap: row.gap,
      hasBreakdown: row.hasBreakdown,
      funded: row.funded,
      financed: row.financed,
      remaining: row.remaining,
      cashNeeded: row.cashNeeded,
      progressPct: row.progressPct,
      monthsRemaining: row.monthsRemaining,
      requiredMonthly: row.requiredMonthly,
      allocatedMonthly,
      monthsAtCurrentRate,
      slipMonths,
      status,
      statusReason,
      horizon: row.horizon,
      priorityRank: row.priorityRank,
      capitalValue: row.capitalValue,
      netWorthCost: row.netWorthCost,
    };
  });

  const open = rows.filter((row) => row.status !== "achieved" && row.goal.status !== "paused");
  const totalRequiredMonthly = open.reduce((sum, row) => sum + (row.requiredMonthly ?? 0), 0);
  const firstUnfunded = rows.find(
    (row) =>
      row.requiredMonthly !== null &&
      row.status !== "achieved" &&
      row.allocatedMonthly < row.requiredMonthly * 0.98,
  );

  return {
    rows,
    open,
    totals: {
      count: open.length,
      allIn: open.reduce((sum, row) => sum + row.allIn, 0),
      funded: open.reduce((sum, row) => sum + row.funded, 0),
      remaining: open.reduce((sum, row) => sum + row.remaining, 0),
      requiredMonthly: totalRequiredMonthly,
      surplus: input.monthlySurplus,
      surplusShortfall:
        input.monthlySurplus === null
          ? null
          : Math.max(0, totalRequiredMonthly - Math.max(0, input.monthlySurplus)),
      unpriced: open.filter((row) => row.allIn <= 0).length,
      undated: open.filter((row) => row.goal.target_date === null).length,
      nearTermFunding: open
        .filter((row) => row.horizon === "near")
        .reduce((sum, row) => sum + row.funded, 0),
      /** The first goal the surplus cannot cover — the one that gives. */
      firstUnfundedTitle: firstUnfunded?.goal.title ?? null,
    },
  };
}

function classify(
  row: {
    goal: GoalInput;
    allIn: number;
    remaining: number;
    monthsRemaining: number | null;
    requiredMonthly: number | null;
    unpriced: boolean;
    settled: boolean;
  },
  allocated: number,
  slipMonths: number | null,
  input: GoalPlanInput,
): { status: GoalStatus; statusReason: string } {
  if (row.goal.status === "achieved") {
    return { status: "achieved", statusReason: "Marked achieved." };
  }
  if (row.settled) {
    return {
      status: "achieved",
      statusReason: "Fully funded — the money set aside covers the all-in cost.",
    };
  }
  if (row.goal.status === "paused") {
    return { status: "paused", statusReason: "Paused, so no surplus is allocated to it." };
  }
  if (row.unpriced) {
    return {
      status: "unpriced",
      statusReason: "No cost recorded yet — add a target or break it into line items.",
    };
  }
  if (row.monthsRemaining === null) {
    return {
      status: "undated",
      statusReason: "No target date, so there is no run-rate to hit. Add one to plan against it.",
    };
  }
  if (row.monthsRemaining <= 0) {
    return {
      status: "at_risk",
      statusReason: "The target date has passed and the goal is not funded.",
    };
  }
  if (input.monthlySurplus === null) {
    return {
      status: "undated",
      statusReason:
        "Surplus cashflow is unknown — import statements or record income and outgoings to judge whether this lands.",
    };
  }
  const required = row.requiredMonthly ?? 0;
  if (allocated >= required * 0.98) {
    return {
      status: "on_track",
      statusReason: "Current surplus covers the monthly contribution this goal needs.",
    };
  }
  if (allocated >= required * 0.6) {
    const slip =
      slipMonths !== null ? ` About ${Math.round(slipMonths)} months late at this rate.` : "";
    return {
      status: "behind",
      statusReason: `Surplus covers most of what this needs, but not all of it.${slip}`,
    };
  }
  return {
    status: "at_risk",
    statusReason:
      allocated <= 0
        ? "No surplus reaches this goal once the ones above it are funded."
        : "Surplus covers well under two thirds of the required contribution.",
  };
}
