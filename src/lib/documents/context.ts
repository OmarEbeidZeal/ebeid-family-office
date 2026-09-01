/**
 * What the paperwork adds to the household's position, compressed for the
 * advisor.
 *
 * The screens read policies, tenancies and payslips in full. The advisor only
 * needs the conclusions: how much cover is missing, when the lease decision
 * lands, and how close each person is to £100,000. Everything here is derived
 * by the same functions the screens use, converted to base currency first, and
 * every figure carries how it was arrived at.
 *
 * Pure — no fetching, no defaults standing in for missing paper.
 */
import {
  ANI_CLIFF,
  coverByPerson,
  estimateAni,
  noticeWindow,
  payslipCoverage,
  pensionAllowance,
  protectionGap,
  rentPerMonth,
  rentTrajectory,
  taxCodeIssues,
  taxYearOf,
  tenancyStatusOn,
  upcomingRenewals,
  type PayslipLike,
  type PersonLike,
  type PolicyLike,
} from "./analysis";
import type { RentFrequency } from "./types";

export type DocPolicy = PolicyLike & { policy_number_last4: string | null };

export type DocTenancy = {
  id: string;
  role: string;
  property_address: string;
  rent_amount: number | null;
  rent_frequency: string;
  currency: string;
  deposit_amount: number | null;
  term_start: string | null;
  term_end: string | null;
  break_clause_date: string | null;
  notice_period_months: number | null;
  linked_expense_id: string | null;
  linked_asset_id: string | null;
};

export type DocContextInput = {
  now: Date;
  base: string;
  /** Native amount to base currency, the same converter the screens use. */
  toBase: (amount: number, currency: string) => number;
  people: PersonLike[];
  policies: DocPolicy[];
  tenancies: DocTenancy[];
  payslips: PayslipLike[];
  /** Everything owed, in base currency — the first half of the protection need. */
  liabilitiesBase: number;
  /** Years of income the household chose to replace on death. */
  replacementYears: number;
  otherIncomeFor: (profileId: string | null) => number;
  giftAidFor: (profileId: string | null) => number;
};

const round = (value: number | null | undefined, decimals = 0): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function buildDocumentContext(input: DocContextInput) {
  const iso = input.now.toISOString().slice(0, 10);
  const { toBase, base } = input;

  /* ------------------------------------------------------------ protection */

  // Cover is a sterling question, so every sum assured is converted first.
  const policies: DocPolicy[] = input.policies.map((policy) => ({
    ...policy,
    sum_assured: policy.sum_assured === null ? null : toBase(policy.sum_assured, policy.currency),
    benefit_amount:
      policy.benefit_amount === null ? null : toBase(policy.benefit_amount, policy.currency),
    premium_amount:
      policy.premium_amount === null ? null : toBase(policy.premium_amount, policy.currency),
    currency: base,
  }));

  const cover = coverByPerson(policies, input.people);
  const gap = protectionGap({
    policies,
    people: input.people,
    liabilities: input.liabilitiesBase,
    years: input.replacementYears,
  });
  const renewals = upcomingRenewals(policies, iso);

  const protection = {
    policies_on_file: policies.length,
    active_policies: policies.filter((policy) => policy.status === "active").length,
    replacement_years: input.replacementYears,
    need_base: round(gap.need),
    life_cover_base: round(gap.cover),
    shortfall_base: round(gap.gap),
    liabilities_base: round(gap.liabilities),
    income_replacement_base: round(gap.incomeReplacement),
    people_without_life_cover: gap.peopleWithoutLifeCover.map((person) => person.name),
    people_without_income_protection: gap.peopleWithoutIncomeProtection.map(
      (person) => person.name,
    ),
    life_policies_not_in_trust: gap.notInTrust.map((policy) => ({
      insurer: policy.insurer,
      sum_assured_base: round(policy.sum_assured),
      note: "Outside trust the payout falls into the estate and is exposed to inheritance tax and probate delay.",
    })),
    cover_by_person: cover.map((summary) => ({
      person: summary.person.name,
      annual_income_base: round(summary.person.annualIncome),
      life_cover_base: round(summary.lifeCover),
      critical_illness_cover_base: round(summary.criticalIllnessCover),
      income_protection_monthly_base: round(summary.incomeProtectionMonthly),
      life_cover_multiple_of_income:
        summary.person.annualIncome > 0
          ? round(summary.lifeCover / summary.person.annualIncome, 1)
          : null,
    })),
    renewals_within_60_days: renewals.map((flag) => ({
      insurer: flag.policy.insurer,
      type: flag.policy.policy_type,
      date: flag.date,
      days_away: flag.daysAway,
      premium_base: round(flag.policy.premium_amount),
    })),
    note: policies.length
      ? "Cover figures come from policy schedules on file. A policy not uploaded is not counted."
      : "No insurance policies on file — cover is unknown, not zero.",
  };

  /* ------------------------------------------------------------- tenancies */

  const tenancies = input.tenancies.map((tenancy) => {
    const status = tenancyStatusOn(tenancy.term_start, tenancy.term_end, iso);
    const monthly =
      tenancy.rent_amount === null
        ? null
        : toBase(
            rentPerMonth(tenancy.rent_amount, tenancy.rent_frequency as RentFrequency),
            tenancy.currency,
          );
    const window = noticeWindow(tenancy, iso);

    return {
      address: tenancy.property_address,
      role: tenancy.role,
      status,
      monthly_rent_base: round(monthly),
      deposit_base:
        tenancy.deposit_amount === null
          ? null
          : round(toBase(tenancy.deposit_amount, tenancy.currency)),
      term_start: tenancy.term_start,
      term_end: tenancy.term_end,
      break_clause_date: tenancy.break_clause_date,
      notice_months: tenancy.notice_period_months,
      decision_date: window.decisionDate,
      days_to_decision: window.daysToDecision,
      decision: window.decisionLabel,
      rent_in_forecast: !!tenancy.linked_expense_id,
      deposit_on_balance_sheet: !!tenancy.linked_asset_id,
    };
  });

  const liveTenant = tenancies.filter(
    (tenancy) => tenancy.role === "tenant" && tenancy.status === "current",
  );

  const trajectory = rentTrajectory(
    input.tenancies.map((tenancy) => ({
      property_address: tenancy.property_address,
      role: tenancy.role,
      rent_amount:
        tenancy.rent_amount === null ? null : toBase(tenancy.rent_amount, tenancy.currency),
      rent_frequency: tenancy.rent_frequency,
      currency: base,
      term_start: tenancy.term_start,
      term_end: tenancy.term_end,
    })),
    iso,
  );

  const housing = {
    agreements_on_file: tenancies.length,
    monthly_rent_out_base: round(
      liveTenant.reduce((sum, tenancy) => sum + (tenancy.monthly_rent_base ?? 0), 0),
    ),
    monthly_rent_in_base: round(
      tenancies
        .filter((tenancy) => tenancy.role === "landlord" && tenancy.status === "current")
        .reduce((sum, tenancy) => sum + (tenancy.monthly_rent_base ?? 0), 0),
    ),
    deposits_recoverable_base: round(
      tenancies
        .filter((tenancy) => tenancy.role === "tenant" && tenancy.status !== "ended")
        .reduce((sum, tenancy) => sum + (tenancy.deposit_base ?? 0), 0),
    ),
    rent_paid_to_date_base: round(trajectory.reduce((sum, point) => sum + point.paid, 0)),
    rent_by_year: trajectory.map((point) => ({
      year: point.year,
      monthly_base: round(point.monthly),
      months_covered: round(point.months, 1),
      paid_base: round(point.paid),
    })),
    agreements: tenancies,
    note: tenancies.length
      ? "Rent, deposit and notice dates are read from the signed agreements. Rent paid to date only counts years an agreement covers."
      : "No tenancy agreement on file.",
  };

  /* ---------------------------------------------------------------- payslips */

  const taxYear = taxYearOf(iso);
  const slips: PayslipLike[] = input.payslips.map((slip) => {
    const money = (amount: number | null) => (amount === null ? null : toBase(amount, slip.currency));
    return {
      ...slip,
      currency: base,
      gross_pay: money(slip.gross_pay),
      net_pay: money(slip.net_pay),
      income_tax: money(slip.income_tax),
      national_insurance: money(slip.national_insurance),
      employee_pension: money(slip.employee_pension),
      employer_pension: money(slip.employer_pension),
      benefits_in_kind: money(slip.benefits_in_kind),
      ytd_gross: money(slip.ytd_gross),
      ytd_employee_pension: money(slip.ytd_employee_pension),
      ytd_employer_pension: money(slip.ytd_employer_pension),
      ytd_benefits_in_kind: money(slip.ytd_benefits_in_kind),
      ytd_net_pay: money(slip.ytd_net_pay),
    };
  });

  const people = input.people.map((person) => {
    const ani = estimateAni({
      payslips: slips,
      profileId: person.id,
      name: person.name,
      taxYear,
      otherIncome: input.otherIncomeFor(person.id),
      giftAid: input.giftAidFor(person.id),
    });
    const pension = pensionAllowance({
      payslips: slips,
      profileId: person.id,
      taxYear,
      ani: ani?.ani ?? null,
    });
    const codes = taxCodeIssues(slips.filter((slip) => (slip.profile_id ?? null) === person.id));
    const mine = slips
      .filter((slip) => (slip.profile_id ?? null) === person.id)
      .sort((a, b) => a.pay_date.localeCompare(b.pay_date));

    return {
      person: person.name,
      payslips_in_year: mine.filter(
        (slip) => (slip.tax_year ?? taxYearOf(slip.pay_date)) === taxYear,
      ).length,
      latest_pay_date: mine[mine.length - 1]?.pay_date ?? null,
      tax_code: mine[mine.length - 1]?.tax_code ?? null,
      tax_code_flags: codes.map((issue) => ({
        kind: issue.kind,
        code: issue.code,
        previous: issue.previous ?? null,
        since: issue.since,
        note: issue.note,
      })),
      ani_estimate_base: round(ani?.ani),
      headroom_to_100k_base: round(ani?.headroom),
      ani_status: ani?.status ?? null,
      pension_contribution_to_clear_base: round(ani?.contributionToClear),
      salary_sacrifice: ani?.salarySacrifice ?? null,
      basis: ani?.basis ?? [],
      pension_allowance: pension
        ? {
            projected_total_base: round(pension.projectedTotal),
            allowance_base: round(pension.taperedAllowance),
            headroom_base: round(pension.headroom),
            taper_likely: pension.taperLikely,
          }
        : null,
    };
  });

  const pay = {
    tax_year: taxYear,
    cliff: ANI_CLIFF,
    payslips_on_file: slips.length,
    people,
    months_missing: payslipCoverage(slips).map((entry) => ({
      employer: entry.employer,
      seen: entry.seen,
      expected: entry.expected,
      missing: entry.missing,
    })),
    note: slips.length
      ? "Adjusted net income is projected from year-to-date figures on the latest payslip per employer, plus non-employment income on file. An estimate, not a tax return."
      : "No payslips on file — income figures come from the recorded income streams instead.",
  };

  return { protection, housing, pay };
}

export type DocumentContext = ReturnType<typeof buildDocumentContext>;
