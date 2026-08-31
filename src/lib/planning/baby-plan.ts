/**
 * The "new baby" event, assembled.
 *
 * A due date implies about twenty dates that carry money or a deadline with
 * them, and none of them are obvious. This derives them all from the one date
 * the household actually knows, so the timeline is right the moment the event
 * is created and stays right if the date moves.
 */

import {
  BIRTH_REGISTRATION_DAYS,
  JUNIOR_ISA_LIMIT,
  NOTIFY_EMPLOYER_WEEKS_BEFORE,
} from "./uk-2026";
import { fundedHoursApplyBy, fundedHoursStart, ninthMonthDate } from "./childcare";
import {
  addDays,
  addMonths,
  addWeeks,
  startOfStatutoryWeek,
  taxYearEndOnOrAfter,
  type IsoDate,
} from "./dates";

export type TaskCategory = "admin" | "employer" | "benefits" | "childcare" | "money";

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  admin: "Admin",
  employer: "Employer",
  benefits: "Benefits",
  childcare: "Childcare",
  money: "Money",
};

export type PlannedTask = {
  key: string;
  title: string;
  detail: string;
  dueDate: IsoDate;
  category: TaskCategory;
  /** True where missing the date costs money outright rather than causing a delay. */
  hard: boolean;
};

/**
 * Every date the plan can derive from the due date alone.
 *
 * `nurseryStart` is optional because it is a decision, not a consequence — but
 * once it is set, two more deadlines follow from it.
 */
export function babyKeyDates(dueDate: IsoDate, nurseryStart?: IsoDate | null) {
  // Everything statutory hangs off the expected week of childbirth, which
  // starts on the Sunday before the due date rather than on the due date.
  const expectedWeek = startOfStatutoryWeek(dueDate);
  const qualifyingWeek = addWeeks(expectedWeek, -NOTIFY_EMPLOYER_WEEKS_BEFORE);
  return {
    expectedWeek,
    matb1From: addWeeks(dueDate, -20),
    qualifyingWeek,
    notifyEmployerBy: addDays(qualifyingWeek, 6),
    earliestLeaveStart: addWeeks(expectedWeek, -11),
    dueDate,
    registerBirthBy: addDays(dueDate, BIRTH_REGISTRATION_DAYS),
    claimChildBenefitBy: addMonths(dueDate, 3),
    ninthMonth: ninthMonthDate(dueDate),
    fundedHoursApplyBy: fundedHoursApplyBy(dueDate),
    fundedHoursStart: fundedHoursStart(dueDate),
    taxYearEnd: taxYearEndOnOrAfter(dueDate),
    taxFreeChildcareOpenBy: nurseryStart ? addMonths(nurseryStart, -1) : null,
    nurseryStart: nurseryStart ?? null,
  };
}

/** The task list, in date order, ready to be written to `life_event_tasks`. */
export function babyTaskTemplate(dueDate: IsoDate, nurseryStart?: IsoDate | null): PlannedTask[] {
  const dates = babyKeyDates(dueDate, nurseryStart);

  const tasks: PlannedTask[] = [
    {
      key: "matb1",
      title: "Collect the MATB1 certificate",
      detail:
        "The midwife issues it from twenty weeks before the due date. No employer will start Statutory Maternity Pay without it.",
      dueDate: dates.matb1From,
      category: "admin",
      hard: false,
    },
    {
      key: "notify-employer",
      title: "Tell the employer, in writing",
      detail:
        "The deadline is the end of the fifteenth week before the baby is due. Miss it and the employer can refuse Statutory Maternity Pay outright.",
      dueDate: dates.notifyEmployerBy,
      category: "employer",
      hard: true,
    },
    {
      key: "confirm-policy",
      title: "Get the employer's maternity policy in writing",
      detail:
        "Enhanced pay is contractual, not statutory. Confirm how many weeks are at full pay, how many at half, and whether any of it is repayable if you do not return.",
      dueDate: addWeeks(dates.notifyEmployerBy, 1),
      category: "employer",
      hard: false,
    },
    {
      key: "review-cover",
      title: "Review life cover and the will",
      detail:
        "Guardianship and cover both change the day the child arrives, and neither can be arranged retrospectively.",
      dueDate: addWeeks(dueDate, -8),
      category: "money",
      hard: false,
    },
    {
      key: "leave-starts",
      title: "Maternity leave can start from here",
      detail: "Eleven weeks before the due date is the earliest leave is allowed to begin.",
      dueDate: dates.earliestLeaveStart,
      category: "employer",
      hard: false,
    },
    {
      key: "due-date",
      title: "Due date",
      detail: "Leave and pay start automatically if the baby arrives before the planned date.",
      dueDate: dates.dueDate,
      category: "admin",
      hard: false,
    },
    {
      key: "register-birth",
      title: "Register the birth",
      detail: `Within ${BIRTH_REGISTRATION_DAYS} days. The certificate is needed for Child Benefit and for a passport.`,
      dueDate: dates.registerBirthBy,
      category: "admin",
      hard: true,
    },
    {
      key: "child-benefit",
      title: "Claim Child Benefit",
      detail:
        "Claim even if the charge takes all of it back — the claim carries National Insurance credits towards the state pension. It only backdates three months.",
      dueDate: dates.claimChildBenefitBy,
      category: "benefits",
      hard: true,
    },
    {
      key: "junior-isa",
      title: "Open a Junior ISA",
      detail: `Available from the day of birth, with a £${JUNIOR_ISA_LIMIT.toLocaleString("en-GB")} allowance each tax year that cannot be carried forward.`,
      dueDate: addMonths(dueDate, 1),
      category: "money",
      hard: false,
    },
    {
      key: "tax-year-review",
      title: "Check adjusted net income before the tax year ends",
      detail:
        "The last chance to make a pension contribution that keeps either parent under £100,000 for the year, and so keeps the funded hours and Tax-Free Childcare.",
      dueDate: dates.taxYearEnd,
      category: "money",
      hard: true,
    },
    {
      key: "funded-hours-apply",
      title: "Apply for the funded hours code",
      detail:
        "The code has to be in hand before the term starts, and the nursery has to see it. Applying late costs a full term of funding.",
      dueDate: dates.fundedHoursApplyBy,
      category: "childcare",
      hard: true,
    },
    {
      key: "funded-hours-start",
      title: "Funded hours begin",
      detail:
        "The term after the child turns nine months. Everything before this date is paid at the full rate.",
      dueDate: dates.fundedHoursStart,
      category: "childcare",
      hard: false,
    },
  ];

  if (dates.taxFreeChildcareOpenBy) {
    tasks.push({
      key: "tax-free-childcare",
      title: "Open the Tax-Free Childcare account",
      detail:
        "The government adds 20% of what you pay in, to £2,000 a year. Eligibility has to be reconfirmed every three months or the account stops topping up.",
      dueDate: dates.taxFreeChildcareOpenBy,
      category: "childcare",
      hard: false,
    });
  }
  if (dates.nurseryStart) {
    tasks.push({
      key: "nursery-start",
      title: "Nursery starts",
      detail: "The first month is usually a deposit plus fees in advance.",
      dueDate: dates.nurseryStart,
      category: "childcare",
      hard: false,
    });
  }

  return tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * One-off costs, as goal line items. Amounts are left at zero deliberately —
 * the household fills in what they intend to spend rather than being shown a
 * national average dressed up as their own plan.
 */
export const BABY_ONE_OFF_ITEMS = [
  { label: "Pushchair and car seat", note: "The two that cannot be borrowed safely." },
  { label: "Cot, mattress and nursery furniture", note: "" },
  { label: "Nursery decoration", note: "" },
  { label: "Sterilising, feeding and bottles", note: "" },
  { label: "First wardrobe", note: "Newborn sizes last weeks, not months." },
  { label: "Pram accessories and carrier", note: "" },
  { label: "Hospital bag and birth costs", note: "Parking, meals and any private care." },
  { label: "Nursery deposit and first month in advance", note: "Usually payable months before the place starts." },
  { label: "Postnatal support", note: "Night nurse, doula or maternity nurse if used." },
] as const;

/**
 * Recurring costs, as household expenses. `endMonths` is how long each one
 * typically runs from the birth, so the forecast stops charging for nappies
 * once the child is out of them rather than for the whole projection.
 */
export const BABY_RECURRING_ITEMS = [
  { label: "Nappies and wipes", endMonths: 30 },
  { label: "Formula and feeding", endMonths: 12 },
  { label: "Baby clothing", endMonths: 60 },
  { label: "Baby toiletries and consumables", endMonths: 36 },
  { label: "Classes and activities", endMonths: 24 },
  { label: "Higher household running costs", endMonths: 60 },
] as const;
