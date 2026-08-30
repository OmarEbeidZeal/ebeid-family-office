/**
 * The household's written investment policy.
 *
 * These twelve rules are the constitution the portfolio page, the briefing and
 * the advisor all answer to. They are encoded once, here, as pure functions:
 * the same evaluation runs in the browser to colour the concentration panel and
 * on the server to constrain what the advisor is allowed to endorse.
 *
 * Nothing in this file fetches, estimates or invents. Where an input is
 * missing, the finding comes back `unknown` and says what is missing.
 */

export const POLICY_VERSION = "April 2026";

export type Sleeve = "core" | "bond" | "thematic" | "satellite" | "crypto";

export const SLEEVES: {
  value: Sleeve;
  label: string;
  short: string;
  targetPct: number | null;
  capPct: number | null;
  note: string;
}[] = [
  {
    value: "core",
    label: "Core equity",
    short: "Core",
    targetPct: 60,
    capPct: null,
    note: "Broad, diversified, low-cost index exposure. The engine of the portfolio.",
  },
  {
    value: "bond",
    label: "Bonds",
    short: "Bonds",
    targetPct: 15,
    capPct: null,
    note: "Duration and ballast. Also where near-dated goal money waits once it is out of cash.",
  },
  {
    value: "thematic",
    label: "Thematic",
    short: "Thematic",
    targetPct: 15,
    capPct: null,
    note: "Deliberate long-horizon tilts held through funds rather than single names.",
  },
  {
    value: "satellite",
    label: "Satellite / speculative",
    short: "Satellite",
    targetPct: 10,
    capPct: 10,
    note: "High-volatility single names. Capped, sized to survive a total loss.",
  },
  {
    value: "crypto",
    label: "Crypto",
    short: "Crypto",
    targetPct: null,
    capPct: 5,
    note: "Counts inside the satellite sleeve and is capped at 5% on its own.",
  },
];

export const SLEEVE_LABELS: Record<string, string> = Object.fromEntries(
  SLEEVES.map((sleeve) => [sleeve.value, sleeve.label]),
);

/** Satellite and crypto together form the speculative sleeve. */
export const SPECULATIVE_SLEEVES: Sleeve[] = ["satellite", "crypto"];

export const POLICY_LIMITS = {
  reserveMonths: 12,
  reserveWatchMonths: 9,
  techSingleNameCapPct: 25,
  speculativeSleeveCapPct: 10,
  cryptoCapPct: 5,
  singleSpeculativeCapPct: 3,
  singleSpeculativeTrimPct: 4,
  softCurrencyCapPct: 30,
  driftPct: 5,
  maxGoalDelayMonths: 3,
  highRateDebtPct: 6,
  isaAllowance: 20_000,
  jisaAllowance: 9_000,
  lisaAllowance: 4_000,
  pensionAllowance: 60_000,
} as const;

export type PolicyRule = { n: number; title: string; text: string };

export const POLICY_RULES: PolicyRule[] = [
  {
    n: 1,
    title: "The private stake sits outside the limits",
    text: "The Zeal shareholding is excluded from investable assets. Every percentage limit below applies to liquid investable assets only.",
  },
  {
    n: 2,
    title: "No doubling the day job",
    text: "No direct positions in payments, card acquiring, merchant services or loyalty companies — that is the same risk as the founder's stake and income. Broad index funds are exempt.",
  },
  {
    n: 3,
    title: "Single-name technology ≤ 25%",
    text: "Direct single-name technology exposure is capped at 25% of the liquid equity portfolio.",
  },
  {
    n: 4,
    title: "Twelve months of reserve, in GBP cash",
    text: "Liquidity reserve target of 12 months of essential spending, held in GBP cash. Nothing speculative is funded while the reserve is short.",
  },
  {
    n: 5,
    title: "Capital priority ladder",
    text: "Employer pension match → liquidity reserve → debt above 6% → ISA allowances (£20,000 each) → pension to the £60,000 annual allowance → near-dated goals → JISA → general investment account.",
  },
  {
    n: 6,
    title: "Target allocation",
    text: "Liquid investable assets target 60% core equity, 15% bonds, 15% thematic, 10% satellite/speculative. Crypto counts inside the satellite sleeve and is capped at 5%.",
  },
  {
    n: 7,
    title: "Speculative sleeve ≤ 10%",
    text: "Total speculative sleeve ≤ 10% of liquid investable assets, at cost and at market. No single speculative name above 3%; trim back to 3% when it exceeds 4%.",
  },
  {
    n: 8,
    title: "The goal test",
    text: "A speculative position is only permitted if its total loss would not delay a funded goal by more than three months.",
  },
  {
    n: 9,
    title: "Written thesis, written falsification",
    text: "Every speculative position requires a written thesis with an explicit falsification condition.",
  },
  {
    n: 10,
    title: "Soft currency ≤ 30%",
    text: "Soft-currency (EGP, JOD) assets stay at or below 30% of household net worth.",
  },
  {
    n: 11,
    title: "Goal horizon ladder",
    text: "Under 2 years cash only; 2–5 years up to 40% equity; over 5 years portfolio allocation.",
  },
  {
    n: 12,
    title: "Rebalance discipline",
    text: "Rebalance annually in April, or whenever a sleeve drifts 5 percentage points from target.",
  },
];

export type PolicyStatus = "ok" | "watch" | "breach" | "unknown" | "not_applicable";

export type PolicyFinding = {
  rule: number;
  id: string;
  label: string;
  status: PolicyStatus;
  /** One line of plain English carrying the actual numbers. */
  headline: string;
  value: number | null;
  limit: number | null;
  unit: "pct" | "months" | "currency" | "none";
};

export type PolicyPosition = {
  id: string;
  ticker: string;
  name: string | null;
  sleeve: Sleeve;
  securityType: string;
  /** Market value in base currency. Null when there is no price. */
  valueBase: number | null;
  costBase: number;
  /** Share of liquid investable assets. Null when unpriced. */
  weightPct: number | null;
  industry: string | null;
  country: string | null;
  hasThesis: boolean;
  priced: boolean;
};

export type PolicyGoal = {
  id: string;
  title: string;
  targetBase: number;
  fundedBase: number;
  targetDate: string | null;
  monthsAway: number | null;
  priority: string;
  status: string;
};

export type PolicyAllowance = {
  person: string;
  /** False when nothing has been recorded for this tax year — an unknown, not a zero. */
  recorded: boolean;
  isaRemaining: number;
  pensionRemaining: number;
  employerMatchSecured: boolean;
};

export type PolicyInput = {
  base: string;
  netWorth: number;
  /** Liquid investable assets — the denominator for every percentage limit. */
  investableTotal: number;
  privateStakeValue: number;
  /** GBP cash only: the reserve pool rule 4 measures. */
  gbpCash: number;
  essentialMonthly: number | null;
  essentialSource: "observed" | "planned" | "none";
  /** Monthly surplus available to rebuild a loss, used by the rule 8 arithmetic. */
  monthlySurplus: number | null;
  sleeveValues: Record<Sleeve, number>;
  /** Stocks plus equity funds — the "liquid equity portfolio" of rule 3. */
  equityPoolBase: number;
  positions: PolicyPosition[];
  unpricedCount: number;
  softCurrencyValue: number;
  highRateDebts: { name: string; ratePct: number; balanceBase: number }[];
  goals: PolicyGoal[];
  allowances: PolicyAllowance[];
  daysToTaxYearEnd: number;
  now?: string;
};

const RESTRICTED_KEYWORDS = [
  "payment",
  "payments",
  "acquir",
  "merchant service",
  "merchant acquir",
  "loyalty",
  "point of sale",
  "card network",
  "card issuer",
  "money transfer",
  "remittance",
];

const TECH_KEYWORDS = [
  "technolog",
  "software",
  "semiconductor",
  "internet",
  "it services",
  "hardware",
  "electronic",
  "computer",
  "cloud",
  "data centre",
  "data center",
  "artificial intelligence",
];

/** Broad funds are exempt from the sector rule; single names are not. */
export function isSingleName(securityType: string) {
  return securityType === "stock" || securityType === "crypto";
}

function matches(haystack: string | null | undefined, needles: string[]) {
  if (!haystack) return false;
  const value = haystack.toLowerCase();
  return needles.some((needle) => value.includes(needle));
}

export function isRestrictedSector(position: {
  securityType: string;
  industry: string | null;
  name: string | null;
  ticker: string;
}): boolean | null {
  if (!isSingleName(position.securityType)) return false;
  if (
    matches(position.industry, RESTRICTED_KEYWORDS) ||
    matches(position.name, RESTRICTED_KEYWORDS)
  )
    return true;
  // No industry classification yet — the app says so rather than assuming.
  return position.industry ? false : null;
}

export function isTechnology(position: {
  securityType: string;
  industry: string | null;
  name: string | null;
}): boolean | null {
  if (!isSingleName(position.securityType)) return false;
  if (matches(position.industry, TECH_KEYWORDS)) return true;
  return position.industry ? false : null;
}

export function isSpeculative(sleeve: Sleeve) {
  return SPECULATIVE_SLEEVES.includes(sleeve);
}

export function capStatus(
  value: number | null,
  cap: number,
  options?: { approachAt?: number },
): PolicyStatus {
  if (value === null || !Number.isFinite(value)) return "unknown";
  const approach = options?.approachAt ?? cap * 0.8;
  if (value > cap + 1e-9) return "breach";
  if (value >= approach) return "watch";
  return "ok";
}

const pct = (value: number | null, decimals = 1) =>
  value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(decimals)}%`;

const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

/** UK tax year: 6 April to 5 April. */
export function currentTaxYear(now = new Date()) {
  const year = now.getUTCFullYear();
  const startYear = now.getTime() < Date.UTC(year, 3, 6) ? year - 1 : year;
  const start = new Date(Date.UTC(startYear, 3, 6));
  const end = new Date(Date.UTC(startYear + 1, 3, 5, 23, 59, 59));
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
  return {
    label: `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    daysRemaining,
  };
}

export function monthsBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (86_400_000 * 30.44);
}

/**
 * Rule 8 arithmetic, shown rather than asserted: how long the household would
 * spend re-earning a total loss at its current surplus.
 */
export function goalDelayMonths(lossBase: number, monthlySurplus: number | null) {
  if (!monthlySurplus || monthlySurplus <= 0) return null;
  return lossBase / monthlySurplus;
}

export function evaluatePolicy(input: PolicyInput): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const {
    investableTotal,
    positions,
    sleeveValues,
    equityPoolBase,
    netWorth,
    gbpCash,
    essentialMonthly,
  } = input;

  const pricedPositions = positions.filter((p) => p.priced && p.valueBase !== null);
  const speculativePositions = positions.filter((p) => isSpeculative(p.sleeve));

  // Rule 1 — the private stake is outside every limit below.
  findings.push({
    rule: 1,
    id: "private-stake-excluded",
    label: "Private stake excluded",
    status: "ok",
    headline:
      input.privateStakeValue > 0
        ? `${money(input.privateStakeValue, input.base)} of Zeal shares sit outside investable assets; limits are measured against ${money(investableTotal, input.base)} of liquid investable assets.`
        : `Limits are measured against ${money(investableTotal, input.base)} of liquid investable assets.`,
    value: input.privateStakeValue,
    limit: null,
    unit: "currency",
  });

  // Rule 2 — no doubling the day job.
  const restricted = positions.filter((p) => isRestrictedSector(p) === true);
  const unclassified = positions.filter((p) => isRestrictedSector(p) === null);
  findings.push({
    rule: 2,
    id: "restricted-sector",
    label: "Payments sector exclusion",
    status: restricted.length ? "breach" : unclassified.length ? "unknown" : "ok",
    headline: restricted.length
      ? `${restricted.map((p) => p.ticker).join(", ")} sits in the excluded payments complex — the same risk as the Zeal stake and the salary behind it.`
      : unclassified.length
        ? `${unclassified.length} single name${unclassified.length === 1 ? "" : "s"} cannot be classified until market data returns an industry.`
        : "No direct exposure to payments, acquiring, merchant services or loyalty.",
    value: restricted.length,
    limit: 0,
    unit: "none",
  });

  // Rule 3 — single-name technology against the liquid equity portfolio.
  const techValue = pricedPositions
    .filter((p) => isTechnology(p) === true)
    .reduce((sum, p) => sum + (p.valueBase ?? 0), 0);
  const techPct = share(techValue, equityPoolBase);
  findings.push({
    rule: 3,
    id: "tech-concentration",
    label: "Single-name technology",
    status:
      equityPoolBase > 0
        ? capStatus(techPct, POLICY_LIMITS.techSingleNameCapPct)
        : "not_applicable",
    headline:
      equityPoolBase > 0
        ? `Single-name technology is ${pct(techPct)} of the ${money(equityPoolBase, input.base)} liquid equity portfolio against a ${POLICY_LIMITS.techSingleNameCapPct}% cap.`
        : "No liquid equity portfolio recorded yet, so the technology cap has nothing to measure.",
    value: techPct,
    limit: POLICY_LIMITS.techSingleNameCapPct,
    unit: "pct",
  });

  // Rule 4 — the reserve.
  const reserveMonths =
    essentialMonthly && essentialMonthly > 0 ? gbpCash / essentialMonthly : null;
  const reserveStatus: PolicyStatus =
    reserveMonths === null
      ? "unknown"
      : reserveMonths >= POLICY_LIMITS.reserveMonths
        ? "ok"
        : reserveMonths >= POLICY_LIMITS.reserveWatchMonths
          ? "watch"
          : "breach";
  findings.push({
    rule: 4,
    id: "liquidity-reserve",
    label: "Liquidity reserve",
    status: reserveStatus,
    headline:
      reserveMonths === null
        ? "Essential monthly spending is not known yet, so the twelve-month reserve cannot be measured. Import statements or record committed expenses."
        : `${money(gbpCash, input.base)} of GBP cash covers ${reserveMonths.toFixed(1)} months of ${money(essentialMonthly ?? 0, input.base)} essential spending (${input.essentialSource === "observed" ? "observed from statements" : "from recorded commitments"}), against a ${POLICY_LIMITS.reserveMonths}-month target.`,
    value: reserveMonths,
    limit: POLICY_LIMITS.reserveMonths,
    unit: "months",
  });

  // Rule 5 — where the next pound goes.
  const nextRung = nextCapitalRung(input, reserveMonths);
  findings.push({
    rule: 5,
    id: "capital-ladder",
    label: "Capital priority ladder",
    status: "ok",
    headline: `Next claim on surplus capital: ${nextRung}.`,
    value: null,
    limit: null,
    unit: "none",
  });

  // Rule 6 — target allocation, and crypto inside the satellite sleeve.
  // Sleeve weights are only meaningful once every recorded holding has a price;
  // an unpriced book reads as 0% in every sleeve, which is an absence of data,
  // not an allocation to report.
  const allocation = allocationRows(sleeveValues, investableTotal);
  const allocationMeasurable = positions.length === 0 || input.unpricedCount === 0;
  const worstDrift = allocation.reduce(
    (worst, row) =>
      row.targetPct !== null && row.driftPp !== null && Math.abs(row.driftPp) > Math.abs(worst)
        ? row.driftPp
        : worst,
    0,
  );
  const cryptoPct = share(sleeveValues.crypto, investableTotal);
  const cryptoStatus = capStatus(cryptoPct, POLICY_LIMITS.cryptoCapPct);
  const unpricedNote = `${input.unpricedCount} of ${positions.length} holding${
    positions.length === 1 ? "" : "s"
  } ${input.unpricedCount === 1 ? "has" : "have"} no price`;
  findings.push({
    rule: 6,
    id: "target-allocation",
    label: "Target allocation",
    status:
      investableTotal <= 0
        ? "not_applicable"
        : !allocationMeasurable
          ? "unknown"
          : cryptoStatus === "breach"
            ? "breach"
            : Math.abs(worstDrift) >= POLICY_LIMITS.driftPct
              ? "watch"
              : "ok",
    headline:
      investableTotal <= 0
        ? "No liquid investable assets recorded yet."
        : !allocationMeasurable
          ? `Allocation cannot be measured: ${unpricedNote}, so every sleeve reads 0% whatever is actually held.`
          : `${allocation
              .filter((row) => row.targetPct !== null)
              .map((row) => `${row.label} ${pct(row.actualPct, 0)}/${row.targetPct}%`)
              .join(" · ")}. Crypto ${pct(cryptoPct)} of a ${POLICY_LIMITS.cryptoCapPct}% cap.`,
    value: allocationMeasurable ? worstDrift : null,
    limit: POLICY_LIMITS.driftPct,
    unit: "pct",
  });

  // Rule 7 — the speculative sleeve, in aggregate and name by name.
  const specValue = sleeveValues.satellite + sleeveValues.crypto;
  const specPct = share(specValue, investableTotal);
  const specCost = speculativePositions.reduce((sum, p) => sum + p.costBase, 0);
  const specCostPct = share(specCost, investableTotal);
  const specUnpriced = speculativePositions.filter((p) => !p.priced || p.valueBase === null);
  const oversized = speculativePositions.filter(
    (p) => (p.weightPct ?? 0) > POLICY_LIMITS.singleSpeculativeTrimPct,
  );
  const approaching = speculativePositions.filter(
    (p) =>
      (p.weightPct ?? 0) > POLICY_LIMITS.singleSpeculativeCapPct &&
      (p.weightPct ?? 0) <= POLICY_LIMITS.singleSpeculativeTrimPct,
  );
  const sleeveStatus = capStatus(specPct, POLICY_LIMITS.speculativeSleeveCapPct);
  findings.push({
    rule: 7,
    id: "speculative-sleeve",
    label: "Speculative sleeve",
    status:
      investableTotal <= 0
        ? "not_applicable"
        : oversized.length
          ? "breach"
          : sleeveStatus === "breach"
            ? "breach"
            : approaching.length || sleeveStatus === "watch"
              ? "watch"
              : specUnpriced.length
                ? "unknown"
                : "ok",
    headline:
      investableTotal <= 0
        ? "No liquid investable assets recorded yet."
        : oversized.length
          ? `${oversized.map((p) => `${p.ticker} at ${pct(p.weightPct)}`).join(", ")} is past the 4% trim trigger — trim back to ${POLICY_LIMITS.singleSpeculativeCapPct}%. Sleeve total ${pct(specPct)} of a ${POLICY_LIMITS.speculativeSleeveCapPct}% cap.`
          : specUnpriced.length
            ? `Sleeve weight cannot be measured: ${specUnpriced.map((p) => p.ticker).join(", ")} ${
                specUnpriced.length === 1 ? "has" : "have"
              } no price. At cost the sleeve is ${pct(specCostPct)} of a ${POLICY_LIMITS.speculativeSleeveCapPct}% cap.`
            : `Speculative sleeve is ${pct(specPct)} at market (${pct(specCostPct)} at cost) against a ${POLICY_LIMITS.speculativeSleeveCapPct}% cap; largest single name ${pct(
                speculativePositions.reduce((max, p) => Math.max(max, p.weightPct ?? 0), 0),
              )} of a ${POLICY_LIMITS.singleSpeculativeCapPct}% limit.`,
    value: specUnpriced.length ? specCostPct : specPct,
    limit: POLICY_LIMITS.speculativeSleeveCapPct,
    unit: "pct",
  });

  // Rule 8 — the goal test, with the arithmetic shown.
  const goalTest = evaluateGoalTest(input);
  findings.push(goalTest);

  // Rule 9 — written thesis and falsification on every speculative position.
  const missingThesis = speculativePositions.filter((p) => !p.hasThesis);
  findings.push({
    rule: 9,
    id: "written-thesis",
    label: "Written thesis",
    status:
      speculativePositions.length === 0 ? "not_applicable" : missingThesis.length ? "breach" : "ok",
    headline: speculativePositions.length
      ? missingThesis.length
        ? `${missingThesis.map((p) => p.ticker).join(", ")} has no written thesis and falsification condition on file.`
        : "Every speculative position carries a written thesis and a falsification condition."
      : "No speculative positions held.",
    value: missingThesis.length,
    limit: 0,
    unit: "none",
  });

  // Rule 10 — soft-currency exposure.
  const softPct = share(input.softCurrencyValue, netWorth);
  findings.push({
    rule: 10,
    id: "soft-currency",
    label: "Soft-currency exposure",
    status: netWorth > 0 ? capStatus(softPct, POLICY_LIMITS.softCurrencyCapPct) : "not_applicable",
    headline:
      netWorth > 0
        ? `EGP and JOD assets are ${pct(softPct)} of net worth against a ${POLICY_LIMITS.softCurrencyCapPct}% cap.`
        : "No net worth recorded yet.",
    value: softPct,
    limit: POLICY_LIMITS.softCurrencyCapPct,
    unit: "pct",
  });

  // Rule 11 — the goal horizon ladder.
  const nearGoals = input.goals.filter(
    (goal) => goal.monthsAway !== null && goal.monthsAway <= 24 && goal.status !== "achieved",
  );
  const nearNeed = nearGoals.reduce(
    (sum, goal) => sum + Math.max(goal.targetBase - goal.fundedBase, 0),
    0,
  );
  findings.push({
    rule: 11,
    id: "goal-horizon",
    label: "Goal horizon ladder",
    status: nearGoals.length === 0 ? "not_applicable" : nearNeed > gbpCash ? "watch" : "ok",
    headline: nearGoals.length
      ? `${nearGoals.length} goal${nearGoals.length === 1 ? "" : "s"} fall${nearGoals.length === 1 ? "s" : ""} due within two years needing ${money(nearNeed, input.base)}; ${money(gbpCash, input.base)} sits in cash. Under two years the policy says cash only.`
      : "No goals inside the two-year cash-only window.",
    value: nearNeed,
    limit: gbpCash,
    unit: "currency",
  });

  // Rule 12 — rebalance discipline. A drift figure built on unpriced holdings
  // would trigger a rebalance nobody can size, so it stays unknown until the
  // whole book is priced.
  const isApril = new Date(input.now ?? Date.now()).getUTCMonth() === 3;
  findings.push({
    rule: 12,
    id: "rebalance",
    label: "Rebalance discipline",
    status:
      investableTotal <= 0
        ? "not_applicable"
        : !allocationMeasurable
          ? "unknown"
          : Math.abs(worstDrift) >= POLICY_LIMITS.driftPct
            ? "watch"
            : isApril
              ? "watch"
              : "ok",
    headline:
      investableTotal <= 0
        ? "Nothing to rebalance yet."
        : !allocationMeasurable
          ? `Drift cannot be measured while ${unpricedNote}; a rebalance cannot be sized from unpriced holdings.`
          : Math.abs(worstDrift) >= POLICY_LIMITS.driftPct
            ? `Largest sleeve drift is ${worstDrift > 0 ? "+" : "−"}${Math.abs(worstDrift).toFixed(1)}pp, past the ${POLICY_LIMITS.driftPct}pp trigger.`
            : isApril
              ? `April: the annual rebalance window is open. Largest drift is ${Math.abs(worstDrift).toFixed(1)}pp.`
              : `Largest sleeve drift is ${Math.abs(worstDrift).toFixed(1)}pp, inside the ${POLICY_LIMITS.driftPct}pp trigger.`,
    value: allocationMeasurable ? worstDrift : null,
    limit: POLICY_LIMITS.driftPct,
    unit: "pct",
  });

  return findings;
}

function evaluateGoalTest(input: PolicyInput): PolicyFinding {
  const speculative = input.positions.filter((p) => isSpeculative(p.sleeve) && p.priced);
  if (!speculative.length) {
    return {
      rule: 8,
      id: "goal-test",
      label: "Goal test",
      status: "not_applicable",
      headline: "No speculative positions to test against the goals.",
      value: null,
      limit: POLICY_LIMITS.maxGoalDelayMonths,
      unit: "months",
    };
  }
  const fundedGoals = input.goals.filter(
    (goal) => goal.status !== "achieved" && goal.targetBase > 0 && goal.fundedBase > 0,
  );
  const surplus = input.monthlySurplus;
  if (!surplus || surplus <= 0) {
    return {
      rule: 8,
      id: "goal-test",
      label: "Goal test",
      status: "unknown",
      headline:
        "The goal test needs a monthly surplus to measure against. Record income and spending, or import statements, and it becomes measurable.",
      value: null,
      limit: POLICY_LIMITS.maxGoalDelayMonths,
      unit: "months",
    };
  }

  const worst = speculative.reduce(
    (acc, position) => {
      const loss = position.valueBase ?? 0;
      const delay = goalDelayMonths(loss, surplus) ?? 0;
      return delay > acc.delay ? { delay, position } : acc;
    },
    { delay: 0, position: speculative[0]! },
  );

  if (!fundedGoals.length) {
    return {
      rule: 8,
      id: "goal-test",
      label: "Goal test",
      status: "unknown",
      headline: `A total loss on ${worst.position.ticker} would take ${worst.delay.toFixed(1)} months of surplus to rebuild, but no funded goal is recorded to test that against.`,
      value: worst.delay,
      limit: POLICY_LIMITS.maxGoalDelayMonths,
      unit: "months",
    };
  }

  const status: PolicyStatus =
    worst.delay > POLICY_LIMITS.maxGoalDelayMonths
      ? "breach"
      : worst.delay > POLICY_LIMITS.maxGoalDelayMonths * 0.7
        ? "watch"
        : "ok";

  return {
    rule: 8,
    id: "goal-test",
    label: "Goal test",
    status,
    headline: `Worst case: losing ${worst.position.ticker} in full costs ${money(worst.position.valueBase ?? 0, input.base)}, which is ${worst.delay.toFixed(1)} months of the ${money(surplus, input.base)} monthly surplus — against a ${POLICY_LIMITS.maxGoalDelayMonths}-month limit.`,
    value: worst.delay,
    limit: POLICY_LIMITS.maxGoalDelayMonths,
    unit: "months",
  };
}

function nextCapitalRung(input: PolicyInput, reserveMonths: number | null): string {
  // Rung 1 only fires on a recorded answer. Silence is not a "no".
  const unsecuredMatch = input.allowances.find((a) => a.recorded && !a.employerMatchSecured);
  if (unsecuredMatch)
    return `secure the employer pension match for ${unsecuredMatch.person} (free money, rung 1)`;
  if (reserveMonths !== null && reserveMonths < POLICY_LIMITS.reserveMonths) {
    const shortfall = (POLICY_LIMITS.reserveMonths - reserveMonths) * (input.essentialMonthly ?? 0);
    return `top up the liquidity reserve by ${money(shortfall, input.base)} (rung 2)`;
  }
  if (reserveMonths === null)
    return "establish the essential-spending baseline so the reserve can be measured (rung 2)";
  const expensiveDebt = input.highRateDebts[0];
  if (expensiveDebt)
    return `clear ${expensiveDebt.name} at ${expensiveDebt.ratePct.toFixed(2)}% (rung 3)`;
  const unrecorded = input.allowances.filter((a) => !a.recorded);
  if (unrecorded.length)
    return `record this year's ISA and pension contributions for ${unrecorded
      .map((a) => a.person)
      .join(
        " and ",
      )} — with nothing logged, rungs 4 and 5 cannot be measured (${input.daysToTaxYearEnd} days to 5 April)`;
  const isaLeft = input.allowances.filter((a) => a.isaRemaining > 0);
  if (isaLeft.length)
    return `use the remaining ISA allowance — ${isaLeft
      .map((a) => `${a.person} ${money(a.isaRemaining, input.base)}`)
      .join(", ")} with ${input.daysToTaxYearEnd} days to 5 April (rung 4)`;
  const pensionLeft = input.allowances.filter((a) => a.pensionRemaining > 0);
  if (pensionLeft.length)
    return `contribute toward the £60,000 pension annual allowance — ${pensionLeft
      .map((a) => `${a.person} ${money(a.pensionRemaining, input.base)}`)
      .join(", ")} (rung 5)`;
  const nearGoal = input.goals
    .filter((g) => g.monthsAway !== null && g.status !== "achieved")
    .sort((a, b) => (a.monthsAway ?? 0) - (b.monthsAway ?? 0))[0];
  if (nearGoal) return `fund ${nearGoal.title} (rung 6)`;
  return "the general investment account (rung 8)";
}

export type AllocationRow = {
  sleeve: Sleeve;
  label: string;
  value: number;
  actualPct: number | null;
  targetPct: number | null;
  capPct: number | null;
  driftPp: number | null;
  status: PolicyStatus;
};

export function allocationRows(
  sleeveValues: Record<Sleeve, number>,
  investableTotal: number,
): AllocationRow[] {
  return SLEEVES.map((sleeve) => {
    const value = sleeveValues[sleeve.value] ?? 0;
    const actualPct = share(value, investableTotal);
    const driftPp =
      actualPct !== null && sleeve.targetPct !== null ? actualPct - sleeve.targetPct : null;
    const status: PolicyStatus =
      investableTotal <= 0
        ? "not_applicable"
        : sleeve.capPct !== null
          ? capStatus(actualPct, sleeve.capPct)
          : driftPp === null
            ? "unknown"
            : Math.abs(driftPp) >= POLICY_LIMITS.driftPct
              ? "watch"
              : "ok";
    return {
      sleeve: sleeve.value,
      label: sleeve.label,
      value,
      actualPct,
      targetPct: sleeve.targetPct,
      capPct: sleeve.capPct,
      driftPp,
      status,
    };
  });
}

export type ConcentrationRow = {
  key: string;
  label: string;
  sublabel: string;
  value: number | null;
  limit: number | null;
  unit: "pct" | "months";
  status: PolicyStatus;
  rule: number;
  detail: string;
};

/** The rows the portfolio's concentration panel renders, in severity order. */
export function concentrationRows(input: PolicyInput): ConcentrationRow[] {
  const rows: ConcentrationRow[] = [];
  const { investableTotal } = input;

  for (const position of input.positions) {
    const speculative = isSpeculative(position.sleeve);
    const weight = position.weightPct;
    if (speculative) {
      const status: PolicyStatus =
        weight === null
          ? "unknown"
          : weight > POLICY_LIMITS.singleSpeculativeTrimPct
            ? "breach"
            : weight > POLICY_LIMITS.singleSpeculativeCapPct
              ? "watch"
              : weight >= POLICY_LIMITS.singleSpeculativeCapPct * 0.8
                ? "watch"
                : "ok";
      rows.push({
        key: position.id,
        label: position.ticker,
        sublabel: position.name ?? SLEEVE_LABELS[position.sleeve] ?? position.sleeve,
        value: weight,
        limit: POLICY_LIMITS.singleSpeculativeCapPct,
        unit: "pct",
        status,
        rule: 7,
        detail:
          weight === null
            ? "No live price, so the position cannot be weighed against the 3% single-name limit."
            : weight > POLICY_LIMITS.singleSpeculativeTrimPct
              ? `Past the 4% trim trigger — policy says trim back to ${POLICY_LIMITS.singleSpeculativeCapPct}%.`
              : weight > POLICY_LIMITS.singleSpeculativeCapPct
                ? "Above the 3% single-name limit but below the 4% trim trigger."
                : "Within the 3% single-name speculative limit.",
      });
    } else {
      rows.push({
        key: position.id,
        label: position.ticker,
        sublabel: position.name ?? SLEEVE_LABELS[position.sleeve] ?? position.sleeve,
        value: weight,
        limit: null,
        unit: "pct",
        status: weight === null ? "unknown" : "ok",
        rule: 6,
        detail:
          weight === null
            ? "No live price, so this position is not counted in any percentage below."
            : `No individual cap outside the speculative sleeve. Counts toward the ${SLEEVE_LABELS[position.sleeve]} target and the 25% single-name technology cap where it applies.`,
      });
    }
  }

  // Percentage-of-market rows are only true when the whole book is priced.
  // With prices missing, every sleeve reads 0%, which would show as "within
  // policy" when the truth is that nothing can be measured at all.
  const bookUnpriced = input.positions.length > 0 && input.unpricedCount > 0;
  const unpricedDetail = ` ${input.unpricedCount} of ${input.positions.length} holding${
    input.positions.length === 1 ? "" : "s"
  } ${input.unpricedCount === 1 ? "has" : "have"} no price, so this cannot be measured today.`;

  const specValue = input.sleeveValues.satellite + input.sleeveValues.crypto;
  rows.push({
    key: "sleeve-speculative",
    label: "Speculative sleeve",
    sublabel: "Satellite and crypto combined",
    value: bookUnpriced ? null : share(specValue, investableTotal),
    limit: POLICY_LIMITS.speculativeSleeveCapPct,
    unit: "pct",
    status: bookUnpriced
      ? "unknown"
      : capStatus(share(specValue, investableTotal), POLICY_LIMITS.speculativeSleeveCapPct),
    rule: 7,
    detail:
      "Rule 7: total speculative sleeve stays at or below 10% of liquid investable assets." +
      (bookUnpriced ? unpricedDetail : ""),
  });

  rows.push({
    key: "sleeve-crypto",
    label: "Crypto",
    sublabel: "Inside the satellite sleeve",
    value: bookUnpriced ? null : share(input.sleeveValues.crypto, investableTotal),
    limit: POLICY_LIMITS.cryptoCapPct,
    unit: "pct",
    status: bookUnpriced
      ? "unknown"
      : capStatus(share(input.sleeveValues.crypto, investableTotal), POLICY_LIMITS.cryptoCapPct),
    rule: 6,
    detail:
      "Rule 6: crypto counts inside the satellite sleeve and is capped at 5% on its own." +
      (bookUnpriced ? unpricedDetail : ""),
  });

  const techValue = input.positions
    .filter((p) => p.priced && isTechnology(p) === true)
    .reduce((sum, p) => sum + (p.valueBase ?? 0), 0);
  rows.push({
    key: "tech",
    label: "Single-name technology",
    sublabel: "Share of the liquid equity portfolio",
    value: bookUnpriced ? null : share(techValue, input.equityPoolBase),
    limit: POLICY_LIMITS.techSingleNameCapPct,
    unit: "pct",
    status: bookUnpriced
      ? "unknown"
      : input.equityPoolBase > 0
        ? capStatus(share(techValue, input.equityPoolBase), POLICY_LIMITS.techSingleNameCapPct)
        : "not_applicable",
    rule: 3,
    detail:
      "Rule 3: direct single-name technology is capped at 25% of the liquid equity portfolio." +
      (bookUnpriced ? unpricedDetail : ""),
  });


  rows.push({
    key: "soft-currency",
    label: "Soft currency",
    sublabel: "EGP and JOD as a share of net worth",
    value: share(input.softCurrencyValue, input.netWorth),
    limit: POLICY_LIMITS.softCurrencyCapPct,
    unit: "pct",
    status:
      input.netWorth > 0
        ? capStatus(
            share(input.softCurrencyValue, input.netWorth),
            POLICY_LIMITS.softCurrencyCapPct,
          )
        : "not_applicable",
    rule: 10,
    detail: "Rule 10: soft-currency assets stay at or below 30% of household net worth.",
  });

  const reserveMonths =
    input.essentialMonthly && input.essentialMonthly > 0
      ? input.gbpCash / input.essentialMonthly
      : null;
  rows.push({
    key: "reserve",
    label: "Liquidity reserve",
    sublabel: "Months of essential spending in GBP cash",
    value: reserveMonths,
    limit: POLICY_LIMITS.reserveMonths,
    unit: "months",
    status:
      reserveMonths === null
        ? "unknown"
        : reserveMonths >= POLICY_LIMITS.reserveMonths
          ? "ok"
          : reserveMonths >= POLICY_LIMITS.reserveWatchMonths
            ? "watch"
            : "breach",
    rule: 4,
    detail:
      "Rule 4: twelve months of essential spending in GBP cash. Nothing speculative is funded while it is short.",
  });

  const severity: Record<PolicyStatus, number> = {
    breach: 0,
    watch: 1,
    unknown: 2,
    ok: 3,
    not_applicable: 4,
  };
  return rows.sort((a, b) => {
    const bySeverity = severity[a.status] - severity[b.status];
    if (bySeverity !== 0) return bySeverity;
    return (b.value ?? -1) - (a.value ?? -1);
  });
}

export const STATUS_LABELS: Record<PolicyStatus, string> = {
  ok: "Within policy",
  watch: "Approaching limit",
  breach: "Breach",
  unknown: "Not measurable",
  not_applicable: "Not applicable",
};

/** Small local formatter so this module stays free of React and hooks. */
function money(value: number, base: string) {
  const symbol = base === "GBP" ? "£" : base === "USD" ? "$" : base === "EUR" ? "€" : `${base} `;
  const abs = Math.abs(value);
  const decimals = abs < 10_000 ? 2 : 0;
  const formatted = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
  return `${value < 0 ? "−" : ""}${symbol}${formatted}`;
}
