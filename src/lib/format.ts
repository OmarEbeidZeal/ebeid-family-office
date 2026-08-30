export const CURRENCIES = ["GBP", "USD", "EGP", "JOD", "EUR", "AED", "SAR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number] | string;

export const SOFT_CURRENCIES = ["EGP", "JOD"];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  EGP: "E£",
  JOD: "JD ",
  AED: "AED ",
  SAR: "SAR ",
};

export function currencySymbol(code: string) {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/** House rule: 2dp under 10k, 0dp above. Per-share prices always pass decimals: 2. */
export function formatAmount(value: number, opts?: { decimals?: number | undefined }) {
  const abs = Math.abs(value);
  const decimals = opts?.decimals ?? (abs < 10000 ? 2 : 0);
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatMoney(
  value: number,
  currency: string,
  opts?: { decimals?: number | undefined },
) {
  const sign = value < 0 ? "−" : "";
  return `${sign}${currencySymbol(currency)}${formatAmount(Math.abs(value), opts)}`;
}

export function formatCompact(value: number, currency: string) {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const compact = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: abs >= 1000 ? 1 : 0,
  }).format(abs);
  return `${sign}${currencySymbol(currency)}${compact}`;
}

export function formatSignedPercent(value: number, decimals = 1) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(decimals)}%`;
}

export function formatPercent(value: number, decimals = 1) {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(value: string | null | undefined, style: "short" | "medium" = "medium") {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: style === "short" ? "short" : "long",
    year: "numeric",
  });
}

export function daysSince(date: string | null | undefined) {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function relativeAge(date: string | null | undefined, verb = "updated") {
  const days = daysSince(date);
  if (days === null) return `never ${verb}`;
  if (days <= 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  if (days < 31) return `${verb} ${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${verb} ${months} month${months === 1 ? "" : "s"} ago`;
  const years = (days / 365).toFixed(1);
  return `${verb} ${years} years ago`;
}

/** Minute- and hour-granular age, for figures that move intraday such as FX. */
export function relativeTime(date: string | null | undefined) {
  if (!date) return "never";
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return "never";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return relativeAge(date, "").trim();
}

/** Account balances go amber after a month without an update. */
export function balanceAgeTone(date: string | null | undefined): "ok" | "warn" {
  const days = daysSince(date);
  if (days === null) return "warn";
  return days > 30 ? "warn" : "ok";
}

/** Asset valuations go amber over 90 days, red over 180. */
export function valuationAgeTone(date: string | null | undefined): "ok" | "warn" | "stale" {
  const days = daysSince(date);
  if (days === null) return "stale";
  if (days > 180) return "stale";
  if (days > 90) return "warn";
  return "ok";
}

export function remainingTerm(endDate: string | null | undefined) {
  if (!endDate) return null;
  const end = new Date(endDate).getTime();
  if (Number.isNaN(end)) return null;
  const months = Math.round((end - Date.now()) / (86_400_000 * 30.44));
  if (months <= 0) return "term ended";
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} left`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years}y ${rest}m left` : `${years} years left`;
}

export const COUNTRIES = [
  { code: "GB", label: "United Kingdom" },
  { code: "EG", label: "Egypt" },
  { code: "JO", label: "Jordan" },
  { code: "US", label: "United States" },
  { code: "AE", label: "UAE" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "OTHER", label: "Other" },
];

export function countryLabel(code: string | null | undefined) {
  return COUNTRIES.find((c) => c.code === code)?.label ?? code ?? "Unspecified";
}

export const ACCOUNT_TYPES = [
  "current",
  "savings",
  "isa",
  "sipp",
  "gia",
  "crypto",
  "cash",
  "credit_card",
  "loan",
  "mortgage",
] as const;

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  current: "Current",
  savings: "Savings",
  isa: "ISA",
  sipp: "SIPP",
  gia: "GIA",
  crypto: "Crypto",
  cash: "Cash",
  credit_card: "Credit card",
  loan: "Loan",
  mortgage: "Mortgage",
};

export const ASSET_CLASSES = [
  "property",
  "private_equity",
  "pension",
  "listed_equity",
  "crypto",
  "cash",
  "vehicle",
  "collectible",
  "other",
] as const;

export const ASSET_CLASS_LABELS: Record<string, string> = {
  property: "Property",
  private_equity: "Private company",
  pension: "Pension",
  listed_equity: "Listed equity",
  crypto: "Crypto",
  cash: "Cash",
  vehicle: "Vehicle",
  collectible: "Collectible",
  other: "Other",
};

export const LIABILITY_TYPES = [
  "mortgage",
  "personal_loan",
  "credit_card",
  "student_loan",
  "family_loan",
  "other",
] as const;

export const LIABILITY_TYPE_LABELS: Record<string, string> = {
  mortgage: "Mortgage",
  personal_loan: "Personal loan",
  credit_card: "Credit card",
  student_loan: "Student loan",
  family_loan: "Family loan",
  other: "Other",
};

/** Constrained in the database to these five values. */
export const VALUATION_METHODS = ["market", "professional", "estimate", "cost", "409a"] as const;

export const VALUATION_METHOD_LABELS: Record<string, string> = {
  market: "Market price",
  professional: "Professional valuation",
  estimate: "Internal estimate",
  cost: "Purchase cost",
  "409a": "409A valuation",
};

/** Richer basis for a private shareholding, stored in assets.metadata. */
export const SHAREHOLDING_BASES = [
  { value: "409a", label: "409A valuation", method: "409a" },
  { value: "funding_round", label: "Last funding round", method: "market" },
  { value: "internal_estimate", label: "Internal estimate", method: "estimate" },
] as const;

export const VESTING_STATUSES = [
  { value: "fully_vested", label: "Fully vested" },
  { value: "partially_vested", label: "Partially vested" },
  { value: "unvested", label: "Not yet vesting" },
  { value: "not_applicable", label: "Not applicable (founder shares)" },
] as const;

export const INCOME_TYPES = ["salary", "bonus", "dividend", "rental", "business", "other"] as const;

export const INCOME_TYPE_LABELS: Record<string, string> = {
  salary: "Salary",
  bonus: "Bonus",
  dividend: "Dividend",
  rental: "Rental",
  business: "Business",
  other: "Other",
};

export const FREQUENCIES = ["monthly", "quarterly", "annual", "one_off"] as const;

export const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_off: "One-off",
};

export const GOAL_CATEGORIES = [
  "property",
  "home_improvement",
  "education",
  "business",
  "travel",
  "family",
  "emergency_fund",
  "retirement",
  "other",
] as const;

export const GOAL_CATEGORY_LABELS: Record<string, string> = {
  property: "Property",
  home_improvement: "Home improvement",
  education: "Education",
  business: "Business",
  travel: "Travel",
  family: "Family",
  emergency_fund: "Emergency fund",
  retirement: "Retirement",
  other: "Other",
};

export const GOAL_PRIORITIES = [
  { value: "must_have", label: "Must have" },
  { value: "want", label: "Want" },
  { value: "nice_to_have", label: "Nice to have" },
] as const;

export const GOAL_STATUSES = [
  { value: "planning", label: "Planning" },
  { value: "saving", label: "Saving" },
  { value: "in_progress", label: "In progress" },
  { value: "achieved", label: "Achieved" },
  { value: "paused", label: "Paused" },
] as const;

export const EXPENSE_CONFIDENCE = [
  { value: "committed", label: "Committed" },
  { value: "likely", label: "Likely" },
  { value: "possible", label: "Possible" },
] as const;

export function titleise(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function accountTypeLabel(type: string) {
  return ACCOUNT_TYPE_LABELS[type] ?? titleise(type);
}

export function assetClassLabel(assetClass: string) {
  return ASSET_CLASS_LABELS[assetClass] ?? titleise(assetClass);
}

export function liabilityTypeLabel(type: string) {
  return LIABILITY_TYPE_LABELS[type] ?? titleise(type);
}

export function valuationMethodLabel(method: string | null | undefined) {
  if (!method) return "No method recorded";
  return VALUATION_METHOD_LABELS[method] ?? titleise(method);
}

/** Cash-like accounts that can genuinely be spent this week. */
export const LIQUID_ACCOUNT_TYPES = ["current", "savings", "isa", "gia", "cash", "crypto"];
/**
 * Spendable cash the emergency reserve is measured from. ISA, GIA and crypto
 * balances are investments — liquid, but never part of the reserve, because
 * policy rule 4 counts months of essential spending held in cash.
 */
export const RESERVE_ACCOUNT_TYPES = ["current", "savings", "cash"];

/** Accounts that hold a balance owed rather than held. */
export const DEBT_ACCOUNT_TYPES = ["credit_card", "loan", "mortgage"];
/** Locked until retirement age — never counted as spendable. */
export const LOCKED_ACCOUNT_TYPES = ["sipp"];

export function monthlyEquivalent(amount: number, frequency: string) {
  switch (frequency) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "annual":
      return amount / 12;
    default:
      return 0;
  }
}
