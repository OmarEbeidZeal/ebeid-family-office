/**
 * Monte Carlo over the household projection.
 *
 * This is a model, not a forecast: it takes the return and volatility the user
 * set, draws 1,000 paths from a lognormal distribution, and reports how often
 * each goal still lands on time. The generator is seeded, so the same inputs
 * always produce the same numbers — a probability that jitters every render is
 * a probability nobody can act on.
 */
import { runProjection, type ForecastInput, type ForecastResult } from "./forecast";

export type MonteCarloResult = {
  paths: number;
  months: number;
  returnPct: number;
  volatilityPct: number;
  /** Net worth fan: the 10th, 50th and 90th percentile of every month. */
  fan: { month: number; key: string; label: string; p10: number; p50: number; p90: number }[];
  endNetWorth: { p10: number; p50: number; p90: number };
  minCash: { p10: number; p50: number; p90: number };
  /** Share of paths where cash never falls through the reserve floor. */
  floorHeldPct: number;
  /** Share of paths where cash never goes negative. */
  solventPct: number;
  goals: {
    id: string;
    title: string;
    key: string;
    probability: number;
    /** Median shortfall across the paths that miss. */
    medianShortfall: number;
  }[];
};

/** Deterministic 32-bit generator — same seed, same simulation, every time. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number) {
  // Box–Muller, guarding against log(0).
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

export function runMonteCarlo(
  input: ForecastInput,
  options?: { paths?: number; seed?: number },
): MonteCarloResult {
  const paths = options?.paths ?? 1000;
  const seed = options?.seed ?? 20260405;
  const months = Math.max(1, Math.round(input.assumptions.months));
  const random = mulberry32(seed);

  const annualReturn = input.assumptions.investmentReturnPct / 100;
  const annualVol = Math.max(0, input.assumptions.volatilityPct) / 100;
  // Lognormal drift, so a 5% expected arithmetic return is not silently
  // inflated by the variance term.
  const drift = Math.log(1 + annualReturn) - (annualVol * annualVol) / 2;
  const monthlyDrift = drift / 12;
  const monthlyVol = annualVol / Math.sqrt(12);

  const netWorthByMonth: number[][] = Array.from({ length: months }, () => []);
  const endNetWorth: number[] = [];
  const minCash: number[] = [];
  const goalHits = new Map<
    string,
    { title: string; key: string; hits: number; shortfalls: number[] }
  >();
  let floorHeld = 0;
  let solvent = 0;

  const series = new Array<number>(months);

  for (let path = 0; path < paths; path += 1) {
    for (let month = 0; month < months; month += 1) {
      series[month] = Math.exp(monthlyDrift + monthlyVol * normal(random)) - 1;
    }
    const result: ForecastResult = runProjection(input, { returnSeries: series });

    for (let month = 0; month < months; month += 1) {
      netWorthByMonth[month]!.push(result.points[month]!.netWorth);
    }
    endNetWorth.push(result.endNetWorth);
    minCash.push(result.minCash.value);
    if (!result.firstFloorBreach) floorHeld += 1;
    if (!result.points.some((point) => point.cashNegative)) solvent += 1;

    for (const outcome of result.goalOutcomes) {
      const entry = goalHits.get(outcome.id) ?? {
        title: outcome.title,
        key: outcome.date,
        hits: 0,
        shortfalls: [],
      };
      if (outcome.fundedOnTime) entry.hits += 1;
      else entry.shortfalls.push(outcome.shortfall);
      goalHits.set(outcome.id, entry);
    }
  }

  const fan = netWorthByMonth.map((values, index) => {
    const sorted = [...values].sort((a, b) => a - b);
    const point = runProjectionLabel(input, index);
    return {
      month: index + 1,
      key: point.key,
      label: point.label,
      p10: percentile(sorted, 0.1),
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
    };
  });

  const sortedEnd = [...endNetWorth].sort((a, b) => a - b);
  const sortedMin = [...minCash].sort((a, b) => a - b);

  return {
    paths,
    months,
    returnPct: input.assumptions.investmentReturnPct,
    volatilityPct: input.assumptions.volatilityPct,
    fan,
    endNetWorth: {
      p10: percentile(sortedEnd, 0.1),
      p50: percentile(sortedEnd, 0.5),
      p90: percentile(sortedEnd, 0.9),
    },
    minCash: {
      p10: percentile(sortedMin, 0.1),
      p50: percentile(sortedMin, 0.5),
      p90: percentile(sortedMin, 0.9),
    },
    floorHeldPct: (floorHeld / paths) * 100,
    solventPct: (solvent / paths) * 100,
    goals: Array.from(goalHits.entries()).map(([id, entry]) => ({
      id,
      title: entry.title,
      key: entry.key,
      probability: (entry.hits / paths) * 100,
      medianShortfall: medianOf(entry.shortfalls),
    })),
  };
}

function medianOf(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Month labels come from a single cheap deterministic projection. */
const labelCache = new WeakMap<ForecastInput, { key: string; label: string }[]>();

function runProjectionLabel(input: ForecastInput, index: number) {
  let labels = labelCache.get(input);
  if (!labels) {
    labels = runProjection(input).points.map((point) => ({ key: point.key, label: point.label }));
    labelCache.set(input, labels);
  }
  return labels[index] ?? { key: "", label: "" };
}
