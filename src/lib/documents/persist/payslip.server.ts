/**
 * A read payslip becomes a payslip record — then two things nothing else does.
 *
 * It reconciles the net pay against the credit that actually landed in the
 * bank, which catches payroll errors nobody would otherwise notice, and it
 * updates the income stream from what is being paid rather than what was typed
 * in at onboarding.
 */
import { taxYearOf } from "../analysis";
import type { PayslipExtract } from "../extract.server";
import { loadPeople, matchPerson, type Person } from "../people.server";
import { maskReference } from "../redact";
import { PAY_PERIODS_PER_YEAR, type PayFrequency } from "../types";
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

function money(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(Math.abs(value) * 100) / 100;
}

function frequencyOf(raw: string | null): PayFrequency | null {
  const allowed: PayFrequency[] = [
    "weekly",
    "fortnightly",
    "four_weekly",
    "monthly",
    "quarterly",
    "annual",
  ];
  return allowed.includes(raw as PayFrequency) ? (raw as PayFrequency) : null;
}

export class PayslipUnreadable extends Error {}

export async function persistPayslip(
  supabase: Client,
  input: {
    householdId: string;
    documentId: string;
    ownerProfileId?: string | null;
    people?: Person[];
  },
  extract: PayslipExtract,
): Promise<PersistResult & { payDate: string; profileId: string | null }> {
  const people = input.people ?? (await loadPeople(supabase, input.householdId));
  const matched = matchPerson(extract.employee_name, people);
  const profileId = matched ?? input.ownerProfileId ?? null;

  const payDate = isoDate(extract.pay_date) ?? isoDate(extract.period_end);
  if (!payDate) {
    throw new PayslipUnreadable(
      "This payslip shows no pay date, so it cannot be placed in a tax year. Check the file is the full slip rather than a summary page.",
    );
  }

  const currency = currencyOf(extract.currency);
  const employer = extract.employer?.trim() || null;
  const frequency = frequencyOf(extract.pay_frequency);

  const needsReview =
    !employer ||
    extract.gross_pay === null ||
    extract.net_pay === null ||
    profileId === null ||
    (extract.confidence ?? 0) < 0.5;

  const row = {
    household_id: input.householdId,
    document_id: input.documentId,
    profile_id: profileId,
    employer,
    employee_name: extract.employee_name?.trim() || null,
    payroll_ref_last4: maskReference(extract.payroll_reference),
    pay_date: payDate,
    period_start: isoDate(extract.period_start),
    period_end: isoDate(extract.period_end),
    pay_frequency: frequency,
    tax_year: taxYearOf(payDate),
    tax_code: extract.tax_code?.trim().toUpperCase() || null,
    currency,
    gross_pay: money(extract.gross_pay),
    net_pay: money(extract.net_pay),
    income_tax: money(extract.income_tax),
    national_insurance: money(extract.national_insurance),
    employee_pension: money(extract.employee_pension),
    employer_pension: money(extract.employer_pension),
    salary_sacrifice: extract.salary_sacrifice === true,
    student_loan: money(extract.student_loan),
    benefits_in_kind: money(extract.benefits_in_kind),
    other_deductions: money(extract.other_deductions),
    ytd_gross: money(extract.ytd_gross),
    ytd_income_tax: money(extract.ytd_income_tax),
    ytd_national_insurance: money(extract.ytd_national_insurance),
    ytd_employee_pension: money(extract.ytd_employee_pension),
    ytd_employer_pension: money(extract.ytd_employer_pension),
    ytd_student_loan: money(extract.ytd_student_loan),
    ytd_benefits_in_kind: money(extract.ytd_benefits_in_kind),
    ytd_net_pay: money(extract.ytd_net_pay),
    notes: extract.notes?.trim() || null,
    source: "document",
    confidence: extract.confidence ?? null,
    needs_review: needsReview,
  };

  /* --------------------------------------------------------- reconcile */
  const reconciliation = await reconcile(supabase, {
    householdId: input.householdId,
    payDate,
    netPay: row.net_pay,
    currency,
    employer,
  });

  /* ------------------------------------------------------------ upsert */
  let query = supabase
    .from("payslips")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("pay_date", payDate)
    .limit(1);
  query = employer ? query.ilike("employer", employer) : query.is("employer", null);
  query = profileId ? query.eq("profile_id", profileId) : query.is("profile_id", null);
  const { data: existing } = await query.maybeSingle();

  let payslipId: string;
  if (existing) {
    const { error } = await supabase
      .from("payslips")
      .update({ ...row, ...reconciliation })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    payslipId = existing.id as string;
  } else {
    const { data, error } = await supabase
      .from("payslips")
      .insert({ ...row, ...reconciliation })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    payslipId = data.id as string;
  }

  /* ------------------------------------------------------ income stream */
  const streamNote = await syncIncomeStream(supabase, {
    householdId: input.householdId,
    profileId,
    employer,
    currency,
    frequency,
    gross: row.gross_pay,
    net: row.net_pay,
    payDate,
  });

  const parts: string[] = [
    `Filed a payslip dated ${payDate}${employer ? ` from ${employer}` : ""}.`,
  ];
  if (reconciliation.reconciliation === "matched") {
    parts.push("The net pay matches the credit in the bank.");
  } else if (reconciliation.reconciliation === "mismatch") {
    parts.push(
      `The net pay does not match the credit in the bank — a difference of ${Math.abs(reconciliation.reconciliation_delta ?? 0).toFixed(2)}.`,
    );
  }
  if (streamNote) parts.push(streamNote);

  return {
    id: payslipId,
    needsReview,
    summary: parts.join(" "),
    payDate,
    profileId,
  };
}

/* ------------------------------------------------------------ reconciling */

type Reconciled = {
  matched_transaction_id: string | null;
  reconciliation: "unchecked" | "matched" | "mismatch" | "no_credit_found";
  reconciliation_delta: number | null;
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function employerTokens(employer: string | null): string[] {
  if (!employer) return [];
  return employer
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|uk|group|holdings|services)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

/**
 * Does the money on the slip match the money in the bank?
 *
 * Nothing else in the app can answer that, and a payroll error of a few hundred
 * pounds is invisible to a household that only ever sees the credit.
 */
async function reconcile(
  supabase: Client,
  input: {
    householdId: string;
    payDate: string;
    netPay: number | null;
    currency: string;
    employer: string | null;
  },
): Promise<Reconciled> {
  if (input.netPay === null || input.netPay <= 0) {
    return { matched_transaction_id: null, reconciliation: "unchecked", reconciliation_delta: null };
  }

  const { data } = await supabase
    .from("transactions")
    .select("id, amount, description, merchant, booked_date, currency")
    .eq("household_id", input.householdId)
    .eq("direction", "credit")
    .eq("currency", input.currency)
    .gte("booked_date", addDays(input.payDate, -4))
    .lte("booked_date", addDays(input.payDate, 6))
    .limit(60);

  const candidates = (data ?? []) as Array<{
    id: string;
    amount: number;
    description: string | null;
    merchant: string | null;
  }>;
  if (!candidates.length) {
    return {
      matched_transaction_id: null,
      reconciliation: "no_credit_found",
      reconciliation_delta: null,
    };
  }

  const tolerance = Math.max(1, input.netPay * 0.005);
  const scored = candidates
    .map((row) => ({ row, delta: Number(row.amount) - input.netPay! }))
    .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

  const closest = scored[0]!;
  if (Math.abs(closest.delta) <= tolerance) {
    return {
      matched_transaction_id: closest.row.id,
      reconciliation: "matched",
      reconciliation_delta: Math.round(closest.delta * 100) / 100,
    };
  }

  // No amount matches. A credit that names the employer in the same window is
  // still almost certainly the salary — and the difference is the point.
  const tokens = employerTokens(input.employer);
  const named = tokens.length
    ? scored.find((entry) => {
        const text = `${entry.row.description ?? ""} ${entry.row.merchant ?? ""}`.toLowerCase();
        return tokens.some((token) => text.includes(token));
      })
    : undefined;

  if (named) {
    return {
      matched_transaction_id: named.row.id,
      reconciliation: "mismatch",
      reconciliation_delta: Math.round(named.delta * 100) / 100,
    };
  }

  return {
    matched_transaction_id: null,
    reconciliation: "no_credit_found",
    reconciliation_delta: null,
  };
}

/* -------------------------------------------------------- income streams */

/** The forecast holds four frequencies; the odd pay cycles become monthly. */
function asIncomeFrequency(
  amount: number,
  frequency: PayFrequency | null,
): { amount: number; frequency: "monthly" | "quarterly" | "annual" } {
  if (frequency === "quarterly") return { amount, frequency: "quarterly" };
  if (frequency === "annual") return { amount, frequency: "annual" };
  const perYear = PAY_PERIODS_PER_YEAR[(frequency ?? "monthly") as PayFrequency] ?? 12;
  return { amount: (amount * perYear) / 12, frequency: "monthly" };
}

/**
 * Keeps the income stream honest.
 *
 * What someone typed at onboarding was true then. What the payslip says is
 * true now, so the observed figure wins — and the stream records that it came
 * from a payslip so nobody wonders why their number changed.
 */
async function syncIncomeStream(
  supabase: Client,
  input: {
    householdId: string;
    profileId: string | null;
    employer: string | null;
    currency: string;
    frequency: PayFrequency | null;
    gross: number | null;
    net: number | null;
    payDate: string;
  },
): Promise<string | null> {
  if (!input.profileId || input.gross === null || input.gross <= 0) return null;

  // Only the most recent payslip drives the stream — a back-filled slip from
  // eighteen months ago must not overwrite this month's salary.
  const { data: newer } = await supabase
    .from("payslips")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("profile_id", input.profileId)
    .gt("pay_date", input.payDate)
    .limit(1)
    .maybeSingle();
  if (newer) return null;

  const label = `${input.employer ?? "Employer"} salary`;
  const gross = asIncomeFrequency(input.gross, input.frequency);
  const net = input.net === null ? null : asIncomeFrequency(input.net, input.frequency);

  const payload = {
    household_id: input.householdId,
    owner_profile_id: input.profileId,
    label,
    income_type: "salary",
    gross_amount: Math.round(gross.amount * 100) / 100,
    net_amount: net === null ? null : Math.round(net.amount * 100) / 100,
    currency: input.currency,
    frequency: gross.frequency,
    annual_growth_rate: 0,
    source: "payslip",
    country: "GB",
    taxed_at_source: true,
    uk_self_assessment: false,
    last_observed_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("income_streams")
    .select("id, gross_amount, source")
    .eq("household_id", input.householdId)
    .eq("owner_profile_id", input.profileId)
    .eq("income_type", "salary")
    .order("source", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const before = Number(existing.gross_amount ?? 0);
    await supabase.from("income_streams").update(payload).eq("id", existing.id);
    const changed = Math.abs(before - payload.gross_amount) > 1;
    return changed
      ? `The salary on file moved from ${Math.round(before).toLocaleString("en-GB")} to ${Math.round(payload.gross_amount).toLocaleString("en-GB")} ${input.currency} ${gross.frequency === "monthly" ? "a month" : gross.frequency === "quarterly" ? "a quarter" : "a year"}.`
      : null;
  }

  await supabase.from("income_streams").insert(payload);
  return "Added the salary to the income streams from what the payslip shows.";
}
