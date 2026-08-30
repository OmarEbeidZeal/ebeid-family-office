/**
 * The five-year household cashflow projection.
 *
 * Everything here is pure arithmetic over figures the household has actually
 * recorded — balances, income streams, forecast expenses, liabilities and
 * goals. The only invented numbers are the ones the user explicitly sets as
 * assumptions (return, growth, inflation), and those are labelled as
 * assumptions everywhere they appear.
 *
 * The same engine runs the baseline, every saved scenario and each Monte Carlo
 * path, so a comparison is always like-for-like.
 */

export type ExpenseConfidence = "committed" | "likely" | "possible";

export type ForecastAssumptions = {
  /** Annual expected return on invested assets, as a percentage. */
  investmentReturnPct: number;
  /** Annual volatility of that return — only used by the Monte Carlo run. */
  volatilityPct: number;
  /** Annual salary growth override. */
  salaryGrowthPct: number;
  /** Use each income stream's own recorded growth rate instead of the override. */
  useRecordedGrowth: boolean;
  /** Annual inflation override applied to expenses. */
  inflationPct: number;
  /** Use each expense line's own recorded inflation rate instead of the override. */
  useRecordedInflation: boolean;
  includeLikely: boolean;
  includePossible: boolean;
  /** Share of each month's surplus moved into investments; the rest stays cash. */
  surplusInvestedPct: number;
  /** Months of essential spending the reserve floor is drawn at. */
  reserveTargetMonths: number;
  months: number;
};

export const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  investmentReturnPct: 5,
  volatilityPct: 15,
  salaryGrowthPct: 3,
  useRecordedGrowth: true,
  inflationPct: 3,
  useRecordedInflation: true,
  includeLikely: true,
  includePossible: false,
  surplusInvestedPct: 0,
  reserveTargetMonths: 12,
  months: 60,
};

export type ForecastIncome = {
  id: string;
  label: string;
  /** Monthly equivalent in base currency, today. */
  monthly: number;
  /** Recorded annual growth rate as a percentage. */
  growthPct: number;
  incomeType: string;
  startMonth: number | null;
  endMonth: number | null;
};

export type ForecastExpense = {
  id: string;
  label: string;
  monthly: number;
  /** One-off amounts land in a single month rather than repeating. */
  oneOff: boolean;
  inflationPct: number;
  confidence: ExpenseConfidence;
  startMonth: number | null;
  endMonth: number | null;
  isEssential: boolean;
};

export type ForecastLiability = {
  id: string;
  label: string;
  balance: number;
  annualRatePct: number | null;
  monthlyPayment: number | null;
  endMonth: number | null;
};

export type ForecastGoalEvent = {
  id: string;
  title: string;
  /** Month index the purchase lands in. */
  month: number;
  /** Cash leaving the household at completion. */
  cashOutflow: number;
  /** Value arriving on the balance sheet (a property, not a holiday). */
  capitalValue: number;
  /** Borrowing raised at completion. */
  financedAmount: number;
  financedRatePct: number | null;
  financedTermYears: number | null;
  priorityRank: number;
  skipped?: boolean;
};

export type CurrencyExposure = {
  currency: string;
  cash: number;
  investments: number;
  illiquid: number;
};

export type ForecastShocks = {
  /** One-off market fall applied to invested and pension assets. */
  marketDrawdown?: { month: number; pct: number } | null;
  /** Sale of the private stake: carrying value out, net proceeds in. */
  liquidityEvent?: {
    month: number;
    grossProceeds: number;
    taxPct: number;
    carryingValue: number;
  } | null;
  /** A soft-currency devaluation applied to everything held in it. */
  fxShock?: { currency: string; pct: number; month: number } | null;
  /** Parallel shift in borrowing costs, in percentage points. */
  rateShockPct?: number | null;
  /** Income interruption — maternity leave, a sabbatical, a redundancy. */
  incomePause?: {
    incomeId: string | null;
    startMonth: number;
    months: number;
    replacementPct: number;
  } | null;
  /** Goals pushed out or dropped entirely. */
  goalShiftMonths?: Record<string, number>;
  goalsSkipped?: string[];
  /** Recorded outgoings that run for longer — rent while a purchase is deferred. */
  expenseEndShiftMonths?: Record<string, number>;
  /** Extra outgoings the scenario adds, always with a user-supplied amount. */
  extraExpenses?: ForecastExpense[];
};

export type ForecastInput = {
  base: string;
  /** Spendable cash today. */
  cash: number;
  /** ISA, GIA and crypto balances plus liquid listed assets. */
  investments: number;
  /** SIPP and other pension assets — projected but never spendable. */
  pension: number;
  /** Property, private company stake, vehicles: held flat unless a shock hits. */
  illiquid: number;
  /** Carrying value of the private company stake, inside `illiquid`. */
  privateStakeValue: number;
  income: ForecastIncome[];
  expenses: ForecastExpense[];
  liabilities: ForecastLiability[];
  goals: ForecastGoalEvent[];
  exposureByCurrency: CurrencyExposure[];
  /** Observed essential monthly spend, when statements support one. */
  essentialMonthly: number | null;
  assumptions: ForecastAssumptions;
  shocks?: ForecastShocks;
  /** First projected month; defaults to the month after today. */
  startDate?: Date;
};

export type ForecastPoint = {
  month: number;
  key: string;
  label: string;
  income: number;
  expenses: number;
  debtService: number;
  surplus: number;
  cash: number;
  investments: number;
  pension: number;
  illiquid: number;
  liabilities: number;
  netWorth: number;
  liquid: number;
  reserveFloor: number;
  belowFloor: boolean;
  cashNegative: boolean;
  drawnFromInvestments: number;
  events: { title: string; kind: "goal" | "shock"; amount: number }[];
};

export type GoalOutcome = {
  id: string;
  title: string;
  month: number;
  date: string;
  cashOutflow: number;
  fundedOnTime: boolean;
  shortfall: number;
};

export type ForecastResult = {
  points: ForecastPoint[];
  endNetWorth: number;
  endCash: number;
  endLiquid: number;
  minCash: { month: number; key: string; value: number };
  firstDeficitMonth: ForecastPoint | null;
  deficitMonthCount: number;
  firstFloorBreach: ForecastPoint | null;
  goalOutcomes: GoalOutcome[];
  /** Plain-English description of the first thing that goes wrong. */
  breakingPoint: { month: number; key: string; reason: string } | null;
  totalIncome: number;
  totalExpenses: number;
  totalDebtService: number;
  notes: string[];
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

export function startOfNextMonth(from = new Date()) {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

export function monthIndexOf(date: string | null | undefined, start: Date): number | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return (
    (parsed.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (parsed.getUTCMonth() - start.getUTCMonth())
  );
}

export function dateOfMonth(start: Date, month: number) {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month, 1));
}

export function monthKey(start: Date, month: number) {
  const date = dateOfMonth(start, month);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthDisplay(start: Date, month: number) {
  return MONTH_LABEL.format(dateOfMonth(start, month));
}

/** Turns a "2027-03" projection key back into "Mar 2027" for display. */
export function monthKeyLabel(key: string | null | undefined) {
  if (!key) return "—";
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(date);
}

/** Level payment that clears `balance` over `months` at an annual rate. */
export function amortisingPayment(balance: number, annualRatePct: number, months: number) {
  if (months <= 0) return balance;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

function annualToMonthly(pct: number) {
  return Math.pow(1 + pct / 100, 1 / 12) - 1;
}

function confidenceIncluded(confidence: ExpenseConfidence, assumptions: ForecastAssumptions) {
  if (confidence === "committed") return true;
  if (confidence === "likely") return assumptions.includeLikely;
  return assumptions.includePossible;
}

type LiabilityState = {
  source: ForecastLiability;
  balance: number;
  payment: number;
  ratePct: number;
  derivedPayment: boolean;
  neverClears: boolean;
};

/**
 * Runs the projection. `returnSeries` lets a Monte Carlo path supply its own
 * monthly investment returns; without it the assumed return is applied evenly.
 */
export function runProjection(
  input: ForecastInput,
  options?: { returnSeries?: number[] },
): ForecastResult {
  const assumptions = input.assumptions;
  const shocks = input.shocks ?? {};
  const start = input.startDate ?? startOfNextMonth();
  const months = Math.max(1, Math.round(assumptions.months));
  const notes: string[] = [];

  const monthlyReturn = annualToMonthly(assumptions.investmentReturnPct);

  // ---- Liabilities -------------------------------------------------------
  const liabilities: LiabilityState[] = input.liabilities.map((liability) => {
    const ratePct = (liability.annualRatePct ?? 0) + (shocks.rateShockPct ?? 0);
    let payment = liability.monthlyPayment ?? 0;
    let derivedPayment = false;
    if (payment <= 0 && liability.endMonth !== null && liability.endMonth > 0) {
      payment = amortisingPayment(liability.balance, ratePct, liability.endMonth);
      derivedPayment = true;
    }
    const monthlyInterest = (liability.balance * ratePct) / 100 / 12;
    const neverClears = payment > 0 && payment <= monthlyInterest;
    if (derivedPayment) {
      notes.push(
        `${liability.label}: no monthly payment recorded, so the projection uses the level payment that clears it by its end date.`,
      );
    } else if (payment <= 0) {
      notes.push(
        `${liability.label}: no monthly payment or end date recorded, so the balance is held flat rather than amortised.`,
      );
    } else if (neverClears) {
      notes.push(
        `${liability.label}: the recorded payment does not cover the interest, so the balance grows in this projection.`,
      );
    }
    return {
      source: liability,
      balance: liability.balance,
      payment,
      ratePct,
      derivedPayment,
      neverClears,
    };
  });

  // ---- Goals -------------------------------------------------------------
  const skipped = new Set(shocks.goalsSkipped ?? []);
  const goalEvents = input.goals
    .filter((goal) => !skipped.has(goal.id) && !goal.skipped)
    .map((goal) => ({
      ...goal,
      month: Math.max(1, goal.month + (shocks.goalShiftMonths?.[goal.id] ?? 0)),
    }))
    .sort((a, b) => a.month - b.month || a.priorityRank - b.priorityRank);

  const goalOutcomes: GoalOutcome[] = [];

  // ---- Expenses ----------------------------------------------------------
  const expenses = [...input.expenses, ...(shocks.extraExpenses ?? [])].filter((expense) =>
    confidenceIncluded(expense.confidence, assumptions),
  );

  // ---- Running state -----------------------------------------------------
  let cash = input.cash;
  let investments = input.investments;
  let pension = input.pension;
  let illiquid = input.illiquid;

  const points: ForecastPoint[] = [];
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalDebtService = 0;
  let breakingPoint: ForecastResult["breakingPoint"] = null;

  const noteBreak = (month: number, reason: string) => {
    if (!breakingPoint) breakingPoint = { month, key: monthKey(start, month), reason };
  };

  for (let month = 1; month <= months; month += 1) {
    const events: ForecastPoint["events"] = [];
    const yearFraction = month / 12;

    // Income
    let income = 0;
    for (const stream of input.income) {
      if (stream.startMonth !== null && month < stream.startMonth) continue;
      if (stream.endMonth !== null && month > stream.endMonth) continue;
      const growth =
        assumptions.useRecordedGrowth && stream.growthPct !== 0
          ? stream.growthPct
          : assumptions.salaryGrowthPct;
      let amount = stream.monthly * Math.pow(1 + growth / 100, yearFraction);
      const pause = shocks.incomePause;
      if (
        pause &&
        (pause.incomeId === null || pause.incomeId === stream.id) &&
        month >= pause.startMonth &&
        month < pause.startMonth + pause.months
      ) {
        amount *= pause.replacementPct / 100;
      }
      income += amount;
    }

    // Expenses
    let spend = 0;
    let essential = 0;
    for (const expense of expenses) {
      const endShift = shocks.expenseEndShiftMonths?.[expense.id] ?? 0;
      const endMonth = expense.endMonth !== null ? expense.endMonth + endShift : null;
      if (expense.oneOff) {
        if (expense.startMonth !== month) continue;
      } else {
        if (expense.startMonth !== null && month < expense.startMonth) continue;
        if (endMonth !== null && month > endMonth) continue;
      }
      const rate = assumptions.useRecordedInflation
        ? expense.inflationPct
        : assumptions.inflationPct;
      const amount = expense.monthly * Math.pow(1 + rate / 100, yearFraction);
      spend += amount;
      if (expense.isEssential || expense.confidence === "committed") essential += amount;
    }

    // Debt service and amortisation
    let debtService = 0;
    for (const liability of liabilities) {
      if (liability.balance <= 0.01) continue;
      const interest = (liability.balance * liability.ratePct) / 100 / 12;
      const payment = Math.min(
        liability.payment > 0 ? liability.payment : 0,
        liability.balance + interest,
      );
      liability.balance = liability.balance + interest - payment;
      if (liability.balance < 0.01) liability.balance = 0;
      debtService += payment;
    }

    const surplus = income - spend - debtService;
    totalIncome += income;
    totalExpenses += spend;
    totalDebtService += debtService;

    // Investment growth before this month's contribution
    const periodReturn = options?.returnSeries?.[month - 1] ?? monthlyReturn;
    investments *= 1 + periodReturn;
    pension *= 1 + periodReturn;

    // Surplus split
    if (surplus >= 0) {
      const invested = surplus * (assumptions.surplusInvestedPct / 100);
      investments += invested;
      cash += surplus - invested;
    } else {
      cash += surplus;
    }

    // Shocks
    if (shocks.marketDrawdown && shocks.marketDrawdown.month === month) {
      const factor = shocks.marketDrawdown.pct / 100;
      const hit = (investments + pension) * factor;
      investments -= investments * factor;
      pension -= pension * factor;
      events.push({
        title: `Market falls ${shocks.marketDrawdown.pct}%`,
        kind: "shock",
        amount: -hit,
      });
    }

    if (shocks.fxShock && shocks.fxShock.month === month) {
      const exposure = input.exposureByCurrency.find(
        (row) => row.currency === shocks.fxShock!.currency,
      );
      if (exposure) {
        const factor = shocks.fxShock.pct / 100;
        const cashHit = exposure.cash * factor;
        const investHit = exposure.investments * factor;
        const illiquidHit = exposure.illiquid * factor;
        cash -= cashHit;
        investments -= investHit;
        illiquid -= illiquidHit;
        events.push({
          title: `${shocks.fxShock.currency} devalues ${shocks.fxShock.pct}%`,
          kind: "shock",
          amount: -(cashHit + investHit + illiquidHit),
        });
      }
    }

    if (shocks.liquidityEvent && shocks.liquidityEvent.month === month) {
      const net = shocks.liquidityEvent.grossProceeds * (1 - shocks.liquidityEvent.taxPct / 100);
      illiquid -= shocks.liquidityEvent.carryingValue;
      cash += net;
      events.push({ title: "Private stake sold", kind: "shock", amount: net });
    }

    // Goal completions
    for (const goal of goalEvents) {
      if (goal.month !== month) continue;
      const available = cash;
      const shortfall = Math.max(0, goal.cashOutflow - available);
      cash -= goal.cashOutflow;
      illiquid += goal.capitalValue;
      if (goal.financedAmount > 0) {
        const termMonths = Math.max(1, Math.round((goal.financedTermYears ?? 25) * 12));
        const ratePct = (goal.financedRatePct ?? 0) + (shocks.rateShockPct ?? 0);
        liabilities.push({
          source: {
            id: `goal-${goal.id}`,
            label: `${goal.title} borrowing`,
            balance: goal.financedAmount,
            annualRatePct: ratePct,
            monthlyPayment: null,
            endMonth: month + termMonths,
          },
          balance: goal.financedAmount,
          payment: amortisingPayment(goal.financedAmount, ratePct, termMonths),
          ratePct,
          derivedPayment: true,
          neverClears: false,
        });
      }
      goalOutcomes.push({
        id: goal.id,
        title: goal.title,
        month,
        date: monthKey(start, month),
        cashOutflow: goal.cashOutflow,
        fundedOnTime: shortfall <= 0.5,
        shortfall,
      });
      events.push({ title: goal.title, kind: "goal", amount: -goal.cashOutflow });
      if (shortfall > 0.5) {
        noteBreak(month, `${goal.title} completes with the cash short by the shortfall shown.`);
      }
    }

    // A negative cash balance is met by selling investments where there are any.
    let drawnFromInvestments = 0;
    if (cash < 0 && investments > 0) {
      drawnFromInvestments = Math.min(investments, -cash);
      investments -= drawnFromInvestments;
      cash += drawnFromInvestments;
    }

    const liabilityTotal = liabilities.reduce((sum, row) => sum + row.balance, 0);
    const essentialMonthly =
      input.essentialMonthly !== null
        ? input.essentialMonthly * Math.pow(1 + assumptions.inflationPct / 100, yearFraction)
        : essential + debtService;
    const reserveFloor = essentialMonthly * assumptions.reserveTargetMonths;
    const netWorth = cash + investments + pension + illiquid - liabilityTotal;

    const point: ForecastPoint = {
      month,
      key: monthKey(start, month),
      label: monthDisplay(start, month),
      income,
      expenses: spend,
      debtService,
      surplus,
      cash,
      investments,
      pension,
      illiquid,
      liabilities: liabilityTotal,
      netWorth,
      liquid: cash + investments,
      reserveFloor,
      belowFloor: cash < reserveFloor,
      cashNegative: cash < 0,
      drawnFromInvestments,
      events,
    };
    points.push(point);

    if (point.cashNegative) {
      noteBreak(month, "Cash runs out — outgoings exceed everything available to meet them.");
    } else if (point.belowFloor) {
      noteBreak(month, "Cash falls through the liquidity reserve floor.");
    } else if (surplus < 0) {
      noteBreak(month, "Outgoings exceed income for the first time.");
    }
  }

  const last = points[points.length - 1]!;
  const minPoint = points.reduce(
    (lowest, point) => (point.cash < lowest.cash ? point : lowest),
    points[0]!,
  );
  const deficits = points.filter((point) => point.surplus < 0);
  const floorBreaches = points.filter((point) => point.belowFloor);

  return {
    points,
    endNetWorth: last.netWorth,
    endCash: last.cash,
    endLiquid: last.liquid,
    minCash: { month: minPoint.month, key: minPoint.key, value: minPoint.cash },
    firstDeficitMonth: deficits[0] ?? null,
    deficitMonthCount: deficits.length,
    firstFloorBreach: floorBreaches[0] ?? null,
    goalOutcomes,
    breakingPoint,
    totalIncome,
    totalExpenses,
    totalDebtService,
    notes,
  };
}

/** Half a projection: only what a comparison table needs. */
export type ForecastHeadline = {
  endNetWorth: number;
  endLiquid: number;
  minCash: number;
  minCashMonth: string;
  deficitMonths: number;
  goalsOnTime: number;
  goalsTotal: number;
  breakingPoint: { month: number; key: string; reason: string } | null;
};

export function headlineOf(result: ForecastResult): ForecastHeadline {
  return {
    endNetWorth: result.endNetWorth,
    endLiquid: result.endLiquid,
    minCash: result.minCash.value,
    minCashMonth: result.minCash.key,
    deficitMonths: result.deficitMonthCount,
    goalsOnTime: result.goalOutcomes.filter((goal) => goal.fundedOnTime).length,
    goalsTotal: result.goalOutcomes.length,
    breakingPoint: result.breakingPoint,
  };
}
