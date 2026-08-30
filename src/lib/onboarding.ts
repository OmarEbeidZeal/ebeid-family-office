/** Shared onboarding constants, kept free of component imports. */

export const ONBOARDING_DEFERRED_KEY = "efo.onboarding.deferred";

export const ONBOARDING_STEPS = [
  {
    key: "names",
    title: "Who you are",
    blurb: "Your name, and what to call your partner.",
  },
  {
    key: "accounts",
    title: "Accounts",
    blurb: "Current, savings, ISA, SIPP, GIA and crypto — in any currency, in any country.",
  },
  {
    key: "assets",
    title: "Assets",
    blurb: "Property, pensions, and any private company shareholding.",
  },
  {
    key: "liabilities",
    title: "Liabilities",
    blurb: "Mortgages, loans, cards — and the rent, if you pay it.",
  },
  {
    key: "income",
    title: "Income",
    blurb: "Salary, dividends, rent received and business income, for each of you.",
  },
  {
    key: "goals",
    title: "Goals",
    blurb: "What all of this is actually for.",
  },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

/** True when the household explicitly parked setup on this device. */
export function isOnboardingDeferred() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_DEFERRED_KEY) === "1";
}

export function deferOnboarding() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_DEFERRED_KEY, "1");
}

export function clearOnboardingDeferral() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ONBOARDING_DEFERRED_KEY);
}
