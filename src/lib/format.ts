export const CURRENCIES = ["GBP", "USD", "EGP", "JOD", "EUR", "AED", "SAR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number] | string;

export const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  EGP: "E£",
  JOD: "JD",
  AED: "AED",
  SAR: "SAR",
};

export function currencySymbol(code: string) {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/** 2dp under 10k, 0dp above. Prices always 2dp. */
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
  const sign = value < 0 ? "-" : "";
  return `${sign}${currencySymbol(currency)}${formatAmount(Math.abs(value), opts)}`;
}

export function formatCompact(value: number, currency: string) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const compact = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(abs);
  return `${sign}${currencySymbol(currency)}${compact}`;
}

export function formatPercent(value: number, decimals = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function monthsAgoLabel(date: string | null | undefined) {
  if (!date) return "never valued";
  const then = new Date(date).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 1) return "valued today";
  if (days < 31) return `valued ${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `valued ${months} month${months === 1 ? "" : "s"} ago`;
  const years = (days / 365).toFixed(1);
  return `valued ${years} years ago`;
}

export function isStaleValuation(date: string | null | undefined) {
  if (!date) return true;
  return Date.now() - new Date(date).getTime() > 90 * 86_400_000;
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

export const ASSET_CLASSES = [
  "property",
  "private_equity",
  "pension",
  "cash",
  "listed_equity",
  "crypto",
  "vehicle",
  "collectible",
  "other",
] as const;

export const LIABILITY_TYPES = [
  "mortgage",
  "personal_loan",
  "credit_card",
  "student_loan",
  "family_loan",
  "other",
] as const;

export const VALUATION_METHODS = ["market", "professional", "estimate", "cost", "409a"] as const;

export function titleise(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const LIQUID_ACCOUNT_TYPES = ["current", "savings", "isa", "gia", "cash", "crypto"];
export const DEBT_ACCOUNT_TYPES = ["credit_card", "loan", "mortgage"];
