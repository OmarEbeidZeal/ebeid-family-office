/**
 * What the documents mean, once they are read.
 *
 * Pure arithmetic over plain rows: cover against need, a tenancy against the
 * calendar, payslips against £100,000. Client-safe, so the screens, the
 * advisor's context and the briefing all compute the same numbers from the
 * same code rather than three near-agreeing versions of it.
 *
 * Every estimate carries its basis. A figure derived from a projection is
 * labelled as one, because a household making a pension decision on it needs
 * to know which part is read from paper and which part is arithmetic.
 */
import { addMonths, daysBetween, toIso } from "../planning/dates";
import { PAY_PERIODS_PER_YEAR, type PayFrequency, type RentFrequency, type TenancyStatus } from "./types";

const today = () => toIso(new Date());

/* ------------------------------------------------------------------ rent */

const RENT_PERIODS_PER_YEAR: Record<RentFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

export function rentPerYear(amount: number, frequency: RentFrequency): number {
  return amount * (RENT_PERIODS_PER_YEAR[frequency] ?? 12);
}

export function rentPerMonth(amount: number, frequency: RentFrequency): number {
  return rentPerYear(amount, frequency) / 12;
}

/** The forecast holds four frequencies; a weekly rent becomes its monthly equal. */
export function forecastFrequencyFor(
  amount: number,
  frequency: RentFrequency,
): { amount: number; frequency: "monthly" | "quarterly" | "annual" } {
  if (frequency === "quarterly") return { amount, frequency: "quarterly" };
  if (frequency === "annual") return { amount, frequency: "annual" };
  return { amount: rentPerMonth(amount, frequency), frequency: "monthly" };
}

export function tenancyStatusOn(
  termStart: string | null,
  termEnd: string | null,
  on: string = today(),
): TenancyStatus {
  if (termStart && termStart > on) return "upcoming";
  if (termEnd && termEnd < on) return "ended";
  return "current";
}

/* --------------------------------------------------------------- notice */

export type NoticeWindow = {
  /** The date the tenancy ends, if the agreement fixes one. */
  termEnd: string | null;
  breakDate: string | null;
  noticeMonths: number | null;
  /** The last day notice can be given and still land on the term end. */
  lastNoticeDate: string | null;
  /** The last day notice can be given to use the break clause. */
  breakNoticeDate: string | null;
  /** Days from today to the earliest decision date, negative once passed. */
  daysToDecision: number | null;
  decisionDate: string | null;
  decisionLabel: string | null;
};

export type TenancyLike = {
  term_end: string | null;
  break_clause_date: string | null;
  notice_period_months: number | null;
};

/**
 * The dates that actually decide when a household can move.
 *
 * The term end is not the decision point — the notice date is, and it is
 * always earlier. A break clause moves it earlier again.
 */
export function noticeWindow(tenancy: TenancyLike, on: string = today()): NoticeWindow {
  const months = tenancy.notice_period_months;
  const lastNoticeDate =
    tenancy.term_end && months !== null ? addMonths(tenancy.term_end, -months) : null;
  const breakNoticeDate =
    tenancy.break_clause_date && months !== null
      ? addMonths(tenancy.break_clause_date, -months)
      : null;

  const candidates: Array<{ date: string; label: string }> = [];
  if (breakNoticeDate) candidates.push({ date: breakNoticeDate, label: "notice to use the break clause" });
  if (lastNoticeDate) candidates.push({ date: lastNoticeDate, label: "notice to end at the term end" });

  const upcoming = candidates.filter((entry) => entry.date >= on).sort((a, b) => a.date.localeCompare(b.date));
  const chosen = upcoming[0] ?? candidates.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  return {
    termEnd: tenancy.term_end,
    breakDate: tenancy.break_clause_date,
    noticeMonths: months,
    lastNoticeDate,
    breakNoticeDate,
    daysToDecision: chosen ? daysBetween(on, chosen.date) : null,
    decisionDate: chosen?.date ?? null,
    decisionLabel: chosen?.label ?? null,
  };
}

/* ------------------------------------------------------------- insurance */

export type PolicyLike = {
  id: string;
  policy_type: string;
  insurer: string;
  insured_person: string | null;
  owner_profile_id: string | null;
  sum_assured: number | null;
  benefit_amount: number | null;
  benefit_frequency: string | null;
  premium_amount: number | null;
  premium_frequency: string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  in_trust: boolean | null;
  status: string;
};

export type PersonLike = {
  id: string | null;
  name: string;
  /** Gross annual income attributed to this person, for replacement cover. */
  annualIncome: number;
};

export type CoverSummary = {
  person: PersonLike;
  lifeCover: number;
  criticalIllnessCover: number;
  /** Monthly benefit from income protection, where the benefit is monthly. */
  incomeProtectionMonthly: number;
  hasIncomeProtection: boolean;
  policies: PolicyLike[];
};

const ACTIVE = (policy: PolicyLike) => policy.status === "active";

function belongsTo(policy: PolicyLike, person: PersonLike): boolean {
  if (policy.owner_profile_id && person.id) return policy.owner_profile_id === person.id;
  if (!policy.insured_person) return false;
  const insured = policy.insured_person.toLowerCase();
  const name = person.name.toLowerCase();
  if (!name) return false;
  return insured.includes(name) || name.includes(insured) || insured.split(/\s+/)[0] === name.split(/\s+/)[0];
}

function monthlyBenefit(policy: PolicyLike): number {
  if (policy.benefit_amount === null) return 0;
  if (policy.benefit_frequency === "annual") return policy.benefit_amount / 12;
  if (policy.benefit_frequency === "lump_sum") return 0;
  return policy.benefit_amount;
}

export function coverByPerson(policies: PolicyLike[], people: PersonLike[]): CoverSummary[] {
  return people.map((person) => {
    const owned = policies.filter((policy) => ACTIVE(policy) && belongsTo(policy, person));
    return {
      person,
      lifeCover: owned
        .filter((policy) => policy.policy_type === "life")
        .reduce((sum, policy) => sum + (policy.sum_assured ?? 0), 0),
      criticalIllnessCover: owned
        .filter((policy) => policy.policy_type === "critical_illness")
        .reduce((sum, policy) => sum + (policy.sum_assured ?? 0), 0),
      incomeProtectionMonthly: owned
        .filter((policy) => policy.policy_type === "income_protection")
        .reduce((sum, policy) => sum + monthlyBenefit(policy), 0),
      hasIncomeProtection: owned.some((policy) => policy.policy_type === "income_protection"),
      policies: owned,
    };
  });
}

export type ProtectionGap = {
  /** Everything owed, from the balance sheet. */
  liabilities: number;
  /** Years of income the household chose to replace. */
  years: number;
  incomeReplacement: number;
  need: number;
  cover: number;
  /** Positive means uncovered. */
  gap: number;
  /** Life policies not written in trust — the estate pays inheritance tax on these. */
  notInTrust: PolicyLike[];
  /** Policies with neither an end date nor a premium: extraction found little. */
  needsASecondLook: PolicyLike[];
  peopleWithoutIncomeProtection: PersonLike[];
  peopleWithoutLifeCover: PersonLike[];
};

export function protectionGap(input: {
  policies: PolicyLike[];
  people: PersonLike[];
  liabilities: number;
  years: number;
}): ProtectionGap {
  const active = input.policies.filter(ACTIVE);
  const summaries = coverByPerson(active, input.people);

  const householdIncome = input.people.reduce((sum, person) => sum + person.annualIncome, 0);
  const incomeReplacement = householdIncome * input.years;
  const need = input.liabilities + incomeReplacement;
  const cover = active
    .filter((policy) => policy.policy_type === "life")
    .reduce((sum, policy) => sum + (policy.sum_assured ?? 0), 0);

  return {
    liabilities: input.liabilities,
    years: input.years,
    incomeReplacement,
    need,
    cover,
    gap: Math.max(0, need - cover),
    notInTrust: active.filter((policy) => policy.policy_type === "life" && policy.in_trust !== true),
    needsASecondLook: active.filter(
      (policy) => !policy.end_date && policy.premium_amount === null,
    ),
    peopleWithoutIncomeProtection: summaries
      .filter((summary) => !summary.hasIncomeProtection && summary.person.annualIncome > 0)
      .map((summary) => summary.person),
    peopleWithoutLifeCover: summaries
      .filter((summary) => summary.lifeCover <= 0)
      .map((summary) => summary.person),
  };
}

export type RenewalFlag = { policy: PolicyLike; date: string; daysAway: number; band: 30 | 60 };

/**
 * Renewals inside 60 days, flagged again at 30. Auto-renewal is where a
 * household quietly overpays, and the only cure is being told in time.
 */
export function upcomingRenewals(
  policies: PolicyLike[],
  on: string = today(),
  horizonDays = 60,
): RenewalFlag[] {
  return policies
    .filter(ACTIVE)
    .map((policy) => {
      const date = policy.renewal_date ?? policy.end_date;
      if (!date) return null;
      const daysAway = daysBetween(on, date);
      if (daysAway < 0 || daysAway > horizonDays) return null;
      return { policy, date, daysAway, band: daysAway <= 30 ? 30 : 60 } as RenewalFlag;
    })
    .filter((entry): entry is RenewalFlag => entry !== null)
    .sort((a, b) => a.daysAway - b.daysAway);
}

/* -------------------------------------------------------------- payslips */

export type PayslipLike = {
  id: string;
  profile_id: string | null;
  employer: string | null;
  employee_name: string | null;
  pay_date: string;
  pay_frequency: string | null;
  tax_year: string | null;
  tax_code: string | null;
  currency: string;
  gross_pay: number | null;
  net_pay: number | null;
  income_tax: number | null;
  national_insurance: number | null;
  employee_pension: number | null;
  employer_pension: number | null;
  salary_sacrifice: boolean;
  benefits_in_kind: number | null;
  ytd_gross: number | null;
  ytd_employee_pension: number | null;
  ytd_employer_pension: number | null;
  ytd_benefits_in_kind: number | null;
  ytd_net_pay: number | null;
  reconciliation: string;
  reconciliation_delta: number | null;
};

/** "2026/27" for any date, on the 6 April boundary. */
export function taxYearOf(date: string): string {
  const year = Number(date.slice(0, 4));
  const startYear = date < `${year}-04-06` ? year - 1 : year;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function taxYearStart(taxYear: string): string {
  return `${taxYear.slice(0, 4)}-04-06`;
}

function periodsPerYear(frequency: string | null): number {
  return PAY_PERIODS_PER_YEAR[(frequency ?? "monthly") as PayFrequency] ?? 12;
}

/**
 * How many pay dates have already happened this tax year. Derived from the
 * date rather than counted from the payslips on file, because a household that
 * uploads three of twelve slips still has nine that happened.
 */
/**
 * How many pay dates have already happened this tax year, counting the one on
 * the slip in hand. A September monthly slip is the sixth of twelve, so six are
 * left — rounding that up by one would project a whole extra month of pay.
 */
function periodsElapsed(payDate: string, taxYear: string, perYear: number): number {
  const days = Math.max(0, daysBetween(taxYearStart(taxYear), payDate));
  return Math.min(perYear, Math.max(1, Math.ceil(((days + 1) / 365) * perYear)));
}

export type AniEstimate = {
  profileId: string | null;
  name: string;
  taxYear: string;
  latestPayDate: string;
  employers: string[];
  perYear: number;
  elapsed: number;
  remaining: number;
  ytdGross: number;
  projectedGross: number;
  ytdPension: number;
  projectedPension: number;
  ytdBenefits: number;
  projectedBenefits: number;
  otherIncome: number;
  salarySacrifice: boolean;
  /** The estimate itself. */
  ani: number;
  /** Positive below £100,000, negative above it. */
  headroom: number;
  status: "clear" | "close" | "over";
  /** The pension contribution that would bring it back under the line. */
  contributionToClear: number;
  /** Plain sentences saying how the figure was arrived at. */
  basis: string[];
};

export const ANI_CLIFF = 100_000;
/** Within this of the line, it is worth saying so before the year ends. */
export const ANI_CLOSE = 5_000;

/**
 * A running adjusted-net-income estimate from the payslips on file.
 *
 * Year-to-date figures are read from the most recent slip per employer, and the
 * rest of the year is projected at the same rate. It is explicitly an estimate:
 * adjusted net income includes things a payslip never sees — dividends,
 * property income, Gift Aid — so the caller passes those in and the result says
 * plainly that an accountant confirms it.
 */
export function estimateAni(input: {
  payslips: PayslipLike[];
  profileId: string | null;
  name: string;
  taxYear: string;
  otherIncome?: number;
  giftAid?: number;
}): AniEstimate | null {
  const mine = input.payslips
    .filter((slip) => (slip.profile_id ?? null) === input.profileId)
    .filter((slip) => (slip.tax_year ?? taxYearOf(slip.pay_date)) === input.taxYear)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date));
  if (!mine.length) return null;

  // One slip per employer — the latest, because its year-to-date column already
  // contains every earlier slip from that employer.
  const byEmployer = new Map<string, PayslipLike>();
  for (const slip of mine) byEmployer.set((slip.employer ?? "").toLowerCase(), slip);
  const latestPerEmployer = [...byEmployer.values()];
  const latest = mine[mine.length - 1]!;

  const perYear = periodsPerYear(latest.pay_frequency);
  const elapsed = periodsElapsed(latest.pay_date, input.taxYear, perYear);
  const remaining = Math.max(0, perYear - elapsed);

  const sum = (pick: (slip: PayslipLike) => number | null) =>
    latestPerEmployer.reduce((total, slip) => total + (pick(slip) ?? 0), 0);

  const ytdGross = sum((slip) => slip.ytd_gross);
  const ytdPension = sum((slip) => slip.ytd_employee_pension);
  const ytdBenefits = sum((slip) => slip.ytd_benefits_in_kind);

  const perPeriodGross = sum((slip) => slip.gross_pay);
  const perPeriodPension = sum((slip) => slip.employee_pension);
  const perPeriodBenefits = sum((slip) => slip.benefits_in_kind);

  const projectedGross = ytdGross + perPeriodGross * remaining;
  const projectedPension = ytdPension + perPeriodPension * remaining;
  const projectedBenefits = ytdBenefits + perPeriodBenefits * remaining;

  const sacrifice = latestPerEmployer.some((slip) => slip.salary_sacrifice);
  const otherIncome = input.otherIncome ?? 0;
  const giftAid = (input.giftAid ?? 0) * 1.25;

  // Under salary sacrifice the gross printed on the slip is already net of the
  // contribution, so deducting it again would understate income by the whole
  // amount — the single commonest way this figure goes wrong.
  const deductiblePension = sacrifice ? 0 : projectedPension;
  const ani = Math.max(
    0,
    projectedGross + projectedBenefits + otherIncome - deductiblePension - giftAid,
  );

  const headroom = ANI_CLIFF - ani;
  const status = headroom < 0 ? "over" : headroom <= ANI_CLOSE ? "close" : "clear";

  const basis: string[] = [
    `Year to date on the ${latest.pay_date} payslip: ${Math.round(ytdGross).toLocaleString("en-GB")} gross.`,
    remaining > 0
      ? `${remaining} pay date${remaining === 1 ? "" : "s"} left in ${input.taxYear}, projected at the current rate.`
      : `All ${perYear} pay dates in ${input.taxYear} are accounted for.`,
  ];
  if (sacrifice) {
    basis.push("Pension is by salary sacrifice, so it is already out of the gross figure.");
  } else if (projectedPension > 0) {
    basis.push(
      `${Math.round(projectedPension).toLocaleString("en-GB")} of pension contributions deducted.`,
    );
  }
  if (projectedBenefits > 0) {
    basis.push(
      `${Math.round(projectedBenefits).toLocaleString("en-GB")} of payrolled benefits added.`,
    );
  }
  if (otherIncome > 0) {
    basis.push(
      `${Math.round(otherIncome).toLocaleString("en-GB")} of other income added from the income streams on file.`,
    );
  }
  basis.push(
    "An estimate, not a return — adjusted net income includes things a payslip never shows. Confirm it with an accountant.",
  );

  return {
    profileId: input.profileId,
    name: input.name,
    taxYear: input.taxYear,
    latestPayDate: latest.pay_date,
    employers: latestPerEmployer.map((slip) => slip.employer ?? "Employer not named"),
    perYear,
    elapsed,
    remaining,
    ytdGross,
    projectedGross,
    ytdPension,
    projectedPension,
    ytdBenefits,
    projectedBenefits,
    otherIncome,
    salarySacrifice: sacrifice,
    ani,
    headroom,
    status,
    contributionToClear: headroom < 0 ? Math.ceil(-headroom / 100) * 100 : 0,
    basis,
  };
}

export const PENSION_ANNUAL_ALLOWANCE = 60_000;
export const PENSION_TAPER_THRESHOLD = 260_000;
export const PENSION_TAPER_FLOOR = 10_000;

export type PensionAllowanceEstimate = {
  ytdEmployee: number;
  ytdEmployer: number;
  ytdTotal: number;
  projectedTotal: number;
  allowance: number;
  headroom: number;
  /** Adjusted income, which is ANI plus employer contributions. */
  adjustedIncome: number;
  taperLikely: boolean;
  taperedAllowance: number;
};

export function pensionAllowance(input: {
  payslips: PayslipLike[];
  profileId: string | null;
  taxYear: string;
  ani: number | null;
}): PensionAllowanceEstimate | null {
  const mine = input.payslips
    .filter((slip) => (slip.profile_id ?? null) === input.profileId)
    .filter((slip) => (slip.tax_year ?? taxYearOf(slip.pay_date)) === input.taxYear)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date));
  if (!mine.length) return null;

  const byEmployer = new Map<string, PayslipLike>();
  for (const slip of mine) byEmployer.set((slip.employer ?? "").toLowerCase(), slip);
  const latestPerEmployer = [...byEmployer.values()];
  const latest = mine[mine.length - 1]!;

  const perYear = periodsPerYear(latest.pay_frequency);
  const remaining = Math.max(0, perYear - periodsElapsed(latest.pay_date, input.taxYear, perYear));
  const sum = (pick: (slip: PayslipLike) => number | null) =>
    latestPerEmployer.reduce((total, slip) => total + (pick(slip) ?? 0), 0);

  const ytdEmployee = sum((slip) => slip.ytd_employee_pension);
  const ytdEmployer = sum((slip) => slip.ytd_employer_pension);
  const employerPerPeriod = sum((slip) => slip.employer_pension);
  const perPeriod = sum((slip) => slip.employee_pension) + employerPerPeriod;
  const ytdTotal = ytdEmployee + ytdEmployer;
  const projectedTotal = ytdTotal + perPeriod * remaining;
  const projectedEmployer = ytdEmployer + employerPerPeriod * remaining;

  // Adjusted income is the whole year's income plus the whole year's employer
  // contributions, so the employer side is projected to match the projected ANI
  // rather than stopping at the year-to-date column.
  const adjustedIncome = (input.ani ?? 0) + projectedEmployer;
  const taperLikely = adjustedIncome > PENSION_TAPER_THRESHOLD;
  const taperedAllowance = taperLikely
    ? Math.max(
        PENSION_TAPER_FLOOR,
        PENSION_ANNUAL_ALLOWANCE - (adjustedIncome - PENSION_TAPER_THRESHOLD) / 2,
      )
    : PENSION_ANNUAL_ALLOWANCE;

  return {
    ytdEmployee,
    ytdEmployer,
    ytdTotal,
    projectedTotal,
    allowance: PENSION_ANNUAL_ALLOWANCE,
    headroom: taperedAllowance - projectedTotal,
    adjustedIncome,
    taperLikely,
    taperedAllowance,
  };
}

/* ------------------------------------------------------------- tax codes */

export type TaxCodeIssue = {
  kind: "emergency" | "changed" | "no_allowance";
  code: string;
  previous?: string;
  since: string;
  note: string;
};

const EMERGENCY = /(W1|M1|\bX\b)$/i;
const NO_ALLOWANCE = /^(BR|0T|D0|D1|NT)/i;

/** What a wrong tax code looks like, and it is common enough to be worth watching. */
export function taxCodeIssues(payslips: PayslipLike[]): TaxCodeIssue[] {
  const withCode = payslips
    .filter((slip) => slip.tax_code)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date));
  if (!withCode.length) return [];

  const issues: TaxCodeIssue[] = [];
  const latest = withCode[withCode.length - 1]!;
  const code = latest.tax_code!.trim().toUpperCase();

  if (EMERGENCY.test(code.replace(/\s+/g, ""))) {
    issues.push({
      kind: "emergency",
      code,
      since: latest.pay_date,
      note: "An emergency code taxes each period in isolation, so too much tax is usually being paid.",
    });
  } else if (NO_ALLOWANCE.test(code)) {
    issues.push({
      kind: "no_allowance",
      code,
      since: latest.pay_date,
      note: "This code gives no personal allowance. Correct on a second job; expensive if it is the only one.",
    });
  }

  for (let index = 1; index < withCode.length; index += 1) {
    const before = withCode[index - 1]!.tax_code!.trim().toUpperCase();
    const after = withCode[index]!.tax_code!.trim().toUpperCase();
    if (before !== after) {
      issues.push({
        kind: "changed",
        code: after,
        previous: before,
        since: withCode[index]!.pay_date,
        note: "A code change usually follows a benefit, an underpayment being collected, or an HMRC estimate.",
      });
    }
  }

  return issues;
}

/* ------------------------------------------------------- payslip coverage */

export type PayslipCoverage = {
  employer: string;
  profileId: string | null;
  first: string;
  last: string;
  seen: number;
  expected: number;
  missing: string[];
};

/** Months between the first and last payslip with nothing on file. */
export function payslipCoverage(payslips: PayslipLike[]): PayslipCoverage[] {
  const groups = new Map<string, PayslipLike[]>();
  for (const slip of payslips) {
    const key = `${slip.profile_id ?? "unassigned"}|${(slip.employer ?? "").toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(slip);
    groups.set(key, list);
  }

  const coverage: PayslipCoverage[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.pay_date.localeCompare(b.pay_date));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if ((first.pay_frequency ?? "monthly") !== "monthly") continue;

    const seen = new Set(sorted.map((slip) => slip.pay_date.slice(0, 7)));
    const missing: string[] = [];
    let cursor = first.pay_date.slice(0, 7);
    const end = last.pay_date.slice(0, 7);
    let guard = 0;
    while (cursor <= end && guard < 200) {
      if (!seen.has(cursor)) missing.push(cursor);
      cursor = addMonths(`${cursor}-01`, 1).slice(0, 7);
      guard += 1;
    }

    coverage.push({
      employer: first.employer ?? "Employer not named",
      profileId: first.profile_id,
      first: first.pay_date,
      last: last.pay_date,
      seen: sorted.length,
      expected: sorted.length + missing.length,
      missing,
    });
  }

  return coverage.filter((entry) => entry.missing.length > 0);
}

/* ------------------------------------------------------- rent trajectory */

export type RentPoint = {
  year: number;
  /** The rate being paid that year, from the agreement that started most recently. */
  monthly: number;
  address: string;
  currency: string;
  /** Months of that year an agreement actually covered — a part-year is not a year. */
  months: number;
  /** What the year cost across every agreement covering it. */
  paid: number;
};

/**
 * What rent has cost year by year. The honest input to a rent-versus-buy
 * conversation, and the one figure a household never has to hand.
 *
 * A tenancy that starts in September costs four months that year, not twelve,
 * so each year is prorated to the days an agreement was actually running. Where
 * two agreements overlap a year, both are counted towards what was paid and the
 * later one sets the headline rate.
 */
export function rentTrajectory(
  tenancies: Array<{
    property_address: string;
    role: string;
    rent_amount: number | null;
    rent_frequency: string;
    currency: string;
    term_start: string | null;
    term_end: string | null;
  }>,
  on: string = today(),
): RentPoint[] {
  type Slice = { year: number; monthly: number; months: number; address: string; currency: string; start: string };
  const slices: Slice[] = [];

  for (const tenancy of tenancies) {
    if (tenancy.role !== "tenant" || tenancy.rent_amount === null || !tenancy.term_start) continue;
    const monthly = rentPerMonth(tenancy.rent_amount, tenancy.rent_frequency as RentFrequency);
    // An open-ended or future-dated agreement is only counted up to today: rent
    // not yet paid is not rent paid.
    const end = tenancy.term_end && tenancy.term_end < on ? tenancy.term_end : on;
    if (end < tenancy.term_start) continue;

    const startYear = Number(tenancy.term_start.slice(0, 4));
    const endYear = Number(end.slice(0, 4));
    for (let year = startYear; year <= endYear; year += 1) {
      const from = tenancy.term_start > `${year}-01-01` ? tenancy.term_start : `${year}-01-01`;
      const to = end < `${year}-12-31` ? end : `${year}-12-31`;
      const days = daysBetween(from, to) + 1;
      if (days <= 0) continue;
      slices.push({
        year,
        monthly,
        months: Math.min(12, (days / 365) * 12),
        address: tenancy.property_address,
        currency: tenancy.currency,
        start: tenancy.term_start,
      });
    }
  }

  const byYear = new Map<number, RentPoint>();
  // Ordered by when each agreement began, so the latest one sets the headline rate.
  for (const slice of slices.sort((a, b) => a.start.localeCompare(b.start))) {
    const existing = byYear.get(slice.year);
    byYear.set(slice.year, {
      year: slice.year,
      monthly: slice.monthly,
      address: slice.address,
      currency: slice.currency,
      months: Math.min(12, (existing?.months ?? 0) + slice.months),
      paid: (existing?.paid ?? 0) + slice.monthly * slice.months,
    });
  }

  return [...byYear.values()].sort((a, b) => a.year - b.year);
}
