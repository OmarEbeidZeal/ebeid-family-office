/**
 * A read policy document becomes a policy record.
 *
 * A renewal notice for a policy already on file updates it rather than filing
 * a second copy — households receive one of these a year, and a cover summary
 * that lists the same policy four times is worse than useless.
 */
import type { InsuranceExtract } from "../extract.server";
import { insurerDomain } from "../insurers";
import { loadPeople, matchPerson, type Person } from "../people.server";
import { maskReference } from "../redact";
import { INSURANCE_TYPES, type InsuranceType, type PremiumFrequency } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const CURRENCY = /^[A-Za-z]{3}$/;

function currencyOf(raw: string | null): string {
  return raw && CURRENCY.test(raw) ? raw.toUpperCase() : "GBP";
}

function typeOf(raw: string | null): InsuranceType {
  return INSURANCE_TYPES.includes(raw as InsuranceType) ? (raw as InsuranceType) : "other";
}

function frequencyOf(raw: string | null): PremiumFrequency {
  const allowed: PremiumFrequency[] = ["monthly", "quarterly", "annual", "one_off"];
  return allowed.includes(raw as PremiumFrequency) ? (raw as PremiumFrequency) : "monthly";
}

function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return match ? match[0]! : null;
}

function positive(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.abs(value);
}

function wholeNumber(value: number | null): number | null {
  const clean = positive(value);
  return clean === null ? null : Math.round(clean);
}

export type PersistResult = { id: string; needsReview: boolean; summary: string };

export async function persistInsurance(
  supabase: Client,
  input: {
    householdId: string;
    documentId: string;
    ownerProfileId?: string | null;
    people?: Person[];
  },
  extract: InsuranceExtract,
): Promise<PersistResult> {
  const people = input.people ?? (await loadPeople(supabase, input.householdId));
  const matched = matchPerson(extract.insured_person, people);
  const ownerProfileId = matched ?? input.ownerProfileId ?? null;

  const insurer = extract.insurer?.trim() || "Insurer not named on the document";
  const last4 = maskReference(extract.policy_number);
  const policyType = typeOf(extract.policy_type);
  const premium = positive(extract.premium_amount);
  const endDate = isoDate(extract.end_date);

  // Two things missing together usually means the reader found very little —
  // worth a second look rather than a quietly wrong entry in the cover summary.
  const thin = !endDate && premium === null;
  const needsReview =
    thin || !extract.insurer || (extract.confidence ?? 0) < 0.5 || extract.policy_type === null;

  const row = {
    household_id: input.householdId,
    document_id: input.documentId,
    owner_profile_id: ownerProfileId,
    insurer,
    insurer_domain: insurerDomain(insurer),
    policy_type: policyType,
    policy_number_last4: last4,
    insured_person: extract.insured_person?.trim() || null,
    start_date: isoDate(extract.start_date),
    end_date: endDate,
    renewal_date: isoDate(extract.renewal_date),
    premium_amount: premium,
    currency: currencyOf(extract.currency),
    premium_frequency: frequencyOf(extract.premium_frequency),
    sum_assured: positive(extract.sum_assured),
    benefit_amount: positive(extract.benefit_amount),
    benefit_frequency: ["monthly", "annual", "lump_sum"].includes(extract.benefit_frequency ?? "")
      ? extract.benefit_frequency
      : null,
    benefit_period_months: wholeNumber(extract.benefit_period_months),
    deferred_period_weeks: wholeNumber(extract.deferred_period_weeks),
    beneficiaries: extract.beneficiaries?.trim() || null,
    in_trust: extract.in_trust,
    exclusions: extract.exclusions?.trim() || null,
    notes: extract.notes?.trim() || null,
    source: "document",
    confidence: extract.confidence ?? null,
    needs_review: needsReview,
  };

  /* ------------------------------------------------------------ matching */
  let existingId: string | null = null;

  if (last4) {
    const { data } = await supabase
      .from("insurance_policies")
      .select("id")
      .eq("household_id", input.householdId)
      .eq("policy_number_last4", last4)
      .ilike("insurer", insurer)
      .limit(1)
      .maybeSingle();
    existingId = data?.id ?? null;
  }

  if (!existingId) {
    let query = supabase
      .from("insurance_policies")
      .select("id")
      .eq("household_id", input.householdId)
      .eq("policy_type", policyType)
      .ilike("insurer", insurer)
      .limit(1);
    query = ownerProfileId
      ? query.eq("owner_profile_id", ownerProfileId)
      : query.is("owner_profile_id", null);
    const { data } = await query.maybeSingle();
    existingId = data?.id ?? null;
  }

  if (existingId) {
    const { error } = await supabase.from("insurance_policies").update(row).eq("id", existingId);
    if (error) throw new Error(error.message);
    return {
      id: existingId,
      needsReview,
      summary: `Updated the ${policyType.replace(/_/g, " ")} policy with ${insurer}.`,
    };
  }

  const { data, error } = await supabase
    .from("insurance_policies")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: data.id as string,
    needsReview,
    summary: `Filed a ${policyType.replace(/_/g, " ")} policy with ${insurer}.`,
  };
}
