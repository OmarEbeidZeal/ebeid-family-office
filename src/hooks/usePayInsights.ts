/**
 * What the payslips add up to.
 *
 * Three questions the household actually asks: how close is each of us to
 * £100,000, how much annual allowance is left, and is the tax code right.
 * Every figure is converted to base currency first — adjusted net income is a
 * sterling concept — and every estimate carries the sentences that produced it.
 */
import { useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { useCurrency } from "./useCurrency";
import { memberName } from "./useOwners";
import { usePayslips, type PayslipRow } from "./useDocuments";
import { useIncomeStreams, useTaxAllowances } from "./useFinancials";
import { monthlyEquivalent } from "@/lib/format";
import {
  estimateAni,
  payslipCoverage,
  pensionAllowance,
  taxCodeIssues,
  taxYearOf,
  type AniEstimate,
  type PayslipLike,
  type PensionAllowanceEstimate,
  type TaxCodeIssue,
} from "@/lib/documents/analysis";

/** Income a payslip never shows, so it has to be added from elsewhere. */
const NON_EMPLOYMENT = new Set(["dividend", "rental", "business", "consulting", "distribution", "other"]);

export function currentTaxYear(): string {
  return taxYearOf(new Date().toISOString().slice(0, 10));
}

export type PersonPay = {
  profileId: string | null;
  name: string;
  payslips: PayslipRow[];
  ani: AniEstimate | null;
  pension: PensionAllowanceEstimate | null;
  taxCodes: TaxCodeIssue[];
  latestTaxCode: string | null;
  otherIncome: number;
  giftAid: number;
};

export function usePayInsights() {
  const { members } = useAuth();
  const { base, convert } = useCurrency();
  const payslips = usePayslips();
  const income = useIncomeStreams();
  const allowances = useTaxAllowances();

  const [taxYear, setTaxYear] = useState<string>(currentTaxYear());

  const value = useMemo(() => {
    const rows = payslips.data ?? [];

    // Every figure in base currency before it meets a sterling threshold.
    const inBase: PayslipLike[] = rows.map((row) => {
      const money = (amount: number | null) =>
        amount === null ? null : convert(Number(amount), row.currency, base);
      return {
        id: row.id,
        profile_id: row.profile_id,
        employer: row.employer,
        employee_name: row.employee_name,
        pay_date: row.pay_date,
        pay_frequency: row.pay_frequency,
        tax_year: row.tax_year ?? taxYearOf(row.pay_date),
        tax_code: row.tax_code,
        currency: base,
        gross_pay: money(row.gross_pay),
        net_pay: money(row.net_pay),
        income_tax: money(row.income_tax),
        national_insurance: money(row.national_insurance),
        employee_pension: money(row.employee_pension),
        employer_pension: money(row.employer_pension),
        salary_sacrifice: row.salary_sacrifice,
        benefits_in_kind: money(row.benefits_in_kind),
        ytd_gross: money(row.ytd_gross),
        ytd_employee_pension: money(row.ytd_employee_pension),
        ytd_employer_pension: money(row.ytd_employer_pension),
        ytd_benefits_in_kind: money(row.ytd_benefits_in_kind),
        ytd_net_pay: money(row.ytd_net_pay),
        reconciliation: row.reconciliation,
        reconciliation_delta: row.reconciliation_delta,
      };
    });

    const years = [
      ...new Set([currentTaxYear(), ...inBase.map((slip) => slip.tax_year ?? "")].filter(Boolean)),
    ].sort((a, b) => b.localeCompare(a)) as string[];

    const streams = income.data ?? [];
    const otherIncomeFor = (profileId: string | null) =>
      streams
        .filter(
          (row) =>
            (row.owner_profile_id ?? null) === profileId && NON_EMPLOYMENT.has(row.income_type),
        )
        .reduce(
          (sum, row) =>
            sum +
            monthlyEquivalent(convert(Number(row.gross_amount ?? 0), row.currency, base), row.frequency) *
              12,
          0,
        );

    const giftAidFor = (profileId: string | null) =>
      (allowances.data ?? [])
        .filter((row) => row.tax_year === taxYear && (row.profile_id ?? null) === profileId)
        .reduce((sum, row) => sum + Number(row.gift_aid ?? 0), 0);

    // Anyone with a payslip on file, including a slip not yet assigned to a person.
    const holders: Array<{ profileId: string | null; name: string }> = members.map((member) => ({
      profileId: member.id,
      name: memberName(member),
    }));
    if (rows.some((row) => !row.profile_id)) {
      holders.push({ profileId: null, name: "Not assigned" });
    }

    const people: PersonPay[] = holders.map((holder) => {
      const mine = rows.filter(
        (row) =>
          (row.profile_id ?? null) === holder.profileId &&
          (row.tax_year ?? taxYearOf(row.pay_date)) === taxYear,
      );
      const otherIncome = otherIncomeFor(holder.profileId);
      const giftAid = giftAidFor(holder.profileId);

      const ani = estimateAni({
        payslips: inBase,
        profileId: holder.profileId,
        name: holder.name,
        taxYear,
        otherIncome,
        giftAid,
      });

      const codes = taxCodeIssues(
        inBase.filter((slip) => (slip.profile_id ?? null) === holder.profileId),
      );

      const latest = [...mine].sort((a, b) => b.pay_date.localeCompare(a.pay_date))[0] ?? null;

      return {
        profileId: holder.profileId,
        name: holder.name,
        payslips: mine.sort((a, b) => b.pay_date.localeCompare(a.pay_date)),
        ani,
        pension: pensionAllowance({
          payslips: inBase,
          profileId: holder.profileId,
          taxYear,
          ani: ani?.ani ?? null,
        }),
        taxCodes: codes,
        latestTaxCode: latest?.tax_code ?? null,
        otherIncome,
        giftAid,
      };
    });

    const coverage = payslipCoverage(inBase);
    const nameFor = (profileId: string | null) =>
      members.find((member) => member.id === profileId)?.display_name ??
      people.find((person) => person.profileId === profileId)?.name ??
      "Not assigned";

    return {
      base,
      taxYear,
      years,
      loading: payslips.isLoading || income.isLoading,
      all: rows,
      inYear: rows.filter((row) => (row.tax_year ?? taxYearOf(row.pay_date)) === taxYear),
      people: people.filter((person) => person.payslips.length > 0 || person.profileId !== null),
      coverage,
      nameFor,
      needsReview: rows.filter((row) => row.needs_review),
      unassigned: rows.filter((row) => !row.profile_id).length,
    };
  }, [
    payslips.data,
    payslips.isLoading,
    income.data,
    income.isLoading,
    allowances.data,
    members,
    base,
    convert,
    taxYear,
  ]);

  return { ...value, setTaxYear };
}

export type PayInsights = ReturnType<typeof usePayInsights>;
