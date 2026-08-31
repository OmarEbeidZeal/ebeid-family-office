/**
 * The income side of a new baby — the part people get wrong.
 *
 * Maternity pay is not a percentage cut. It is a step function: six weeks near
 * full pay, a cliff at week seven down to a flat rate, and for anyone taking
 * the full year, nothing at all from week 40. This turns a leave plan into the
 * week-by-week schedule and then into monthly figures the forecast can use.
 */

import {
  MATERNITY_ALLOWANCE_WEEKS,
  MATERNITY_LEAVE_WEEKS,
  PATERNITY_LEAVE_WEEKS,
  PATERNITY_PAID_WEEKS,
  SMP_HIGHER_RATE_FRACTION,
  SMP_HIGHER_RATE_WEEKS,
  SMP_PAID_WEEKS,
  STATUTORY_WEEKLY_CAP,
} from "./uk-2026";
import {
  addDays,
  daysInMonthOf,
  monthKeyOf,
  toIso,
  type IsoDate,
} from "./dates";

export type LeaveScheme = "smp" | "maternity_allowance" | "paternity" | "unpaid";

export const LEAVE_SCHEME_LABELS: Record<LeaveScheme, string> = {
  smp: "Statutory Maternity Pay",
  maternity_allowance: "Maternity Allowance",
  paternity: "Statutory Paternity Pay",
  unpaid: "Unpaid leave",
};

export type LeavePlan = {
  scheme: LeaveScheme;
  leaveStartDate: IsoDate;
  /** How many weeks of leave they intend to take, not the entitlement. */
  leaveWeeks: number;
  /** Gross average weekly earnings — what SMP's 90% is calculated on. */
  averageWeeklyEarnings: number;
  employerEnhanced: boolean;
  /** Weeks at full pay under the employer's own scheme. */
  enhancedFullPayWeeks: number;
  /** Weeks at half pay after that, on top of the statutory amount. */
  enhancedHalfPayWeeks: number;
};

export type LeaveWeek = {
  /** 1-based week of leave. */
  week: number;
  startDate: IsoDate;
  /** The statutory element alone. */
  statutory: number;
  /** What the employer adds on top of it. */
  employer: number;
  total: number;
  /** Set on the week pay changes, for annotating the chart. */
  stepLabel?: string;
};

export const DEFAULT_LEAVE_PLAN: LeavePlan = {
  scheme: "smp",
  leaveStartDate: "",
  leaveWeeks: 52,
  averageWeeklyEarnings: 0,
  employerEnhanced: false,
  enhancedFullPayWeeks: 0,
  enhancedHalfPayWeeks: 0,
};

/** How long the scheme itself runs, regardless of how much leave is taken. */
export function entitlementWeeks(scheme: LeaveScheme): number {
  if (scheme === "paternity") return PATERNITY_LEAVE_WEEKS;
  return MATERNITY_LEAVE_WEEKS;
}

/** The statutory payment due in a given week of leave, before any enhancement. */
export function statutoryWeeklyPay(plan: LeavePlan, week: number): number {
  const awe = Math.max(0, plan.averageWeeklyEarnings);
  const lower = Math.min(awe * SMP_HIGHER_RATE_FRACTION, STATUTORY_WEEKLY_CAP);

  switch (plan.scheme) {
    case "smp":
      if (week <= SMP_HIGHER_RATE_WEEKS) return awe * SMP_HIGHER_RATE_FRACTION;
      if (week <= SMP_PAID_WEEKS) return lower;
      return 0;
    case "maternity_allowance":
      return week <= MATERNITY_ALLOWANCE_WEEKS ? lower : 0;
    case "paternity":
      return week <= PATERNITY_PAID_WEEKS ? lower : 0;
    case "unpaid":
      return 0;
  }
}

/**
 * The full week-by-week schedule for the leave actually being taken.
 *
 * Employer enhancement is treated the way employers write it: full pay means
 * full pay *including* the statutory element, so the employer tops up to the
 * salary rather than paying it twice.
 */
export function leaveSchedule(plan: LeavePlan): LeaveWeek[] {
  if (!plan.leaveStartDate) return [];
  const awe = Math.max(0, plan.averageWeeklyEarnings);
  const weeks = Math.max(0, Math.round(plan.leaveWeeks));
  const fullPayWeeks = plan.employerEnhanced ? Math.max(0, plan.enhancedFullPayWeeks) : 0;
  const halfPayWeeks = plan.employerEnhanced ? Math.max(0, plan.enhancedHalfPayWeeks) : 0;

  const rows: LeaveWeek[] = [];
  let previousTotal: number | null = null;

  for (let week = 1; week <= weeks; week += 1) {
    const statutory = statutoryWeeklyPay(plan, week);
    let total = statutory;
    if (week <= fullPayWeeks) {
      total = Math.max(statutory, awe);
    } else if (week <= fullPayWeeks + halfPayWeeks) {
      total = Math.min(awe, awe * 0.5 + statutory);
    }

    const row: LeaveWeek = {
      week,
      startDate: addDays(plan.leaveStartDate, (week - 1) * 7),
      statutory,
      employer: Math.max(0, total - statutory),
      total,
    };

    if (previousTotal !== null && Math.abs(total - previousTotal) > 0.005) {
      row.stepLabel =
        total === 0
          ? `Week ${week}: pay stops`
          : total < previousTotal
            ? `Week ${week}: drops to ${Math.round(total)}/wk`
            : `Week ${week}: rises to ${Math.round(total)}/wk`;
    }
    previousTotal = total;
    rows.push(row);
  }

  return rows;
}

export type LeaveMonth = {
  monthKey: string;
  /** Pay actually received that month, leave and salary combined. */
  received: number;
  /** What the month would have paid with no leave at all. */
  normal: number;
  /** Negative in every month of reduced pay. */
  delta: number;
};

/**
 * Monthly pay across the leave, blending part-months properly: someone who
 * starts leave on the 20th is paid salary for the first nineteen days.
 *
 * `normalMonthly` is the gross-to-net figure the household already records for
 * that income stream, so the delta stays consistent with the rest of the app.
 */
export function leaveMonthlyIncome(plan: LeavePlan, normalMonthly: number): LeaveMonth[] {
  const schedule = leaveSchedule(plan);
  if (!schedule.length) return [];

  const perDay = new Map<IsoDate, number>();
  for (const week of schedule) {
    for (let offset = 0; offset < 7; offset += 1) {
      perDay.set(addDays(week.startDate, offset), week.total / 7);
    }
  }

  const buckets = new Map<string, { leavePay: number; leaveDays: number }>();
  for (const [date, amount] of perDay) {
    const key = monthKeyOf(date);
    const bucket = buckets.get(key) ?? { leavePay: 0, leaveDays: 0 };
    bucket.leavePay += amount;
    bucket.leaveDays += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, bucket]) => {
      const days = daysInMonthOf(monthKey);
      const workingShare = Math.max(0, days - bucket.leaveDays) / days;
      const received = bucket.leavePay + normalMonthly * workingShare;
      return {
        monthKey,
        received,
        normal: normalMonthly,
        delta: received - normalMonthly,
      };
    });
}

export type LeaveSummary = {
  /** Total pay over the leave, against what the same period would normally pay. */
  totalReceived: number;
  totalNormal: number;
  shortfall: number;
  /** The week pay first falls, and what it falls to. */
  firstDrop: { week: number; from: number; to: number } | null;
  /** The week pay reaches zero, if it does. */
  unpaidFromWeek: number | null;
  returnDate: IsoDate | null;
};

export function summariseLeave(plan: LeavePlan, normalMonthly: number): LeaveSummary {
  const schedule = leaveSchedule(plan);
  const months = leaveMonthlyIncome(plan, normalMonthly);
  const totalReceived = months.reduce((sum, month) => sum + month.received, 0);
  const totalNormal = months.reduce((sum, month) => sum + month.normal, 0);

  let firstDrop: LeaveSummary["firstDrop"] = null;
  let unpaidFromWeek: number | null = null;
  for (let index = 1; index < schedule.length; index += 1) {
    const previous = schedule[index - 1]!;
    const current = schedule[index]!;
    if (!firstDrop && current.total < previous.total - 0.005) {
      firstDrop = { week: current.week, from: previous.total, to: current.total };
    }
    if (unpaidFromWeek === null && current.total <= 0.005) unpaidFromWeek = current.week;
  }
  if (unpaidFromWeek === null && schedule[0] && schedule[0].total <= 0.005) unpaidFromWeek = 1;

  return {
    totalReceived,
    totalNormal,
    shortfall: Math.max(0, totalNormal - totalReceived),
    firstDrop,
    unpaidFromWeek,
    returnDate: plan.leaveStartDate
      ? addDays(plan.leaveStartDate, Math.max(0, Math.round(plan.leaveWeeks)) * 7)
      : null,
  };
}

/** The date leave has to start by to have begun before the birth. */
export function suggestedLeaveStart(dueDate: IsoDate): IsoDate {
  return dueDate;
}

export function todayIso(): IsoDate {
  return toIso(new Date());
}
