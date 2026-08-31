/**
 * The two income thresholds that decide how much a baby costs.
 *
 * Neither is a tax rate anyone talks about, and both are cliffs or near-cliffs
 * measured on *adjusted net income* — total taxable income less pension
 * contributions and Gift Aid — rather than salary. Getting the measure wrong
 * is how households walk over the line without noticing.
 */

import {
  CHILD_BENEFIT_ADDITIONAL_CHILD,
  CHILD_BENEFIT_FIRST_CHILD,
  CHILDCARE_INCOME_CEILING,
  HICBC_LOWER,
  HICBC_UPPER,
  HIGHER_RATE,
  PERSONAL_ALLOWANCE,
  PERSONAL_ALLOWANCE_TAPER_END,
  PERSONAL_ALLOWANCE_TAPER_START,
} from "./uk-2026";

export type IncomeInputs = {
  /** Gross employment income, before pension. */
  grossSalary: number;
  bonus: number;
  /** Salary-sacrifice or relief-at-source pension, whichever the person uses. */
  pensionContributions: number;
  /** Dividends, rent, interest — anything taxable that isn't the salary. */
  otherTaxableIncome: number;
  giftAid: number;
};

export const EMPTY_INCOME: IncomeInputs = {
  grossSalary: 0,
  bonus: 0,
  pensionContributions: 0,
  otherTaxableIncome: 0,
  giftAid: 0,
};

/** Adjusted net income — the measure both thresholds are actually tested on. */
export function adjustedNetIncome(input: IncomeInputs): number {
  const gross = input.grossSalary + input.bonus + input.otherTaxableIncome;
  // Gift Aid is grossed up at the basic rate before it comes off.
  return Math.max(0, gross - input.pensionContributions - input.giftAid * 1.25);
}

/** The personal allowance left after the £1-in-£2 taper. */
export function personalAllowanceAt(ani: number): number {
  if (ani <= PERSONAL_ALLOWANCE_TAPER_START) return PERSONAL_ALLOWANCE;
  if (ani >= PERSONAL_ALLOWANCE_TAPER_END) return 0;
  return PERSONAL_ALLOWANCE - (ani - PERSONAL_ALLOWANCE_TAPER_START) / 2;
}

export type CliffStatus = "clear" | "close" | "over";

export type CliffAssessment = {
  ani: number;
  status: CliffStatus;
  /** Positive below the line, negative above it. */
  headroom: number;
  /** The pension contribution that brings them back under £100,000. */
  contributionToClear: number;
  /** Income tax saved by that contribution, including the restored allowance. */
  taxSaved: number;
  /** Childcare support that contribution buys back. */
  supportRecovered: number;
  /** Tax and support together, as a fraction of the contribution. */
  effectiveReturn: number;
  personalAllowance: number;
};

/**
 * What crossing £100,000 costs, and what it takes to get back under.
 *
 * The contribution needed is only the excess. What it buys back is the 40%
 * relief, the personal allowance restored at £1 in every £2 — a 60% marginal
 * rate between £100,000 and £125,140 — and the whole of the childcare support,
 * which is withdrawn outright rather than tapered.
 */
export function assessCliff(ani: number, supportAtRisk: number): CliffAssessment {
  const headroom = CHILDCARE_INCOME_CEILING - ani;
  const contributionToClear = Math.max(0, -headroom);
  const allowanceRestored = Math.min(
    PERSONAL_ALLOWANCE,
    Math.max(0, contributionToClear / 2),
  );
  const taxSaved = contributionToClear * HIGHER_RATE + allowanceRestored * HIGHER_RATE;
  const supportRecovered = contributionToClear > 0 ? supportAtRisk : 0;

  return {
    ani,
    status: headroom < 0 ? "over" : headroom <= 10_000 ? "close" : "clear",
    headroom,
    contributionToClear,
    taxSaved,
    supportRecovered,
    effectiveReturn:
      contributionToClear > 0 ? (taxSaved + supportRecovered) / contributionToClear : 0,
    personalAllowance: personalAllowanceAt(ani),
  };
}

export type ChildBenefitAssessment = {
  weekly: number;
  annual: number;
  /** The higher of the two parents' adjusted net income — the one tested. */
  testedAni: number;
  chargeRate: number;
  charge: number;
  retained: number;
  /** True when the award is entirely clawed back and only the NI credit is left. */
  fullyClawedBack: boolean;
};

export function assessChildBenefit(children: number, highestAni: number): ChildBenefitAssessment {
  const count = Math.max(0, Math.round(children));
  const weekly =
    count === 0
      ? 0
      : CHILD_BENEFIT_FIRST_CHILD + (count - 1) * CHILD_BENEFIT_ADDITIONAL_CHILD;
  const annual = weekly * 52;

  const chargeRate =
    highestAni <= HICBC_LOWER
      ? 0
      : highestAni >= HICBC_UPPER
        ? 1
        : (highestAni - HICBC_LOWER) / (HICBC_UPPER - HICBC_LOWER);
  const charge = annual * chargeRate;

  return {
    weekly,
    annual,
    testedAni: highestAni,
    chargeRate,
    charge,
    retained: annual - charge,
    fullyClawedBack: chargeRate >= 1,
  };
}

/**
 * The point most people miss: even when every penny is clawed back, the claim
 * itself is worth having. Registering it gives the parent at home National
 * Insurance credits towards the state pension until the child turns twelve,
 * and gets the child a National Insurance number automatically.
 */
export const NI_CREDIT_NOTE =
  "Register the claim even if the charge takes all of it back. Opting out of the payments — not the claim — keeps twelve years of National Insurance credits towards the state pension for whichever parent is at home, and issues the child a National Insurance number at sixteen.";

export const CLIFF_CEILING = CHILDCARE_INCOME_CEILING;
