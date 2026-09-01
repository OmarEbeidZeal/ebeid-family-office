/**
 * A read tenancy agreement becomes a tenancy record — and four links.
 *
 * The agreement on its own is a filed PDF. What makes it worth reading is what
 * it connects to: rent stops being an assumption that runs forever in the
 * forecast and becomes a committed cost with an end date, the break clause and
 * term end become dates on the timeline, the deposit stops being a sunk cost
 * and becomes a recoverable asset, and the whole thing gets measured against
 * the property purchase goal.
 */
import { forecastFrequencyFor, rentPerMonth, tenancyStatusOn } from "../analysis";
import type { TenancyExtract } from "../extract.server";
import { loadPeople, matchPerson, type Person } from "../people.server";
import { maskReference } from "../redact";
import type { RentFrequency, TenancyRole } from "../types";
import type { PersistResult } from "./insurance.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const CURRENCY = /^[A-Za-z]{3}$/;

function currencyOf(raw: string | null): string {
  return raw && CURRENCY.test(raw) ? raw.toUpperCase() : "GBP";
}

function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return match ? match[0]! : null;
}

function frequencyOf(raw: string | null): RentFrequency {
  const allowed: RentFrequency[] = ["weekly", "fortnightly", "monthly", "quarterly", "annual"];
  return allowed.includes(raw as RentFrequency) ? (raw as RentFrequency) : "monthly";
}

/** "14 Grove End Road, London NW8" → "14 Grove End Road". */
function shortAddress(address: string): string {
  const first = address.split(",")[0]?.trim() || address.trim();
  return first.length > 44 ? `${first.slice(0, 42)}…` : first;
}

export async function persistTenancy(
  supabase: Client,
  input: {
    householdId: string;
    documentId: string;
    ownerProfileId?: string | null;
    people?: Person[];
  },
  extract: TenancyExtract,
): Promise<PersistResult> {
  const people = input.people ?? (await loadPeople(supabase, input.householdId));
  const matched = matchPerson(extract.tenant_names, people);
  const ownerProfileId = matched ?? input.ownerProfileId ?? null;

  const address = extract.property_address?.trim() || "Address not stated on the document";
  const role: TenancyRole = extract.role === "landlord" ? "landlord" : "tenant";
  const rentFrequency = frequencyOf(extract.rent_frequency);
  const currency = currencyOf(extract.currency);
  const termStart = isoDate(extract.term_start);
  const termEnd = isoDate(extract.term_end);

  const needsReview =
    !extract.property_address ||
    extract.role === null ||
    extract.rent_amount === null ||
    !termStart ||
    (extract.confidence ?? 0) < 0.5;

  const base = {
    household_id: input.householdId,
    document_id: input.documentId,
    owner_profile_id: ownerProfileId,
    role,
    property_address: address,
    landlord_name: extract.landlord_name?.trim() || null,
    agent_name: extract.agent_name?.trim() || null,
    tenant_names: extract.tenant_names?.trim() || null,
    rent_amount: extract.rent_amount === null ? null : Math.abs(extract.rent_amount),
    currency,
    rent_frequency: rentFrequency,
    deposit_amount: extract.deposit_amount === null ? null : Math.abs(extract.deposit_amount),
    deposit_scheme: extract.deposit_scheme?.trim() || null,
    reference_last4: maskReference(extract.reference),
    term_start: termStart,
    term_end: termEnd,
    break_clause_date: isoDate(extract.break_clause_date),
    break_clause_notes: extract.break_clause_notes?.trim() || null,
    notice_period_months: extract.notice_period_months,
    rent_review_terms: extract.rent_review_terms?.trim() || null,
    permitted_occupiers: extract.permitted_occupiers?.trim() || null,
    council_tax_responsibility: extract.council_tax_responsibility?.trim() || null,
    utilities_responsibility: extract.utilities_responsibility?.trim() || null,
    repairs_responsibility: extract.repairs_responsibility?.trim() || null,
    status: tenancyStatusOn(termStart, termEnd),
    notes: extract.notes?.trim() || null,
    source: "document",
    confidence: extract.confidence ?? null,
    needs_review: needsReview,
  };

  /* ------------------------------------------------------------ matching */
  // The same property with the same term start is the same agreement; a new
  // term at the same address is a renewal, and gets its own row so the rent
  // trajectory can show the increase.
  const { data: existing } = await supabase
    .from("tenancies")
    .select("id, linked_expense_id, linked_income_id, linked_asset_id")
    .eq("household_id", input.householdId)
    .ilike("property_address", address)
    .eq("term_start", termStart ?? "1900-01-01")
    .limit(1)
    .maybeSingle();

  let tenancyId: string;
  if (existing) {
    const { error } = await supabase.from("tenancies").update(base).eq("id", existing.id);
    if (error) throw new Error(error.message);
    tenancyId = existing.id as string;
  } else {
    const { data, error } = await supabase.from("tenancies").insert(base).select("id").single();
    if (error) throw new Error(error.message);
    tenancyId = data.id as string;
  }

  const links = await linkTenancy(supabase, {
    householdId: input.householdId,
    tenancyId,
    ownerProfileId,
    role,
    address,
    currency,
    rentAmount: base.rent_amount,
    rentFrequency,
    depositAmount: base.deposit_amount,
    depositScheme: base.deposit_scheme,
    termStart,
    termEnd,
    existing: existing ?? null,
  });

  const verb = existing ? "Updated" : "Filed";
  const what = role === "landlord" ? "a tenancy we let out" : "a tenancy we rent";
  return {
    id: tenancyId,
    needsReview,
    summary: [`${verb} ${what} at ${shortAddress(address)}.`, ...links].join(" "),
  };
}

/* ----------------------------------------------------------------- links */

async function rentCategoryId(supabase: Client, householdId: string): Promise<string | null> {
  const { data: byName } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", householdId)
    .ilike("name", "%rent%")
    .limit(1)
    .maybeSingle();
  if (byName) return byName.id as string;

  const { data: byGroup } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", householdId)
    .ilike("category_group", "%hous%")
    .limit(1)
    .maybeSingle();
  return (byGroup?.id as string) ?? null;
}

async function linkTenancy(
  supabase: Client,
  input: {
    householdId: string;
    tenancyId: string;
    ownerProfileId: string | null;
    role: TenancyRole;
    address: string;
    currency: string;
    rentAmount: number | null;
    rentFrequency: RentFrequency;
    depositAmount: number | null;
    depositScheme: string | null;
    termStart: string | null;
    termEnd: string | null;
    existing: { linked_expense_id?: string | null; linked_income_id?: string | null; linked_asset_id?: string | null } | null;
  },
): Promise<string[]> {
  const notes: string[] = [];
  const update: Record<string, unknown> = {};
  const label = shortAddress(input.address);

  /* ------------------------------------------------ rent as a commitment */
  if (input.rentAmount !== null && input.rentAmount > 0 && input.termStart) {
    if (input.role === "tenant") {
      const forecast = forecastFrequencyFor(input.rentAmount, input.rentFrequency);
      const expense = {
        household_id: input.householdId,
        owner_profile_id: input.ownerProfileId,
        label: `Rent — ${label}`,
        category_id: await rentCategoryId(supabase, input.householdId),
        amount: Math.round(forecast.amount * 100) / 100,
        currency: input.currency,
        frequency: forecast.frequency,
        start_date: input.termStart,
        // The end date is the point of this: the forecast stops assuming rent
        // continues forever and shows the decision instead.
        end_date: input.termEnd,
        inflation_rate: 0,
        confidence: "committed",
        notes: `From the tenancy agreement for ${input.address}.`,
      };

      const existingId = input.existing?.linked_expense_id ?? null;
      if (existingId) {
        await supabase.from("forecast_expenses").update(expense).eq("id", existingId);
        update["linked_expense_id"] = existingId;
      } else {
        const { data } = await supabase
          .from("forecast_expenses")
          .insert(expense)
          .select("id")
          .maybeSingle();
        if (data) update["linked_expense_id"] = data.id;
      }
      notes.push(
        `Rent of ${Math.round(rentPerMonth(input.rentAmount, input.rentFrequency)).toLocaleString("en-GB")} ${input.currency} a month is now a committed cost in the forecast${input.termEnd ? `, ending ${input.termEnd}` : ""}.`,
      );
    } else {
      const income = {
        household_id: input.householdId,
        owner_profile_id: input.ownerProfileId,
        label: `Rent received — ${label}`,
        income_type: "rental",
        gross_amount: Math.round(rentPerMonth(input.rentAmount, input.rentFrequency) * 100) / 100,
        currency: input.currency,
        frequency: "monthly",
        start_date: input.termStart,
        end_date: input.termEnd,
        annual_growth_rate: 0,
        source: "manual",
        uk_self_assessment: true,
      };

      const existingId = input.existing?.linked_income_id ?? null;
      if (existingId) {
        await supabase.from("income_streams").update(income).eq("id", existingId);
        update["linked_income_id"] = existingId;
      } else {
        const { data } = await supabase
          .from("income_streams")
          .insert(income)
          .select("id")
          .maybeSingle();
        if (data) update["linked_income_id"] = data.id;
      }
      notes.push("The rent is recorded as income, not an expense, because we are the landlord.");
    }
  }

  /* ------------------------------------------- the deposit is an asset */
  if (input.role === "tenant" && input.depositAmount !== null && input.depositAmount > 0) {
    const asset = {
      household_id: input.householdId,
      owner_profile_id: input.ownerProfileId,
      name: `Tenancy deposit — ${label}`,
      asset_class: "cash",
      currency: input.currency,
      current_value: input.depositAmount,
      acquisition_cost: input.depositAmount,
      acquisition_date: input.termStart,
      ownership_pct: 100,
      valuation_method: "cost",
      // Recoverable, but not spendable until the tenancy ends.
      is_liquid: false,
      last_valued_at: new Date().toISOString(),
      notes: input.depositScheme
        ? `Held in ${input.depositScheme}. Recoverable at the end of the tenancy.`
        : "Recoverable at the end of the tenancy.",
    };

    const existingId = input.existing?.linked_asset_id ?? null;
    if (existingId) {
      await supabase.from("assets").update(asset).eq("id", existingId);
      update["linked_asset_id"] = existingId;
    } else {
      const { data } = await supabase.from("assets").insert(asset).select("id").maybeSingle();
      if (data) update["linked_asset_id"] = data.id;
    }
    notes.push("The deposit is on the balance sheet as a recoverable amount.");
  }

  /* ---------------------------------------- the property purchase goal */
  if (input.role === "tenant") {
    const { data: goal } = await supabase
      .from("goals")
      .select("id")
      .eq("household_id", input.householdId)
      .eq("goal_category", "property")
      .not("status", "in", "(achieved,paused)")
      .order("target_date", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (goal) {
      update["linked_goal_id"] = goal.id;
      notes.push("Linked to the property purchase goal.");
    }
  }

  if (Object.keys(update).length) {
    await supabase.from("tenancies").update(update).eq("id", input.tenancyId);
  }

  return notes;
}
