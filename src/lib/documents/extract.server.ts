/**
 * Reading the three kinds of document that carry typed figures.
 *
 * One strict schema per type, on the extraction model, with the same rule the
 * statement reader works under: nothing is invented. A field the document does
 * not state comes back null, and the screens say so rather than filling a gap
 * with something plausible.
 *
 * The text handed to the model has already had National Insurance numbers
 * removed (see `read.server.ts`), and whatever comes back is masked and
 * redacted again before it is written (see `redact.ts`).
 */
import { completeJson } from "../ai/gateway.server";
import type { DocType } from "./types";

/* ------------------------------------------------------------ schema kit */

const str = () => ({ type: ["string", "null"] });
const num = () => ({ type: ["number", "null"] });
const bool = () => ({ type: ["boolean", "null"] });
const enumOf = (values: readonly string[]) => ({
  type: ["string", "null"],
  enum: [...values, null],
});

function object(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

const PRIVACY_RULE = `Never return a National Insurance number, a passport number, a
date of birth, a sort code, a full bank account number or an IBAN. If you see one,
leave it out entirely — there is no field for it and no masked version of it is wanted.
Reference numbers you are asked for are stored masked, so return them as printed and
the application will reduce them.`;

const HONESTY_RULE = `Return only what the document states. Use null for anything it does
not say. Never estimate, never infer a figure from another figure, and never carry a
value over from what a document of this kind usually contains. Dates are ISO
(YYYY-MM-DD). Amounts are plain numbers with no currency symbol, no thousands
separator, and no sign unless the document shows a deduction as negative — deductions
should be returned as positive numbers.

The text may contain "[not stored]" where an identifier was removed before you saw it,
and "[… middle of the document omitted for length …]" where a long document was
shortened. Both are expected.

Give a confidence between 0 and 1 for the extraction as a whole: how much of what
matters you could actually read.`;

/* ------------------------------------------------------------- insurance */

export type InsuranceExtract = {
  insurer: string | null;
  policy_type: string | null;
  policy_number: string | null;
  insured_person: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  premium_amount: number | null;
  currency: string | null;
  premium_frequency: string | null;
  sum_assured: number | null;
  benefit_amount: number | null;
  benefit_frequency: string | null;
  benefit_period_months: number | null;
  deferred_period_weeks: number | null;
  beneficiaries: string | null;
  in_trust: boolean | null;
  exclusions: string | null;
  notes: string | null;
  confidence: number;
};

const INSURANCE_SCHEMA = object({
  insurer: str(),
  policy_type: enumOf([
    "life",
    "income_protection",
    "critical_illness",
    "home",
    "contents",
    "travel",
    "private_medical",
    "other",
  ]),
  policy_number: str(),
  insured_person: str(),
  start_date: str(),
  end_date: str(),
  renewal_date: str(),
  premium_amount: num(),
  currency: str(),
  premium_frequency: enumOf(["monthly", "quarterly", "annual", "one_off"]),
  sum_assured: num(),
  benefit_amount: num(),
  benefit_frequency: enumOf(["monthly", "annual", "lump_sum"]),
  benefit_period_months: num(),
  deferred_period_weeks: num(),
  beneficiaries: str(),
  in_trust: bool(),
  exclusions: str(),
  notes: str(),
  confidence: { type: "number" },
});

const INSURANCE_SYSTEM = `You read insurance policy documents — schedules, cover summaries
and renewal notices — and return the facts they state.

${HONESTY_RULE}

${PRIVACY_RULE}

Notes on particular fields:
- policy_type: pick the single closest match. A policy that pays a lump sum on death is
  "life"; one that pays a monthly income while the insured cannot work is
  "income_protection"; one that pays on diagnosis is "critical_illness".
- sum_assured is the lump sum payable. benefit_amount is a recurring benefit, with
  benefit_frequency saying how often.
- renewal_date is the date the policy next renews or the premium is next reviewed. If the
  document gives only an end date, leave renewal_date null rather than copying it.
- in_trust: true only if the document says the policy is written in trust. Null if it does
  not mention trusts at all — that is not the same as false.
- exclusions: a short summary of notable exclusions or conditions, at most three sentences.
- notes: anything materially important that has no field of its own. Keep it under 300
  characters, or null.`;

/* --------------------------------------------------------------- tenancy */

export type TenancyExtract = {
  role: string | null;
  property_address: string | null;
  landlord_name: string | null;
  agent_name: string | null;
  tenant_names: string | null;
  rent_amount: number | null;
  currency: string | null;
  rent_frequency: string | null;
  deposit_amount: number | null;
  deposit_scheme: string | null;
  reference: string | null;
  term_start: string | null;
  term_end: string | null;
  break_clause_date: string | null;
  break_clause_notes: string | null;
  notice_period_months: number | null;
  rent_review_terms: string | null;
  permitted_occupiers: string | null;
  council_tax_responsibility: string | null;
  utilities_responsibility: string | null;
  repairs_responsibility: string | null;
  notes: string | null;
  confidence: number;
};

const TENANCY_SCHEMA = object({
  role: enumOf(["tenant", "landlord"]),
  property_address: str(),
  landlord_name: str(),
  agent_name: str(),
  tenant_names: str(),
  rent_amount: num(),
  currency: str(),
  rent_frequency: enumOf(["weekly", "fortnightly", "monthly", "quarterly", "annual"]),
  deposit_amount: num(),
  deposit_scheme: str(),
  reference: str(),
  term_start: str(),
  term_end: str(),
  break_clause_date: str(),
  break_clause_notes: str(),
  notice_period_months: num(),
  rent_review_terms: str(),
  permitted_occupiers: str(),
  council_tax_responsibility: str(),
  utilities_responsibility: str(),
  repairs_responsibility: str(),
  notes: str(),
  confidence: { type: "number" },
});

const TENANCY_SYSTEM = `You read tenancy and lease agreements and return the facts they
state.

${HONESTY_RULE}

${PRIVACY_RULE}

Notes on particular fields:
- role: the side the *uploading household* is on. If the named tenant is a private
  individual and the landlord is a company or another individual, the household is almost
  certainly the tenant. If the document is drawn up by the household as the landlord —
  they are named as landlord and the rent is payable to them — return "landlord". If the
  document genuinely does not make the sides clear, return null rather than guessing.
- break_clause_date: the earliest date the break can be exercised, if the document gives
  one. If the break is expressed as "after N months", work the date out from term_start
  only when term_start is stated; otherwise leave it null and describe it in
  break_clause_notes.
- notice_period_months: the notice the tenant must give, in months. Two months is 2. Eight
  weeks is 2. One month is 1.
- council_tax_responsibility, utilities_responsibility, repairs_responsibility: a few words
  naming who is responsible — "tenant", "landlord", "landlord for structure, tenant for
  interior", and so on.
- notes: anything materially important with no field of its own, under 300 characters.`;

/* -------------------------------------------------------------- payslips */

export type PayslipExtract = {
  employer: string | null;
  employee_name: string | null;
  payroll_reference: string | null;
  pay_date: string | null;
  period_start: string | null;
  period_end: string | null;
  pay_frequency: string | null;
  tax_code: string | null;
  currency: string | null;
  gross_pay: number | null;
  net_pay: number | null;
  income_tax: number | null;
  national_insurance: number | null;
  employee_pension: number | null;
  employer_pension: number | null;
  salary_sacrifice: boolean | null;
  student_loan: number | null;
  benefits_in_kind: number | null;
  other_deductions: number | null;
  ytd_gross: number | null;
  ytd_income_tax: number | null;
  ytd_national_insurance: number | null;
  ytd_employee_pension: number | null;
  ytd_employer_pension: number | null;
  ytd_student_loan: number | null;
  ytd_benefits_in_kind: number | null;
  ytd_net_pay: number | null;
  notes: string | null;
  confidence: number;
};

const PAYSLIP_SCHEMA = object({
  employer: str(),
  employee_name: str(),
  payroll_reference: str(),
  pay_date: str(),
  period_start: str(),
  period_end: str(),
  pay_frequency: enumOf([
    "weekly",
    "fortnightly",
    "four_weekly",
    "monthly",
    "quarterly",
    "annual",
  ]),
  tax_code: str(),
  currency: str(),
  gross_pay: num(),
  net_pay: num(),
  income_tax: num(),
  national_insurance: num(),
  employee_pension: num(),
  employer_pension: num(),
  salary_sacrifice: bool(),
  student_loan: num(),
  benefits_in_kind: num(),
  other_deductions: num(),
  ytd_gross: num(),
  ytd_income_tax: num(),
  ytd_national_insurance: num(),
  ytd_employee_pension: num(),
  ytd_employer_pension: num(),
  ytd_student_loan: num(),
  ytd_benefits_in_kind: num(),
  ytd_net_pay: num(),
  notes: str(),
  confidence: { type: "number" },
});

const PAYSLIP_SYSTEM = `You read UK payslips and return every figure printed on them.

${HONESTY_RULE}

${PRIVACY_RULE}

Notes on particular fields:
- pay_date is the date the money is paid, not the period end. If only a period is printed,
  leave pay_date null.
- tax_code exactly as printed, including any W1, M1 or X suffix — "1257L", "BR", "0T W1".
- employee_pension is the employee's own contribution for this period; employer_pension is
  the employer's. If the slip shows a salary-sacrifice arrangement, the sacrificed amount is
  the employee contribution, salary_sacrifice is true, and gross_pay is the post-sacrifice
  figure the slip prints as gross.
- Deductions are positive numbers.
- The year-to-date fields are the cumulative figures printed on the slip. If the slip shows
  a "this employment" and a "previous employment" column, return the total for the tax year.
- notes: anything materially important with no field of its own, under 300 characters. Say
  so here if the slip covers more than one pay period or includes a backdated adjustment.`;

/* ------------------------------------------------------------------ call */

const CONFIG: Partial<
  Record<DocType, { system: string; schema: Record<string, unknown>; name: string }>
> = {
  insurance_policy: {
    system: INSURANCE_SYSTEM,
    schema: INSURANCE_SCHEMA,
    name: "insurance_policy",
  },
  tenancy: { system: TENANCY_SYSTEM, schema: TENANCY_SCHEMA, name: "tenancy_agreement" },
  payslip: { system: PAYSLIP_SYSTEM, schema: PAYSLIP_SCHEMA, name: "payslip" },
};

export type DocumentExtract = InsuranceExtract | TenancyExtract | PayslipExtract;

/** Reads one document of a known type. Throws when the type has no reader. */
export async function extractDocument(
  type: DocType,
  text: string,
  fileName: string | null,
): Promise<DocumentExtract> {
  const config = CONFIG[type];
  if (!config) throw new Error(`Nothing is read from a ${type}.`);

  return completeJson<DocumentExtract>("extraction", {
    system: config.system,
    user: `File name: ${fileName ?? "unknown"}\n\n---\n${text}`,
    schemaName: config.name,
    schema: config.schema,
    maxTokens: 12_000,
  });
}
