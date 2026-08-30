/**
 * Running saved scenarios against the baseline.
 *
 * A scenario is stored as a definition — a preset key, the parameters the user
 * supplied, and any assumption overrides — never as a frozen set of results.
 * Everything is recomputed from today's recorded position, so a comparison
 * saved last month reflects this month's balances rather than stale output.
 */
import {
  headlineOf,
  runProjection,
  type ForecastAssumptions,
  type ForecastHeadline,
  type ForecastInput,
  type ForecastResult,
  type ForecastShocks,
} from "./forecast";
import {
  parseDefinition,
  presetByKey,
  resolveDefinition,
  type ScenarioContext,
  type ScenarioDefinition,
} from "./scenario-presets";

/** The columns of `scenarios` this module needs — kept free of hook types. */
export type SavedScenarioRow = {
  id: string;
  name: string;
  description: string | null;
  assumptions: unknown;
  preset_key: string | null;
  sort_order: number;
};

export type ScenarioRun = {
  id: string;
  name: string;
  description: string | null;
  definition: ScenarioDefinition;
  /** One line describing exactly what was changed. */
  summary: string;
  /** Why the preset cannot bite, given what the household has recorded. */
  unavailable: string | null;
  assumptions: ForecastAssumptions;
  shocks: ForecastShocks;
  result: ForecastResult;
  headline: ForecastHeadline;
};

export type ScenarioDelta = {
  netWorth: number;
  minCash: number;
  deficitMonths: number;
  goalsOnTime: number;
};

export function runScenario(
  row: SavedScenarioRow,
  input: ForecastInput,
  ctx: ScenarioContext,
  baseline: ForecastAssumptions,
): ScenarioRun {
  const definition = parseDefinition(row.assumptions);
  const preset = presetByKey(definition.presetKey ?? row.preset_key);
  const resolved = resolveDefinition(
    { ...definition, presetKey: definition.presetKey ?? row.preset_key },
    ctx,
  );
  const assumptions: ForecastAssumptions = { ...baseline, ...resolved.assumptions };
  const result = runProjection({ ...input, assumptions, shocks: resolved.shocks });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    definition,
    summary: resolved.summary,
    unavailable: preset ? preset.unavailable(ctx) : null,
    assumptions,
    shocks: resolved.shocks,
    result,
    headline: headlineOf(result),
  };
}

export function deltaOf(scenario: ForecastHeadline, baseline: ForecastHeadline): ScenarioDelta {
  return {
    netWorth: scenario.endNetWorth - baseline.endNetWorth,
    minCash: scenario.minCash - baseline.minCash,
    deficitMonths: scenario.deficitMonths - baseline.deficitMonths,
    goalsOnTime: scenario.goalsOnTime - baseline.goalsOnTime,
  };
}

export type GoalComparisonRow = {
  id: string;
  title: string;
  baseline: { onTime: boolean; shortfall: number } | null;
  scenario: { onTime: boolean; shortfall: number } | null;
};

/** Goal-by-goal: does it still land, and if not by how much does it miss. */
export function compareGoals(
  baseline: ForecastResult,
  scenario: ForecastResult,
): GoalComparisonRow[] {
  const ids = new Map<string, string>();
  for (const goal of baseline.goalOutcomes) ids.set(goal.id, goal.title);
  for (const goal of scenario.goalOutcomes) ids.set(goal.id, goal.title);

  return Array.from(ids.entries()).map(([id, title]) => {
    const before = baseline.goalOutcomes.find((goal) => goal.id === id);
    const after = scenario.goalOutcomes.find((goal) => goal.id === id);
    return {
      id,
      title,
      baseline: before ? { onTime: before.fundedOnTime, shortfall: before.shortfall } : null,
      scenario: after ? { onTime: after.fundedOnTime, shortfall: after.shortfall } : null,
    };
  });
}

/** Assumption overrides a scenario may carry on top of its preset. */
export const OVERRIDE_FIELDS = [
  { key: "investmentReturnPct", label: "Investment return", suffix: "%" },
  { key: "inflationPct", label: "Inflation", suffix: "%" },
  { key: "salaryGrowthPct", label: "Salary growth", suffix: "%" },
] as const;

export type OverrideKey = (typeof OVERRIDE_FIELDS)[number]["key"];
