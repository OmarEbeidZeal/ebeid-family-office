/**
 * Cover against need.
 *
 * The gap is only meaningful in one currency, so every policy figure is
 * converted to base before it is compared with debt or income. Everything here
 * is derived — nothing is stored except the household's chosen replacement
 * horizon — so correcting a policy immediately corrects the gap.
 */
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "./useAuth";
import { useCurrency } from "./useCurrency";
import { memberName, useOwners } from "./useOwners";
import { useInsurancePolicies } from "./useDocuments";
import { useIncomeStreams, useLiabilities } from "./useFinancials";
import { monthlyEquivalent } from "@/lib/format";
import {
  coverByPerson,
  protectionGap,
  upcomingRenewals,
  type PersonLike,
  type PolicyLike,
} from "@/lib/documents/analysis";
import { PREMIUM_FREQUENCY_LABELS, type PremiumFrequency } from "@/lib/documents/types";

const PREMIUM_PER_YEAR: Record<PremiumFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  annual: 1,
  one_off: 0,
};

export function premiumPerYear(amount: number, frequency: string): number {
  return amount * (PREMIUM_PER_YEAR[frequency as PremiumFrequency] ?? 12);
}

export function premiumLabel(frequency: string): string {
  return PREMIUM_FREQUENCY_LABELS[frequency as PremiumFrequency] ?? frequency;
}

/** The replacement horizon is a household decision, so it is stored as one. */
export function useSetReplacementYears() {
  const { household } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (years: number) => {
      const { error } = await db
        .from("households")
        .update({ income_replacement_years: years })
        .eq("id", household!.id);
      if (error) throw error;
      return years;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useProtection() {
  const { members, household } = useAuth();
  const { base, convert } = useCurrency();
  const { nameOf } = useOwners();
  const policies = useInsurancePolicies();
  const liabilities = useLiabilities();
  const income = useIncomeStreams();

  const years = household?.income_replacement_years ?? 10;

  return useMemo(() => {
    const rows = policies.data ?? [];

    // Everything compared in base currency. A dollar policy against a sterling
    // mortgage is not a comparison until it is converted.
    const inBase: PolicyLike[] = rows.map((row) => ({
      id: row.id,
      policy_type: row.policy_type,
      insurer: row.insurer,
      insured_person: row.insured_person,
      owner_profile_id: row.owner_profile_id,
      sum_assured:
        row.sum_assured === null ? null : convert(Number(row.sum_assured), row.currency, base),
      benefit_amount:
        row.benefit_amount === null ? null : convert(Number(row.benefit_amount), row.currency, base),
      benefit_frequency: row.benefit_frequency,
      premium_amount:
        row.premium_amount === null ? null : convert(Number(row.premium_amount), row.currency, base),
      premium_frequency: row.premium_frequency,
      currency: base,
      start_date: row.start_date,
      end_date: row.end_date,
      renewal_date: row.renewal_date,
      in_trust: row.in_trust,
      status: row.status,
    }));

    const byId = new Map(rows.map((row) => [row.id, row]));

    // Income attributed to a person, with anything held jointly split evenly —
    // stated on the screen, because the split changes each person's number.
    const streams = income.data ?? [];
    const annualFor = (ownerId: string | null) =>
      streams
        .filter((row) => (row.owner_profile_id ?? null) === ownerId)
        .reduce(
          (sum, row) =>
            sum +
            monthlyEquivalent(
              convert(Number(row.gross_amount ?? 0), row.currency, base),
              row.frequency,
            ) *
              12,
          0,
        );

    const jointAnnual = annualFor(null);
    const share = members.length ? jointAnnual / members.length : 0;

    const people: PersonLike[] = members.map((member) => ({
      id: member.id,
      name: memberName(member),
      annualIncome: annualFor(member.id) + share,
    }));

    const totalLiabilities = (liabilities.data ?? []).reduce(
      (sum, row) => sum + convert(Number(row.outstanding_balance ?? 0), row.currency, base),
      0,
    );

    const gap = protectionGap({ policies: inBase, people, liabilities: totalLiabilities, years });
    const cover = coverByPerson(inBase, people);
    const renewals = upcomingRenewals(inBase).map((flag) => ({
      ...flag,
      row: byId.get(flag.policy.id) ?? null,
    }));

    const active = rows.filter((row) => row.status === "active");
    const annualPremium = active.reduce(
      (sum, row) =>
        sum +
        premiumPerYear(
          convert(Number(row.premium_amount ?? 0), row.currency, base),
          row.premium_frequency,
        ),
      0,
    );

    return {
      base,
      years,
      loading: policies.isLoading || liabilities.isLoading || income.isLoading,
      policies: rows,
      active,
      people,
      cover,
      gap,
      renewals,
      annualPremium,
      jointAnnualIncome: jointAnnual,
      householdIncome: people.reduce((sum, person) => sum + person.annualIncome, 0),
      liabilities: totalLiabilities,
      nameOf,
      needsReview: rows.filter((row) => row.needs_review),
    };
  }, [
    policies.data,
    policies.isLoading,
    liabilities.data,
    liabilities.isLoading,
    income.data,
    income.isLoading,
    members,
    base,
    convert,
    years,
    nameOf,
  ]);
}

export type Protection = ReturnType<typeof useProtection>;
