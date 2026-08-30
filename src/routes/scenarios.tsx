import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GitCompare, LineChart, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BaselineColumn, ScenarioColumn } from "@/components/scenarios/ComparisonColumns";
import { MonteCarloPanel, type SimulationPlan } from "@/components/scenarios/MonteCarloPanel";
import { ScenarioSheet } from "@/components/scenarios/ScenarioSheet";
import { useAssumptions } from "@/hooks/useAssumptions";
import { useScenarios } from "@/hooks/useFinancials";
import { useProjection } from "@/hooks/usePlanning";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { useQuickAdd } from "@/lib/quick-add";
import { headlineOf } from "@/lib/forecast";
import { SCENARIO_PRESETS } from "@/lib/scenario-presets";
import { runScenario, type SavedScenarioRow } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scenarios")({
  head: () => ({
    meta: [
      { title: "Scenarios — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Named what-if comparisons against the household baseline: buy earlier, rent longer, a liquidity event, a drawdown, a currency shock — with a Monte Carlo on the portfolio.",
      },
      { property: "og:title", content: "Scenarios — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Side-by-side comparisons against the baseline projection, with goal funding probabilities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScenariosPage,
});

const MAX_COMPARED = 3;
/** Stable identity while the query is still loading, so the memo below can settle. */
const NO_SCENARIOS: SavedScenarioRow[] = [];

function ScenariosPage() {
  const [assumptions] = useAssumptions();
  const { source, result: baseline } = useProjection(assumptions);
  const { data, isLoading } = useScenarios();
  const rows = (data ?? NO_SCENARIOS) as SavedScenarioRow[];
  const remove = useDeleteRow("scenarios", "scenarios", "Scenario");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedScenarioRow | null>(null);
  const [initialPreset, setInitialPreset] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useQuickAdd("scenario", () => {
    setEditing(null);
    setInitialPreset(null);
    setOpen(true);
  });

  const base = source.input.base;
  const ctx = source.scenarioContext;

  const runs = useMemo(
    () =>
      rows
        .filter((row) => !row.is_baseline)
        .map((row) => runScenario(row, source.input, ctx, assumptions)),
    [rows, source.input, ctx, assumptions],
  );

  // Default to the first few scenarios, and never keep a deleted one selected.
  // Returning `prev` unchanged whenever the ids match keeps this from looping.
  useEffect(() => {
    setSelected((prev) => {
      const live = prev.filter((id) => runs.some((run) => run.id === id));
      const next = live.length ? live : runs.slice(0, 2).map((run) => run.id);
      const same = next.length === prev.length && next.every((id, index) => prev[index] === id);
      return same ? prev : next;
    });
  }, [runs]);

  const compared = runs.filter((run) => selected.includes(run.id)).slice(0, MAX_COMPARED);
  const baselineHeadline = headlineOf(baseline);

  const plans: SimulationPlan[] = [
    { id: "baseline", name: "Baseline", input: { ...source.input, assumptions } },
    ...compared.map((run) => ({
      id: run.id,
      name: run.name,
      input: { ...source.input, assumptions: run.assumptions, shocks: run.shocks },
    })),
  ];

  const startPreset = (key: string | null) => {
    setEditing(null);
    setInitialPreset(key);
    setOpen(true);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((row) => row !== id);
      return [...prev, id].slice(-MAX_COMPARED);
    });

  return (
    <AppShell
      title="Scenarios"
      description="The baseline with one thing changed, saved and named so it can be argued with later."
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link to="/forecast">
              <LineChart className="mr-1.5 h-3.5 w-3.5" />
              Baseline forecast
            </Link>
          </Button>
          <Button size="sm" onClick={() => startPreset(null)} disabled={!source.hasData}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New scenario
          </Button>
        </div>
      }
    >
      {!source.hasData ? (
        <EmptyState
          icon={<GitCompare className="h-4 w-4" />}
          title="Nothing to compare against yet"
          body="A scenario is the baseline projection with one thing changed, so there has to be a baseline first. Record your accounts, an income stream and the outgoings you know about, then come back and stress them."
          action={
            <Button size="sm" asChild>
              <Link to="/forecast">Build the baseline</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <section>
            <SectionHeader
              title="Start from a preset"
              description="Each one asks for the figures it cannot know — a date, a valuation, a monthly cost — rather than assuming them."
            />
            <div className="flex flex-wrap gap-2">
              {SCENARIO_PRESETS.map((preset) => {
                const blocked = preset.unavailable(ctx);
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => startPreset(preset.key)}
                    title={blocked ?? preset.headline}
                    className={cn(
                      "hairline rounded-md bg-surface px-3 py-2 text-left text-xs transition-colors hover:border-border-strong hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      blocked && "opacity-55",
                    )}
                  >
                    <span className="block text-foreground">{preset.name}</span>
                    <span className="mt-0.5 block text-[0.68rem] text-muted-foreground">
                      {blocked ? blocked : preset.group}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeader
              title="Side by side"
              description={`Baseline against up to ${MAX_COMPARED} scenarios, recomputed from today's position every time this page loads.`}
            />
            {!isLoading && !runs.length ? (
              <EmptyState
                icon={<GitCompare className="h-4 w-4" />}
                title="No saved scenarios"
                body="Pick a preset above — buying the London flat in 2027 against 2029, a Zeal liquidity event, a 30% drawdown, Haya's income pausing — or build your own from assumption changes alone."
                action={
                  <Button size="sm" onClick={() => startPreset("goal_move")}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Model a goal moving
                  </Button>
                }
              />
            ) : (
              <>
                {runs.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {runs.map((run) => (
                      <label
                        key={run.id}
                        className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Checkbox
                          checked={selected.includes(run.id)}
                          onCheckedChange={() => toggle(run.id)}
                          aria-label={`Compare ${run.name}`}
                        />
                        <span className={cn(selected.includes(run.id) && "text-foreground")}>
                          {run.name}
                        </span>
                      </label>
                    ))}
                    <span className="text-[0.68rem] text-muted-foreground/70">
                      Up to {MAX_COMPARED} at once
                    </span>
                  </div>
                )}

                <div className="-mx-4 grid grid-flow-col auto-cols-[minmax(17rem,1fr)] gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                  <BaselineColumn
                    base={base}
                    headline={baselineHeadline}
                    reserveMonths={assumptions.reserveTargetMonths}
                  />
                  {compared.map((run) => (
                    <ScenarioColumn
                      key={run.id}
                      run={run}
                      base={base}
                      baselineHeadline={baselineHeadline}
                      baselineResult={baseline}
                      onEdit={() => {
                        const row = rows.find((item) => item.id === run.id);
                        setEditing((row as SavedScenarioRow | undefined) ?? null);
                        setInitialPreset(null);
                        setOpen(true);
                      }}
                      onDelete={() => remove.mutate(run.id)}
                    />
                  ))}
                </div>

                {runs.length > compared.length && (
                  <p className="mt-2 text-[0.68rem] text-muted-foreground">
                    {runs.length - compared.length} more saved scenario
                    {runs.length - compared.length === 1 ? "" : "s"} — tick one above to bring it
                    into the comparison.
                  </p>
                )}
              </>
            )}
          </section>

          <MonteCarloPanel plans={plans} base={base} />

          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            Scenarios are arithmetic on stated assumptions. They are an information and modelling
            tool, not regulated advice — confirm any decision with an FCA-authorised adviser.
          </p>
        </div>
      )}

      <ScenarioSheet
        open={open}
        onOpenChange={setOpen}
        scenario={editing}
        initialPreset={initialPreset}
        ctx={ctx}
        baseAssumptions={assumptions}
        nextSortOrder={rows.length}
      />
    </AppShell>
  );
}
