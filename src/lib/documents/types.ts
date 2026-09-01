/**
 * The kinds of document the household holds, and the words used for them.
 *
 * Client-safe: names, labels and enumerations only. No parsing, no keys, no
 * network. Both the upload screen and the reader import from here so the two
 * never drift apart.
 */

export type DocType = "bank_statement" | "insurance_policy" | "tenancy" | "payslip" | "other";

export const DOC_TYPES: DocType[] = [
  "bank_statement",
  "insurance_policy",
  "tenancy",
  "payslip",
  "other",
];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  bank_statement: "Bank statement",
  insurance_policy: "Insurance policy",
  tenancy: "Tenancy agreement",
  payslip: "Payslip",
  other: "Other document",
};

/** One line on what each type is for, shown when the reader has to ask. */
export const DOC_TYPE_BLURB: Record<DocType, string> = {
  bank_statement: "Transactions and balances — imported into an account.",
  insurance_policy: "Cover, premium and renewal date — feeds the protection view.",
  tenancy: "Rent, term and break clause — feeds the forecast and the move timeline.",
  payslip: "Pay, tax code and year-to-date figures — feeds the £100,000 tracker.",
  other: "Filed and kept, with nothing read from it.",
};

export type DocumentStatus =
  | "queued"
  | "extracting"
  | "needs_type"
  | "extracted"
  | "linked"
  | "duplicate"
  | "failed"
  | "cancelled";

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  queued: "Queued",
  extracting: "Reading",
  needs_type: "Confirm the type",
  extracted: "Read",
  linked: "Imported",
  duplicate: "Already on file",
  failed: "Could not be read",
  cancelled: "Cancelled",
};

/** Still moving through the queue. */
export const DOCUMENT_IN_FLIGHT = new Set<string>(["queued", "extracting"]);
/** Somebody has to decide something. */
export const DOCUMENT_NEEDS_YOU = new Set<string>(["needs_type", "failed"]);

/**
 * Everything the drop zone accepts. Wider than the statement importer, because
 * a policy schedule or a payslip is nearly always a PDF and occasionally a
 * scan-free Word export saved as text.
 */
export const DOCUMENT_UPLOAD_ACCEPT =
  ".pdf,.csv,.tsv,.txt,.xml,.camt,.sta,.mt940,.940,.qif,.xls,.xlsx,.xlsm";

/* ------------------------------------------------------------- insurance */

export type InsuranceType =
  | "life"
  | "income_protection"
  | "critical_illness"
  | "home"
  | "contents"
  | "travel"
  | "private_medical"
  | "other";

export const INSURANCE_TYPES: InsuranceType[] = [
  "life",
  "income_protection",
  "critical_illness",
  "home",
  "contents",
  "travel",
  "private_medical",
  "other",
];

export const INSURANCE_TYPE_LABELS: Record<InsuranceType, string> = {
  life: "Life",
  income_protection: "Income protection",
  critical_illness: "Critical illness",
  home: "Home / buildings",
  contents: "Contents",
  travel: "Travel",
  private_medical: "Private medical",
  other: "Other",
};

/** Policies that pay out on death, so they count towards the protection gap. */
export const LIFE_COVER_TYPES = new Set<InsuranceType>(["life"]);

export type PremiumFrequency = "monthly" | "quarterly" | "annual" | "one_off";

export const PREMIUM_FREQUENCY_LABELS: Record<PremiumFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_off: "One-off",
};

export type BenefitFrequency = "monthly" | "annual" | "lump_sum";

export const BENEFIT_FREQUENCY_LABELS: Record<BenefitFrequency, string> = {
  monthly: "a month",
  annual: "a year",
  lump_sum: "lump sum",
};

/* -------------------------------------------------------------- tenancy */

export type TenancyRole = "tenant" | "landlord";

export const TENANCY_ROLE_LABELS: Record<TenancyRole, string> = {
  tenant: "We rent this",
  landlord: "We let this out",
};

export type RentFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual";

export const RENT_FREQUENCY_LABELS: Record<RentFrequency, string> = {
  weekly: "a week",
  fortnightly: "a fortnight",
  monthly: "a month",
  quarterly: "a quarter",
  annual: "a year",
};

export type TenancyStatus = "upcoming" | "current" | "ended";

export const TENANCY_STATUS_LABELS: Record<TenancyStatus, string> = {
  upcoming: "Starts later",
  current: "Current",
  ended: "Ended",
};

/* -------------------------------------------------------------- payslips */

export type PayFrequency =
  | "weekly"
  | "fortnightly"
  | "four_weekly"
  | "monthly"
  | "quarterly"
  | "annual";

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  four_weekly: "Every four weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

/** How many pay dates a year each frequency implies. */
export const PAY_PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  four_weekly: 13,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

export type Reconciliation = "unchecked" | "matched" | "mismatch" | "no_credit_found";

export const RECONCILIATION_LABELS: Record<Reconciliation, string> = {
  unchecked: "Not checked",
  matched: "Matches the bank",
  mismatch: "Does not match the bank",
  no_credit_found: "No matching credit found",
};

/* ------------------------------------------------------------ income tax */

export type IncomeType =
  | "salary"
  | "bonus"
  | "dividend"
  | "rental"
  | "business"
  | "consulting"
  | "distribution"
  | "other";

export const INCOME_TYPES: IncomeType[] = [
  "salary",
  "bonus",
  "dividend",
  "rental",
  "business",
  "consulting",
  "distribution",
  "other",
];

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  salary: "Salary",
  bonus: "Bonus",
  dividend: "Dividends",
  rental: "Rental income",
  business: "Business income",
  consulting: "Consulting",
  distribution: "Distribution from a shareholding",
  other: "Other",
};
