/**
 * Per-person investment mandates.
 *
 * The household's twelve rules bind both of them — reserve, capital ladder,
 * soft-currency limit, the horizon ladder, the private stake sitting outside
 * every percentage. How each person may actually invest is theirs alone, and
 * one shared allocation cannot describe two people who invest on different
 * principles: a household bond target is meaningless to somebody whose mandate
 * excludes conventional interest.
 *
 * So allocation, drift and every sleeve cap are measured per person against
 * their own mandate. The household chart still exists — it is a picture of the
 * whole book, not the thing drift is judged against.
 *
 * Pure. Nothing here screens a security: a compliance status is recorded by
 * the household or it reads "unscreened", which is an honest unknown rather
 * than a permissive default.
 */
import { POLICY_LIMITS, capStatus, type PolicyStatus, type Sleeve } from "@/lib/policy";

export type MandateType = "conventional" | "shariah";

/** The four sleeves a mandate sets a target for. */
export type MandateSleeve = "core" | "income" | "thematic" | "satellite";

export const MANDATE_SLEEVES: MandateSleeve[] = ["core", "income", "thematic", "satellite"];

export type ShariahStatus = "compliant" | "non_compliant" | "unscreened";

export const SHARIAH_STATUSES: { value: ShariahStatus; label: string; short: string }[] = [
  { value: "compliant", label: "Screened compliant", short: "Compliant" },
  { value: "non_compliant", label: "Screened not compliant", short: "Not compliant" },
  { value: "unscreened", label: "Not screened yet", short: "Unscreened" },
];

export function shariahLabel(status: ShariahStatus) {
  return SHARIAH_STATUSES.find((entry) => entry.value === status)?.short ?? "Unscreened";
}

export function isShariahStatus(value: unknown): value is ShariahStatus {
  return value === "compliant" || value === "non_compliant" || value === "unscreened";
}

export function normaliseShariahStatus(value: unknown): ShariahStatus {
  return isShariahStatus(value) ? value : "unscreened";
}

/* ------------------------------------------------------------------ presets */

export type MandatePreset = {
  type: MandateType;
  label: string;
  summary: string;
  targets: Record<MandateSleeve, number>;
  speculativeCapPct: number;
  singleNameCapPct: number;
  cryptoCapPct: number;
  constraints: string;
};

/**
 * Written out in full so choosing "Shariah" in the app produces the same
 * mandate the household wrote down, not an approximation of it.
 */
export const SHARIAH_CONSTRAINTS = [
  "No conventional interest-bearing instruments: no conventional bonds or gilts, no conventional money market funds.",
  "Income allocation uses sukuk or Shariah-compliant income funds where it is held at all.",
  "Equity holdings must be Shariah-screened.",
].join("\n");

export const MANDATE_PRESETS: Record<MandateType, MandatePreset> = {
  conventional: {
    type: "conventional",
    label: "Conventional",
    summary:
      "Diversified core with bonds for ballast, a thematic tilt, and a capped satellite sleeve for single names.",
    targets: { core: 60, income: 15, thematic: 15, satellite: 10 },
    speculativeCapPct: POLICY_LIMITS.speculativeSleeveCapPct,
    singleNameCapPct: POLICY_LIMITS.singleSpeculativeCapPct,
    cryptoCapPct: POLICY_LIMITS.cryptoCapPct,
    constraints: "",
  },
  shariah: {
    type: "shariah",
    label: "Shariah",
    summary:
      "A single Shariah-screened global equity holding. No conventional interest-bearing instruments, and no speculative sleeve.",
    targets: { core: 100, income: 0, thematic: 0, satellite: 0 },
    speculativeCapPct: 0,
    singleNameCapPct: 0,
    cryptoCapPct: 0,
    constraints: SHARIAH_CONSTRAINTS,
  },
};

export function mandateSleeveLabel(sleeve: MandateSleeve, type: MandateType): string {
  switch (sleeve) {
    case "core":
      return "Core equity";
    case "income":
      return type === "shariah" ? "Sukuk / Shariah income" : "Bonds";
    case "thematic":
      return "Thematic";
    case "satellite":
      return "Satellite / speculative";
  }
}

export function mandateSleeveNote(sleeve: MandateSleeve, type: MandateType): string {
  switch (sleeve) {
    case "core":
      return type === "shariah"
        ? "Broad Shariah-screened equity. The engine of the portfolio."
        : "Broad, diversified, low-cost index exposure. The engine of the portfolio.";
    case "income":
      return type === "shariah"
        ? "Sukuk or a Shariah-compliant income fund. Conventional bonds, gilts and money market funds are excluded by this mandate."
        : "Duration and ballast. Also where near-dated goal money waits once it is out of cash.";
    case "thematic":
      return "Deliberate long-horizon tilts held through funds rather than single names.";
    case "satellite":
      return type === "shariah"
        ? "This mandate holds no speculative sleeve."
        : "High-volatility single names. Capped, and sized to survive a total loss.";
  }
}

/** Holdings are stored in five sleeves; a mandate sets targets for four. */
export function toMandateSleeve(sleeve: Sleeve): MandateSleeve {
  if (sleeve === "bond") return "income";
  if (sleeve === "crypto") return "satellite";
  return sleeve;
}

/* -------------------------------------------------------------------- shape */

/** The stored row, as the table holds it. */
export type MandateRowLike = {
  id?: string;
  profile_id: string;
  mandate_type: string;
  target_core_pct: number | string;
  target_income_pct: number | string;
  target_thematic_pct: number | string;
  target_satellite_pct: number | string;
  speculative_cap_pct: number | string;
  single_name_cap_pct: number | string;
  crypto_cap_pct: number | string;
  additional_constraints: string | null;
  notes: string | null;
};

export type Mandate = {
  id: string | null;
  profileId: string;
  person: string;
  type: MandateType;
  /** False when nothing has been recorded — the defaults shown are the household's, not theirs. */
  recorded: boolean;
  targets: Record<MandateSleeve, number>;
  speculativeCapPct: number;
  singleNameCapPct: number;
  cryptoCapPct: number;
  /** The written constraints, one per line. */
  constraints: string[];
  additionalConstraints: string | null;
  notes: string | null;
};

const num = (value: number | string | null | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function mandateType(value: unknown): MandateType {
  return value === "shariah" ? "shariah" : "conventional";
}

export function splitConstraints(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
}

/**
 * A member with no mandate on file is not silently conventional: the row comes
 * back `recorded: false`, and every surface says the defaults are the
 * household's written policy until somebody chooses.
 */
export function mandateFor(input: {
  profileId: string;
  person: string;
  row?: MandateRowLike | undefined;
}): Mandate {
  const { row } = input;
  const type = mandateType(row?.mandate_type);
  const preset = MANDATE_PRESETS[type];
  return {
    id: row?.id ?? null,
    profileId: input.profileId,
    person: input.person,
    type,
    recorded: !!row,
    targets: {
      core: num(row?.target_core_pct, preset.targets.core),
      income: num(row?.target_income_pct, preset.targets.income),
      thematic: num(row?.target_thematic_pct, preset.targets.thematic),
      satellite: num(row?.target_satellite_pct, preset.targets.satellite),
    },
    speculativeCapPct: num(row?.speculative_cap_pct, preset.speculativeCapPct),
    singleNameCapPct: num(row?.single_name_cap_pct, preset.singleNameCapPct),
    cryptoCapPct: num(row?.crypto_cap_pct, preset.cryptoCapPct),
    constraints: splitConstraints(row?.additional_constraints ?? preset.constraints),
    additionalConstraints: row?.additional_constraints ?? null,
    notes: row?.notes ?? null,
  };
}

/* --------------------------------------------------------------- evaluation */

/** Everything the mandate maths needs from a position. */
export type MandatePosition = {
  id: string;
  ticker: string;
  name: string | null;
  sleeve: Sleeve;
  securityType: string;
  priced: boolean;
  marketValueBase: number | null;
  shariahStatus: ShariahStatus;
};

export type MandateSleeveRow = {
  sleeve: MandateSleeve;
  label: string;
  note: string;
  valueBase: number;
  actualPct: number | null;
  targetPct: number;
  driftPp: number | null;
  status: PolicyStatus;
};

export type MandateFlag = {
  id: string;
  ticker: string;
  name: string | null;
  valueBase: number | null;
  pct: number | null;
  sleeve: Sleeve;
  status: ShariahStatus;
};

export type MandateFinding = {
  id: string;
  label: string;
  status: PolicyStatus;
  headline: string;
};

export type MandateEvaluation = {
  mandate: Mandate;
  profileId: string;
  person: string;
  type: MandateType;
  recorded: boolean;
  /** This person's own liquid investable assets — the denominator for their percentages. */
  investableBase: number;
  holdingsValueBase: number;
  holdingCount: number;
  unpricedCount: number;
  /** Weights mean nothing while a holding has no price; the panel says so instead of showing 0%. */
  measurable: boolean;
  rows: MandateSleeveRow[];
  worstDriftPp: number | null;
  /** The same verdicts the household roll-up, the policy panel and the advisor read. */
  allocationStatus: PolicyStatus;
  allocationHeadline: string;
  speculativeStatus: PolicyStatus;
  speculativeHeadline: string;
  speculative: { valueBase: number; pct: number | null; capPct: number; status: PolicyStatus };
  crypto: { valueBase: number; pct: number | null; capPct: number; status: PolicyStatus };
  singleNames: { id: string; ticker: string; pct: number | null; status: PolicyStatus }[];
  largestSingleNamePct: number | null;
  compliance: {
    status: PolicyStatus;
    nonCompliant: MandateFlag[];
    unscreened: MandateFlag[];
    compliantCount: number;
    headline: string;
  };
  findings: MandateFinding[];
};

const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);
const pctText = (value: number | null, decimals = 1) =>
  value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(decimals)}%`;

/** A zero cap is a prohibition, not a limit to creep up on. */
function capOrProhibition(value: number | null, cap: number): PolicyStatus {
  if (cap <= 0) {
    if (value === null) return "unknown";
    return value > 0 ? "breach" : "ok";
  }
  return capStatus(value, cap);
}

/** The trim trigger sits a point above the cap, as the written policy does at 3% and 4%. */
export function trimTrigger(capPct: number) {
  return capPct <= 0 ? 0 : capPct + 1;
}

export function evaluateMandate(input: {
  mandate: Mandate;
  positions: MandatePosition[];
  /** This person's liquid investable assets, in base currency. */
  investableBase: number;
}): MandateEvaluation {
  const { mandate, positions, investableBase } = input;
  const priced = positions.filter((position) => position.priced && position.marketValueBase !== null);
  const unpricedCount = positions.length - priced.length;
  const measurable = positions.length === 0 || unpricedCount === 0;

  const holdingsValueBase = priced.reduce((sum, p) => sum + (p.marketValueBase ?? 0), 0);

  const sleeveValues: Record<MandateSleeve, number> = {
    core: 0,
    income: 0,
    thematic: 0,
    satellite: 0,
  };
  let cryptoValue = 0;
  for (const position of priced) {
    const bucket = toMandateSleeve(position.sleeve);
    sleeveValues[bucket] += position.marketValueBase ?? 0;
    if (position.sleeve === "crypto") cryptoValue += position.marketValueBase ?? 0;
  }

  const rows: MandateSleeveRow[] = MANDATE_SLEEVES.map((sleeve) => {
    const value = sleeveValues[sleeve];
    const actualPct = share(value, investableBase);
    const targetPct = mandate.targets[sleeve];
    const driftPp = actualPct === null ? null : actualPct - targetPct;
    const status: PolicyStatus =
      investableBase <= 0
        ? "not_applicable"
        : !measurable
          ? "unknown"
          : targetPct <= 0
            ? value > 0
              ? "breach"
              : "ok"
            : driftPp === null
              ? "unknown"
              : Math.abs(driftPp) >= POLICY_LIMITS.driftPct
                ? "watch"
                : "ok";
    return {
      sleeve,
      label: mandateSleeveLabel(sleeve, mandate.type),
      note: mandateSleeveNote(sleeve, mandate.type),
      valueBase: value,
      actualPct,
      targetPct,
      driftPp,
      status,
    };
  });

  const worstDrift = measurable
    ? rows.reduce<number | null>((worst, row) => {
        if (row.driftPp === null) return worst;
        if (worst === null || Math.abs(row.driftPp) > Math.abs(worst)) return row.driftPp;
        return worst;
      }, null)
    : null;

  const specValue = sleeveValues.satellite;
  const specPct = measurable ? share(specValue, investableBase) : null;
  const cryptoPct = measurable ? share(cryptoValue, investableBase) : null;

  const singleNames = positions
    .filter((position) => position.sleeve === "satellite" || position.sleeve === "crypto")
    .map((position) => {
      const pct =
        position.priced && investableBase > 0
          ? ((position.marketValueBase ?? 0) / investableBase) * 100
          : null;
      const cap = mandate.singleNameCapPct;
      const status: PolicyStatus =
        pct === null
          ? "unknown"
          : cap <= 0
            ? pct > 0
              ? "breach"
              : "ok"
            : pct > trimTrigger(cap)
              ? "breach"
              : pct > cap
                ? "watch"
                : pct >= cap * 0.8
                  ? "watch"
                  : "ok";
      return { id: position.id, ticker: position.ticker, pct, status };
    })
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  const flag = (position: MandatePosition): MandateFlag => ({
    id: position.id,
    ticker: position.ticker,
    name: position.name,
    valueBase: position.priced ? position.marketValueBase : null,
    pct:
      position.priced && investableBase > 0
        ? ((position.marketValueBase ?? 0) / investableBase) * 100
        : null,
    sleeve: position.sleeve,
    status: position.shariahStatus,
  });

  const shariah = mandate.type === "shariah";
  const nonCompliant = shariah
    ? positions.filter((position) => position.shariahStatus === "non_compliant").map(flag)
    : [];
  const unscreened = shariah
    ? positions.filter((position) => position.shariahStatus === "unscreened").map(flag)
    : [];
  const compliantCount = positions.filter(
    (position) => position.shariahStatus === "compliant",
  ).length;

  const complianceStatus: PolicyStatus = !shariah
    ? "not_applicable"
    : positions.length === 0
      ? "not_applicable"
      : nonCompliant.length
        ? "breach"
        : unscreened.length
          ? "unknown"
          : "ok";

  const complianceHeadline = !shariah
    ? "Conventional mandate — no Shariah screen applies."
    : positions.length === 0
      ? "No holdings recorded under this mandate yet."
      : nonCompliant.length
        ? `${nonCompliant
            .map((entry) => entry.ticker)
            .join(", ")} ${nonCompliant.length === 1 ? "is" : "are"} recorded as not Shariah-compliant and sits inside a Shariah mandate.`
        : unscreened.length
          ? `${unscreened.map((entry) => entry.ticker).join(", ")} ${
              unscreened.length === 1 ? "has" : "have"
            } no compliance determination on file. Unscreened is not the same as compliant — record the determination against each holding.`
          : `All ${compliantCount} holding${compliantCount === 1 ? "" : "s"} are recorded as Shariah-compliant.`;

  const allocationStatus: PolicyStatus =
    investableBase <= 0
      ? "not_applicable"
      : !measurable
        ? "unknown"
        : rows.some((row) => row.status === "breach")
          ? "breach"
          : worstDrift !== null && Math.abs(worstDrift) >= POLICY_LIMITS.driftPct
            ? "watch"
            : "ok";

  const allocationHeadline =
    investableBase <= 0
      ? `${mandate.person} has no liquid investable assets recorded in their own name, so their mandate has nothing to measure against.`
      : !measurable
        ? `${unpricedCount} of ${positions.length} of ${mandate.person}'s holding${
            positions.length === 1 ? "" : "s"
          } ${unpricedCount === 1 ? "has" : "have"} no price, so every sleeve reads 0% whatever is actually held.`
        : `${mandate.person} (${MANDATE_PRESETS[mandate.type].label.toLowerCase()} mandate): ${rows
            .map((row) => `${row.label} ${pctText(row.actualPct, 0)}/${row.targetPct}%`)
            .join(" · ")}.`;

  const speculativeStatus: PolicyStatus =
    investableBase <= 0
      ? "not_applicable"
      : !measurable
        ? "unknown"
        : singleNames.some((entry) => entry.status === "breach")
          ? "breach"
          : capOrProhibition(specPct, mandate.speculativeCapPct);

  const speculativeHeadline =
    mandate.speculativeCapPct <= 0
      ? specValue > 0
        ? `${mandate.person}'s mandate holds no speculative sleeve, yet ${pctText(specPct)} of their investable assets sits in one.`
        : `${mandate.person}'s mandate holds no speculative sleeve, and none is held.`
      : `${mandate.person}'s speculative sleeve is ${pctText(specPct)} of the ${
          mandate.speculativeCapPct
        }% their mandate permits; largest single name ${pctText(
          singleNames[0]?.pct ?? null,
        )} of a ${mandate.singleNameCapPct}% limit.`;

  const findings: MandateFinding[] = [
    {
      id: `mandate-allocation-${mandate.profileId}`,
      label: "Allocation against mandate",
      status: allocationStatus,
      headline: allocationHeadline,
    },
    {
      id: `mandate-speculative-${mandate.profileId}`,
      label: "Speculative sleeve against mandate",
      status: speculativeStatus,
      headline: speculativeHeadline,
    },
    ...(shariah
      ? [
          {
            id: `mandate-compliance-${mandate.profileId}`,
            label: "Shariah compliance",
            status: complianceStatus,
            headline: complianceHeadline,
          },
        ]
      : []),
  ];

  return {
    mandate,
    profileId: mandate.profileId,
    person: mandate.person,
    type: mandate.type,
    recorded: mandate.recorded,
    investableBase,
    holdingsValueBase,
    holdingCount: positions.length,
    unpricedCount,
    measurable,
    rows,
    worstDriftPp: worstDrift,
    allocationStatus,
    allocationHeadline,
    speculativeStatus,
    speculativeHeadline,
    speculative: {
      valueBase: specValue,
      pct: specPct,
      capPct: mandate.speculativeCapPct,
      status: speculativeStatus,
    },
    crypto: {
      valueBase: cryptoValue,
      pct: cryptoPct,
      capPct: mandate.cryptoCapPct,
      status:
        investableBase <= 0
          ? "not_applicable"
          : !measurable
            ? "unknown"
            : capOrProhibition(cryptoPct, mandate.cryptoCapPct),
    },
    singleNames,
    largestSingleNamePct: singleNames[0]?.pct ?? null,
    compliance: {
      status: complianceStatus,
      nonCompliant,
      unscreened,
      compliantCount,
      headline: complianceHeadline,
    },
    findings,
  };
}

/** Worst status across a set, for a household roll-up that cannot average away a breach. */
export function worstStatus(statuses: PolicyStatus[]): PolicyStatus {
  const order: PolicyStatus[] = ["breach", "watch", "unknown", "ok", "not_applicable"];
  for (const status of order) if (statuses.includes(status)) return status;
  return "not_applicable";
}

/** One line describing a mandate, for headers and the advisor's context. */
export function mandateSummary(mandate: Mandate): string {
  const targets = MANDATE_SLEEVES.filter((sleeve) => mandate.targets[sleeve] > 0)
    .map((sleeve) => `${mandateSleeveLabel(sleeve, mandate.type)} ${mandate.targets[sleeve]}%`)
    .join(", ");
  const caps =
    mandate.speculativeCapPct > 0
      ? `speculative ≤ ${mandate.speculativeCapPct}%, single name ≤ ${mandate.singleNameCapPct}%, crypto ≤ ${mandate.cryptoCapPct}%`
      : "no speculative sleeve, no crypto";
  return `${MANDATE_PRESETS[mandate.type].label}: ${targets}. ${caps}.`;
}
