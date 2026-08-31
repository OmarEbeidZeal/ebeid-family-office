/**
 * Childcare cost, on the real timeline.
 *
 * Two dates matter and they are not the same date: the day nursery starts and
 * is paid for in full, and the day funded hours actually arrive — the term
 * after the child turns nine months, which for a March baby means January.
 * The gap between the two is the expensive part, and it is the part a naive
 * "childcare from age one" assumption hides.
 */

import {
  CHILDCARE_INCOME_CEILING,
  FUNDED_HOURS_AGE_MONTHS,
  FUNDED_HOURS_PER_WEEK,
  FUNDED_WEEKS_PER_YEAR,
  TAX_FREE_CHILDCARE_CAP,
  TAX_FREE_CHILDCARE_RATE,
} from "./uk-2026";
import { addDays, addMonths, monthKeyOf, nextMonthKey, nextTermStart, type IsoDate } from "./dates";

export type ChildcarePlan = {
  /** When the child actually goes in, whatever the funding says. */
  startDate: IsoDate;
  hoursPerWeek: number;
  hourlyRate: number;
  weeksPerYear: number;
  /** Nappies, meals, consumables — nurseries charge for these and funding never covers them. */
  monthlyExtras: number;
  usesTaxFreeChildcare: boolean;
};

export const DEFAULT_CHILDCARE_PLAN: ChildcarePlan = {
  startDate: "",
  hoursPerWeek: 40,
  hourlyRate: 0,
  weeksPerYear: 51,
  monthlyExtras: 0,
  usesTaxFreeChildcare: true,
};

/**
 * The child turns nine months, then waits for the term boundary. Terms start
 * 1 January, 1 April and 1 September.
 */
export function fundedHoursStart(dueDate: IsoDate): IsoDate {
  return nextTermStart(addMonths(dueDate, FUNDED_HOURS_AGE_MONTHS));
}

export function ninthMonthDate(dueDate: IsoDate): IsoDate {
  return addMonths(dueDate, FUNDED_HOURS_AGE_MONTHS);
}

/**
 * Funded hours have to be applied for in the term before, and the code expires.
 * Missing this window costs a full term of funding.
 */
export function fundedHoursApplyBy(dueDate: IsoDate): IsoDate {
  // The deadline is the end of the month before the term starts: 31 August,
  // 31 December or 31 March — in every case, the day before.
  return addDays(fundedHoursStart(dueDate), -1);
}

export type ChildcareMonth = {
  monthKey: string;
  /** What the nursery bills, before any help. */
  gross: number;
  /** The value of the funded hours applied that month. */
  funded: number;
  /** The Tax-Free Childcare top-up applied that month. */
  taxFree: number;
  /** What actually leaves the account. */
  net: number;
  fundedActive: boolean;
};

export type ChildcareInputs = {
  plan: ChildcarePlan;
  dueDate: IsoDate;
  /** Funded hours and Tax-Free Childcare both vanish if either parent is over £100k. */
  eligible: boolean;
  /** How many months of the projection to produce. */
  months: number;
  /** The month the projection starts, "YYYY-MM". */
  fromMonthKey: string;
};

/** Annual figures at a steady state, used for the headline numbers. */
export function childcareAnnual(plan: ChildcarePlan, eligible: boolean) {
  const hours = Math.max(0, plan.hoursPerWeek);
  const weeks = Math.max(0, plan.weeksPerYear);
  const gross = hours * Math.max(0, plan.hourlyRate) * weeks + plan.monthlyExtras * 12;
  const fundedHours = Math.min(hours, FUNDED_HOURS_PER_WEEK);
  const fundedWeeks = Math.min(weeks, FUNDED_WEEKS_PER_YEAR);
  const funded = eligible ? fundedHours * plan.hourlyRate * fundedWeeks : 0;
  const payable = Math.max(0, gross - funded);
  const taxFree =
    eligible && plan.usesTaxFreeChildcare
      ? Math.min(payable * TAX_FREE_CHILDCARE_RATE, TAX_FREE_CHILDCARE_CAP)
      : 0;
  return { gross, funded, taxFree, net: Math.max(0, payable - taxFree) };
}

/** The annual value of the help that the £100k cliff takes away. */
export function supportAtRisk(plan: ChildcarePlan) {
  const withHelp = childcareAnnual(plan, true);
  const without = childcareAnnual(plan, false);
  return {
    funded: withHelp.funded,
    taxFree: withHelp.taxFree,
    total: without.net - withHelp.net,
  };
}

export function childcareSchedule(input: ChildcareInputs): ChildcareMonth[] {
  const { plan, dueDate, eligible, months, fromMonthKey } = input;
  if (!plan.startDate || months <= 0) return [];

  const fundedFrom = monthKeyOf(fundedHoursStart(dueDate));
  const startMonth = monthKeyOf(plan.startDate);
  const rows: ChildcareMonth[] = [];

  let monthKey = fromMonthKey;
  for (let index = 0; index < months; index += 1) {
    if (monthKey >= startMonth) {
      const fundedActive = eligible && monthKey >= fundedFrom;
      const annual = childcareAnnual(plan, fundedActive);
      rows.push({
        monthKey,
        gross: annual.gross / 12,
        funded: annual.funded / 12,
        taxFree: annual.taxFree / 12,
        net: annual.net / 12,
        fundedActive,
      });
    }
    monthKey = nextMonthKey(monthKey);
  }

  return rows;
}

/** The window between nursery starting and funding arriving, in months and money. */
export function unfundedWindow(plan: ChildcarePlan, dueDate: IsoDate, eligible: boolean) {
  if (!plan.startDate) return null;
  const start = monthKeyOf(plan.startDate);
  const funded = monthKeyOf(fundedHoursStart(dueDate));
  if (!eligible || start >= funded) return null;

  let months = 0;
  let cursor = start;
  while (cursor < funded && months < 120) {
    months += 1;
    cursor = nextMonthKey(cursor);
  }
  const unfundedMonthly = childcareAnnual(plan, false).net / 12;
  return { months, monthlyCost: unfundedMonthly, total: months * unfundedMonthly, fundedFrom: funded };
}

export const CHILDCARE_CEILING = CHILDCARE_INCOME_CEILING;
