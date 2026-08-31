/**
 * The 2026/27 figures the baby plan is built on.
 *
 * Every number here is a published rate or threshold, not an estimate. They are
 * gathered in one file so that when the rates change in April there is exactly
 * one place to change them, and so nothing downstream is tempted to invent a
 * figure of its own.
 */

export const TAX_YEAR = "2026/27";

/** Statutory Maternity Pay and Maternity Allowance, per week. */
export const STATUTORY_WEEKLY_CAP = 194.32;

/** SMP pays 90% of average weekly earnings, uncapped, for the first six weeks. */
export const SMP_HIGHER_RATE_WEEKS = 6;
export const SMP_HIGHER_RATE_FRACTION = 0.9;

/** Weeks 7–39 are the lower of 90% of earnings or the weekly cap. */
export const SMP_PAID_WEEKS = 39;

/** The entitlement runs 52 weeks; the last 13 are unpaid. */
export const MATERNITY_LEAVE_WEEKS = 52;

/** Maternity Allowance is flat-rate from week one, for 39 weeks. */
export const MATERNITY_ALLOWANCE_WEEKS = 39;

/** Statutory Paternity Pay: two weeks at the same lower rate. */
export const PATERNITY_PAID_WEEKS = 2;
export const PATERNITY_LEAVE_WEEKS = 2;

/** Child Benefit, per week. */
export const CHILD_BENEFIT_FIRST_CHILD = 27.05;
export const CHILD_BENEFIT_ADDITIONAL_CHILD = 17.9;

/** The High Income Child Benefit Charge tapers the whole award away across this band. */
export const HICBC_LOWER = 60_000;
export const HICBC_UPPER = 80_000;

/**
 * Funded childcare hours and Tax-Free Childcare are withdrawn in full if
 * *either* parent goes a pound over this. A cliff, not a taper.
 */
export const CHILDCARE_INCOME_CEILING = 100_000;

/** Tax-Free Childcare: the government adds 20% of what you pay, to this annual cap. */
export const TAX_FREE_CHILDCARE_RATE = 0.2;
export const TAX_FREE_CHILDCARE_CAP = 2_000;

/** Funded hours for working parents: up to 30 a week, 38 weeks a year. */
export const FUNDED_HOURS_PER_WEEK = 30;
export const FUNDED_WEEKS_PER_YEAR = 38;

/** Funded hours begin the term after the child turns nine months. */
export const FUNDED_HOURS_AGE_MONTHS = 9;

/** Junior ISA subscription limit — available from the day of birth. */
export const JUNIOR_ISA_LIMIT = 9_000;

/** Personal allowance, and the band over which it tapers away at £1 in every £2. */
export const PERSONAL_ALLOWANCE = 12_570;
export const PERSONAL_ALLOWANCE_TAPER_START = 100_000;
export const PERSONAL_ALLOWANCE_TAPER_END =
  PERSONAL_ALLOWANCE_TAPER_START + PERSONAL_ALLOWANCE * 2;

/** Higher rate of income tax, the rate relief is given at in the taper band. */
export const HIGHER_RATE = 0.4;

/** Birth must be registered within this many days. */
export const BIRTH_REGISTRATION_DAYS = 42;

/**
 * Maternity leave and pay must be notified to the employer by the end of the
 * 15th week before the expected week of childbirth. The same week decides
 * whether SMP is payable at all, so it is the hardest date in the plan.
 */
export const NOTIFY_EMPLOYER_WEEKS_BEFORE = 15;
