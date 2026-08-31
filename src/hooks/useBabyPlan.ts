import { useMemo } from "react";

import { useAuth } from "./useAuth";
import { useCurrency } from "./useCurrency";
import { useOwners, memberName } from "./useOwners";
import {
  useChildcarePlans,
  useIncomeStreams,
  useLifeEventTasks,
  useLifeEvents,
  useParentalLeavePlans,
  useTaxAllowances,
  type ChildcarePlanRow,
  type IncomeRow,
  type LifeEventRow,
  type LifeEventTaskRow,
  type ParentalLeavePlanRow,
  type TaxAllowanceRow,
} from "./useFinancials";
import { currentTaxYear } from "@/lib/policy";
import { monthlyEquivalent } from "@/lib/format";
import { babyKeyDates } from "@/lib/planning/baby-plan";
import {
  childcareAnnual,
  supportAtRisk,
  unfundedWindow,
  type ChildcarePlan,
} from "@/lib/planning/childcare";
import { daysUntil, toIso } from "@/lib/planning/dates";
import {
  leaveSchedule,
  summariseLeave,
  type LeavePlan,
  type LeaveScheme,
} from "@/lib/planning/parental-leave";
import {
  adjustedNetIncome,
  assessChildBenefit,
  assessCliff,
  type CliffAssessment,
} from "@/lib/planning/thresholds";

export type PersonIncome = {
  profileId: string;
  name: string;
  /** Null until a tax-year record exists — never assumed to be zero. */
  ani: number | null;
  row: TaxAllowanceRow | null;
  cliff: CliffAssessment | null;
};

/**
 * Turns a stored childcare row into the shape the maths works on.
 *
 * `toBase` converts the nursery's own currency into the reporting currency, so
 * the cost sits alongside the rest of the projection. The statutory help is
 * defined in sterling, which is the assumption the whole plan rests on.
 */
export function toChildcarePlan(
  row: ChildcarePlanRow | null | undefined,
  toBase: (amount: number, currency: string) => number = (amount) => amount,
): ChildcarePlan | null {
  if (!row) return null;
  return {
    startDate: row.starts_on ?? "",
    hoursPerWeek: Number(row.hours_per_week),
    hourlyRate: toBase(Number(row.hourly_rate), row.currency),
    weeksPerYear: Number(row.weeks_per_year),
    monthlyExtras: toBase(Number(row.monthly_extras ?? 0), row.currency),
    usesTaxFreeChildcare: row.tax_free_childcare,
  };
}

/**
 * The stored scheme codes and the ones the maths uses are not the same words.
 * The database speaks HMRC's language — `spp`, `shared_parental` — while the
 * calculator only cares about the shape of the payment. Shared parental pay is
 * flat-rate throughout with no 90% opening weeks, which is the Maternity
 * Allowance shape, so that is what it is priced as.
 */
const SCHEME_FROM_DB: Record<string, LeaveScheme> = {
  smp: "smp",
  maternity_allowance: "maternity_allowance",
  spp: "paternity",
  shared_parental: "maternity_allowance",
  unpaid: "unpaid",
};

export const SCHEME_TO_DB: Record<LeaveScheme, string> = {
  smp: "smp",
  maternity_allowance: "maternity_allowance",
  paternity: "spp",
  unpaid: "unpaid",
};

export function toLeavePlan(row: ParentalLeavePlanRow, fallbackWeekly: number): LeavePlan {
  return {
    scheme: SCHEME_FROM_DB[row.scheme] ?? "smp",
    leaveStartDate: row.leave_start_date ?? "",
    leaveWeeks: Number(row.leave_weeks),
    averageWeeklyEarnings:
      row.average_weekly_earnings === null
        ? fallbackWeekly
        : Number(row.average_weekly_earnings),
    employerEnhanced: row.employer_enhanced,
    enhancedFullPayWeeks: Number(row.enhanced_full_pay_weeks),
    enhancedHalfPayWeeks: Number(row.enhanced_half_pay_weeks),
  };
}


/**
 * Adjusted net income for each member, for the tax year in progress.
 *
 * The measure is the one the thresholds are actually tested on, not salary,
 * and an unrecorded person stays null rather than being counted as nil — the
 * whole point of the tracker is to say which side of the line each person is
 * on, and "unknown" is a truthful answer where nought is not.
 */
export function useIncomePicture(supportValue = 0) {
  const { members } = useOwners();
  const allowancesQuery = useTaxAllowances();
  const taxYear = useMemo(() => currentTaxYear(), []);

  return useMemo(() => {
    const rows = (allowancesQuery.data ?? []).filter((row) => row.tax_year === taxYear.label);
    const people: PersonIncome[] = members.map((member) => {
      const row = rows.find((entry) => entry.profile_id === member.id) ?? null;
      const hasParts =
        row !== null &&
        (Number(row.gross_salary) > 0 ||
          Number(row.bonus) > 0 ||
          Number(row.other_taxable_income) > 0);
      const ani =
        row === null
          ? null
          : row.adjusted_net_income !== null
            ? Number(row.adjusted_net_income)
            : hasParts
              ? adjustedNetIncome({
                  grossSalary: Number(row.gross_salary),
                  bonus: Number(row.bonus),
                  pensionContributions: Number(row.pension_sacrifice),
                  otherTaxableIncome: Number(row.other_taxable_income),
                  giftAid: Number(row.gift_aid),
                })
              : null;
      return {
        profileId: member.id,
        name: memberName(member),
        ani,
        row,
        cliff: ani === null ? null : assessCliff(ani, supportValue),
      };
    });

    const known = people.filter((person) => person.ani !== null);
    const highest = known.length ? Math.max(...known.map((person) => person.ani!)) : null;
    return {
      taxYear,
      people,
      /** The higher of the two — the figure both thresholds are tested against. */
      highestAni: highest,
      /** True only when someone is known to be over; unknown is not over. */
      anyOverCeiling: known.some((person) => person.cliff?.status === "over"),
      anyClose: known.some((person) => person.cliff?.status === "close"),
      unrecorded: people.filter((person) => person.ani === null).map((person) => person.name),
      loading: allowancesQuery.isLoading,
    };
  }, [allowancesQuery.data, allowancesQuery.isLoading, members, supportValue, taxYear]);
}

export type BabyPlan = ReturnType<typeof useBabyPlan>;

/**
 * Everything the household has decided about the new baby, in one place: the
 * event and its derived dates, each parent's leave, the childcare arrangement,
 * where the two income thresholds fall, and what Child Benefit survives.
 */
export function useBabyPlan(eventId?: string) {
  const { household } = useAuth();
  const { convert, base } = useCurrency();
  const { members } = useOwners();
  const eventsQuery = useLifeEvents();
  const tasksQuery = useLifeEventTasks();
  const leaveQuery = useParentalLeavePlans();
  const childcareQuery = useChildcarePlans();
  const incomeQuery = useIncomeStreams();

  const event = useMemo<LifeEventRow | null>(() => {
    const rows = eventsQuery.data ?? [];
    if (eventId) return rows.find((row) => row.id === eventId) ?? null;
    // The nearest planned baby wins when there is more than one.
    return (
      rows
        .filter((row) => row.event_type === "new_baby" && row.status !== "cancelled")
        .sort((a, b) => a.expected_date.localeCompare(b.expected_date))[0] ?? null
    );
  }, [eventsQuery.data, eventId]);

  const childcareRow = useMemo(
    () => (childcareQuery.data ?? []).find((row) => row.life_event_id === event?.id) ?? null,
    [childcareQuery.data, event?.id],
  );
  const childcarePlan = useMemo(
    () => toChildcarePlan(childcareRow, (amount, currency) => convert(amount, currency, base)),
    [childcareRow, convert, base],
  );

  // What the £100,000 ceiling would take away, priced from the actual plan.
  const supportValue = useMemo(
    () => (childcarePlan ? supportAtRisk(childcarePlan).total : 0),
    [childcarePlan],
  );
  const income = useIncomePicture(supportValue);

  const tasks = useMemo(
    () =>
      (tasksQuery.data ?? [])
        .filter((row) => row.life_event_id === event?.id)
        .sort(
          (a, b) =>
            (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
            a.sort_order - b.sort_order,
        ),
    [tasksQuery.data, event?.id],
  );

  const leave = useMemo(() => {
    const streams = incomeQuery.data ?? [];
    return (leaveQuery.data ?? [])
      .filter((row) => row.life_event_id === event?.id)
      .map((row) => {
        const member = members.find((entry) => entry.id === row.profile_id);
        const stream = streams.find((entry: IncomeRow) => entry.id === row.income_stream_id);
        const monthly = stream
          ? monthlyEquivalent(
              convert(Number(stream.net_amount ?? stream.gross_amount), stream.currency, base),
              stream.frequency,
            )
          : 0;
        // Average weekly earnings default to the gross of the linked stream.
        const grossWeekly = stream
          ? (monthlyEquivalent(
              convert(Number(stream.gross_amount), stream.currency, base),
              stream.frequency,
            ) *
              12) /
            52
          : 0;
        const plan = toLeavePlan(row, grossWeekly);
        return {
          row,
          plan,
          stream: stream ?? null,
          personLabel: member ? memberName(member) : "Unassigned",
          normalMonthly: monthly,
          schedule: leaveSchedule(plan),
          summary: summariseLeave(plan, monthly),
        };
      });
  }, [leaveQuery.data, incomeQuery.data, members, event?.id, convert, base]);

  const keyDates = useMemo(
    () => (event ? babyKeyDates(event.expected_date, childcareRow?.starts_on ?? null) : null),
    [event, childcareRow?.starts_on],
  );

  const fundedEligible =
    (childcareRow?.funded_eligible ?? true) && !income.anyOverCeiling;

  const childcare = useMemo(() => {
    if (!childcarePlan || !event) return null;
    const withHelp = childcareAnnual(childcarePlan, fundedEligible);
    const withoutHelp = childcareAnnual(childcarePlan, false);
    return {
      row: childcareRow,
      plan: childcarePlan,
      eligible: fundedEligible,
      lostToCliff: (childcareRow?.funded_eligible ?? true) && income.anyOverCeiling,
      annual: withHelp,
      annualWithoutHelp: withoutHelp,
      atRisk: supportAtRisk(childcarePlan),
      gap: unfundedWindow(childcarePlan, event.expected_date, fundedEligible),
    };
  }, [childcarePlan, childcareRow, event, fundedEligible, income.anyOverCeiling]);

  const childBenefit = useMemo(() => {
    if (!event) return null;
    if (income.highestAni === null) return null;
    return assessChildBenefit(event.child_count ?? 1, income.highestAni);
  }, [event, income.highestAni]);

  const daysToDue = event ? daysUntil(event.expected_date, toIso(new Date())) : null;

  return {
    loading:
      eventsQuery.isLoading ||
      tasksQuery.isLoading ||
      leaveQuery.isLoading ||
      childcareQuery.isLoading,
    event,
    events: (eventsQuery.data ?? []).filter((row) => row.event_type === "new_baby"),
    tasks,
    leave,
    childcare,
    childcareRow,
    childBenefit,
    income,
    keyDates,
    daysToDue,
    base: household?.base_currency ?? base,
  };
}

/** Tasks worth surfacing outside the planner: due soon, or already late. */
export function upcomingTasks(tasks: LifeEventTaskRow[], withinDays = 45) {
  const today = toIso(new Date());
  return tasks
    .filter((task) => task.status !== "done" && task.due_date)
    .map((task) => ({ task, days: daysUntil(task.due_date!, today) }))
    .filter(({ days }) => days <= withinDays)
    .sort((a, b) => a.days - b.days);
}
