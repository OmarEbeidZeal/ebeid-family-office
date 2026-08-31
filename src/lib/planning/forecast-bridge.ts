/**
 * Turning a baby plan into projection inputs.
 *
 * The forecast engine knows about income streams, expenses and goals. It does
 * not know about maternity pay steps or funded-hours term dates, and it should
 * not have to: this translates the plan into the three things the engine does
 * understand — month-by-month overrides on an income stream, extra expense
 * lines with their own start and end months, and an extra income line for
 * whatever Child Benefit survives the charge.
 */

import type { ForecastExpense, ForecastIncome } from "@/lib/forecast";
import { childcareSchedule, type ChildcarePlan } from "./childcare";
import { leaveMonthlyIncome, type LeavePlan } from "./parental-leave";
import type { IsoDate } from "./dates";

export type LeaveLayer = {
  /** The income stream the leave interrupts, or null when none is linked. */
  incomeStreamId: string | null;
  personLabel: string;
  plan: LeavePlan;
  /** The stream's normal monthly amount in base currency. */
  normalMonthly: number;
};

export type ChildcareLayer = {
  plan: ChildcarePlan;
  dueDate: IsoDate;
  eligible: boolean;
  /** True when eligibility was lost to the £100,000 ceiling rather than never held. */
  lostToCliff: boolean;
};

export type BabyLayerInput = {
  start: Date;
  months: number;
  leave: LeaveLayer[];
  childcare: ChildcareLayer | null;
  /** Child Benefit kept after the charge, per month, and when it starts. */
  childBenefit: { monthly: number; fromDate: IsoDate; label: string } | null;
};

export type BabyLayers = {
  /** Income stream id → engine month → the amount actually received. */
  incomeOverrides: Record<string, Record<number, number>>;
  extraExpenses: ForecastExpense[];
  extraIncome: ForecastIncome[];
  /** Anything the plan could not be applied to, in the household's own terms. */
  gaps: string[];
};

/** The engine numbers months from 1, with month 1 sitting at `start`. */
function engineMonth(monthKey: string, start: Date): number {
  const [year, month] = monthKey.split("-").map(Number);
  return (year! - start.getUTCFullYear()) * 12 + (month! - 1 - start.getUTCMonth()) + 1;
}

function monthKeyOfDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function babyForecastLayers(input: BabyLayerInput): BabyLayers {
  const { start, months } = input;
  const incomeOverrides: Record<string, Record<number, number>> = {};
  const extraExpenses: ForecastExpense[] = [];
  const extraIncome: ForecastIncome[] = [];
  const gaps: string[] = [];

  // ---- Leave ------------------------------------------------------------
  for (const layer of input.leave) {
    if (!layer.plan.leaveStartDate) continue;
    if (!layer.incomeStreamId) {
      gaps.push(
        `${layer.personLabel}'s leave is not linked to an income stream, so the projection still pays the full salary throughout it.`,
      );
      continue;
    }
    if (layer.normalMonthly <= 0) {
      gaps.push(
        `${layer.personLabel}'s salary is recorded as nil, so the drop in maternity pay cannot be projected.`,
      );
    }
    const overrides = incomeOverrides[layer.incomeStreamId] ?? {};
    for (const row of leaveMonthlyIncome(layer.plan, layer.normalMonthly)) {
      const month = engineMonth(row.monthKey, start);
      if (month < 1 || month > months) continue;
      // Two people on leave against one stream would be a data error; the
      // lower figure is the safer one to project.
      overrides[month] =
        overrides[month] === undefined ? row.received : Math.min(overrides[month]!, row.received);
    }
    incomeOverrides[layer.incomeStreamId] = overrides;
  }

  // ---- Childcare ---------------------------------------------------------
  if (input.childcare?.plan.startDate) {
    const { plan, dueDate, eligible, lostToCliff } = input.childcare;
    const rows = childcareSchedule({
      plan,
      dueDate,
      eligible,
      months,
      fromMonthKey: monthKeyOfDate(start),
    });

    // Consecutive months at the same net cost become one expense line, so the
    // forecast table reads as "nursery, unfunded" then "nursery, funded"
    // rather than sixty identical rows.
    let index = 0;
    let period = 0;
    while (index < rows.length) {
      const first = rows[index]!;
      let last = first;
      let cursor = index;
      while (
        cursor + 1 < rows.length &&
        Math.abs(rows[cursor + 1]!.net - first.net) < 0.01 &&
        rows[cursor + 1]!.fundedActive === first.fundedActive
      ) {
        cursor += 1;
        last = rows[cursor]!;
      }
      const startMonth = engineMonth(first.monthKey, start);
      const endMonth = engineMonth(last.monthKey, start);
      if (endMonth >= 1 && first.net > 0.01) {
        extraExpenses.push({
          id: `childcare-${period}`,
          label: first.fundedActive ? "Childcare (funded hours applied)" : "Childcare (full rate)",
          monthly: first.net,
          oneOff: false,
          inflationPct: 0,
          confidence: "committed",
          startMonth: Math.max(1, startMonth),
          endMonth,
          isEssential: true,
        });
      }
      period += 1;
      index = cursor + 1;
    }

    if (lostToCliff) {
      gaps.push(
        "Funded hours and Tax-Free Childcare are excluded: one of you is projected over £100,000 of adjusted net income.",
      );
    }
  }

  // ---- Child Benefit -----------------------------------------------------
  if (input.childBenefit && input.childBenefit.monthly > 0.01) {
    const startMonth = engineMonth(input.childBenefit.fromDate.slice(0, 7), start);
    extraIncome.push({
      id: "child-benefit",
      label: input.childBenefit.label,
      monthly: input.childBenefit.monthly,
      growthPct: 0,
      incomeType: "benefit",
      startMonth: Math.max(1, startMonth),
      endMonth: null,
    });
  }

  return { incomeOverrides, extraExpenses, extraIncome, gaps };
}
