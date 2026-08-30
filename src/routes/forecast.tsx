import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, GitCompare, LineChart } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { AssumptionPanel } from "@/components/forecast/AssumptionPanel";
import { ExpensePlanTable } from "@/components/forecast/ExpensePlanTable";
import { IncomeTable } from "@/components/forecast/IncomeTable";
import {
  NetWorthProjectionChart,
  RunwayChart,
  SurplusChart,
} from "@/components/forecast/ProjectionCharts";
import { useAssumptions } from "@/hooks/useAssumptions";
import { useProjection } from "@/hooks/usePlanning";
import { monthKeyLabel } from "@/lib/forecast";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Forecast — Ebeid Family Office" },
      {
        name: "description",
        content:
          "A five-year monthly cashflow projection built from recorded income, outgoings, liabilities and goals — with deficit months, the cash runway and the reserve floor made visible.",
      },
      { property: "og:title", content: "Forecast — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Sixty months of projected net worth, surplus and liquidity, with every goal purchase marked on the line.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForecastPage,
});

function ForecastPage() {
  const [assumptions, setAssumptions] = useAssumptions();
  const { source, result } = useProjection(assumptions);
  const base = source.input.base;

  const goalOutcomes = result.goalOutcomes;
  const onTime = goalOutcomes.filter((goal) => goal.fundedOnTime).length;

  const deficitSummary = useMemo(() => {
    if (!result.firstDeficitMonth) return "No month where outgoings exceed income.";
    return `First in ${result.firstDeficitMonth.label} — ${formatMoney(Math.abs(result.firstDeficitMonth.surplus), base, { decimals: 0 })} short.`;
  }, [result.firstDeficitMonth, base]);

  return (
    <AppShell
      title="Forecast"
      description="Sixty months projected from recorded income, outgoings, debts and goals. Nothing here is modelled from an invented figure."
      actions={
        <Button size="sm" variant="secondary" asChild>
          <Link to="/scenarios">
            <GitCompare className="mr-1.5 h-3.5 w-3.5" />
            Compare scenarios
          </Link>
        </Button>
      }
    >
      {!source.hasData ? (
        <EmptyState
          icon={<LineChart className="h-4 w-4" />}
          title="Nothing to project yet"
          body="The forecast runs on what you have recorded: accounts and assets for the opening position, income streams for the top line, planned outgoings for the costs, and goals for the step-downs. Add an account and an income stream to start."
          action={
            <Button size="sm" asChild>
              <Link to="/accounts">Add an account</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Net worth in 5 years"
              value={formatMoney(result.endNetWorth, base, { decimals: 0 })}
              definition="Projected net worth at the end of the 60-month projection, on the assumptions set on this page."
              sub={`${formatMoney(result.endLiquid, base, { decimals: 0 })} of it liquid`}
              tone="gold"
            />
            <StatTile
              label="Lowest cash point"
              value={formatMoney(result.minCash.value, base, { decimals: 0 })}
              definition="The thinnest the household's cash gets at any point in the projection, and when."
              sub={monthKeyLabel(result.minCash.key)}
              tone={result.minCash.value < 0 ? "loss" : "neutral"}
            />
            <StatTile
              label="Deficit months"
              value={String(result.deficitMonthCount)}
              definition="Months where income does not cover outgoings and debt service. Each one has to be funded from cash."
              sub={deficitSummary}
              tone={result.deficitMonthCount > 0 ? "loss" : "gain"}
            />
            <StatTile
              label="Goals landing on time"
              value={goalOutcomes.length ? `${onTime} of ${goalOutcomes.length}` : "None dated"}
              definition="Dated, priced goals the projection funds in full on their target date."
              sub={
                goalOutcomes.length
                  ? onTime === goalOutcomes.length
                    ? "Every dated goal is funded"
                    : "Some goals are short — see below"
                  : "Add target dates to test them"
              }
              tone={goalOutcomes.length && onTime < goalOutcomes.length ? "loss" : "neutral"}
            />
          </div>

          {result.breakingPoint && (
            <p className="flex items-start gap-2 rounded-md border border-loss/30 bg-loss/10 px-4 py-3 text-xs leading-relaxed text-loss">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="uppercase tracking-[0.08em]">Where the plan first breaks</span> ·{" "}
                {monthKeyLabel(result.breakingPoint.key)}: {result.breakingPoint.reason}
              </span>
            </p>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="space-y-6">
              <section className="hairline rounded-lg bg-surface p-4">
                <SectionHeader
                  title="Projected net worth"
                  description="Each dashed gold line is a goal completing — the step down is what that wish costs the trajectory."
                />
                <NetWorthProjectionChart points={result.points} base={base} />
              </section>

              <section className="hairline rounded-lg bg-surface p-4">
                <SectionHeader
                  title="Monthly surplus"
                  description="Red bars are months where committed outflows exceed income."
                />
                <SurplusChart points={result.points} base={base} />
              </section>

              <section className="hairline rounded-lg bg-surface p-4">
                <SectionHeader
                  title="Cash runway"
                  description={`Gold is spendable cash, grey is total liquid assets, and the dashed red line is the ${assumptions.reserveTargetMonths}-month reserve floor.`}
                />
                <RunwayChart points={result.points} base={base} />
                {result.firstFloorBreach ? (
                  <p className="mt-3 text-[0.7rem] leading-relaxed text-loss">
                    Cash first drops below the reserve floor in {result.firstFloorBreach.label}, at{" "}
                    {formatMoney(result.firstFloorBreach.cash, base, { decimals: 0 })} against a
                    floor of{" "}
                    {formatMoney(result.firstFloorBreach.reserveFloor, base, { decimals: 0 })}.
                  </p>
                ) : (
                  <p className="mt-3 text-[0.7rem] text-muted-foreground">
                    Cash stays above the reserve floor for the whole projection.
                  </p>
                )}
              </section>

              {goalOutcomes.length > 0 && (
                <section className="hairline rounded-lg bg-surface p-4">
                  <SectionHeader
                    title="Goal funding"
                    description="Whether the cash is there on the target date, on these assumptions."
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[30rem] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="eyebrow py-2 font-normal">Goal</th>
                          <th className="eyebrow py-2 font-normal">Lands</th>
                          <th className="eyebrow py-2 text-right font-normal">Cash needed</th>
                          <th className="eyebrow py-2 text-right font-normal">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goalOutcomes.map((goal) => (
                          <tr key={goal.id} className="border-b border-border/60 last:border-0">
                            <td className="py-2 text-foreground">{goal.title}</td>
                            <td className="py-2 text-muted-foreground">
                              {monthKeyLabel(goal.date)}
                            </td>
                            <td className="num py-2 text-right">
                              {formatMoney(goal.cashOutflow, base, { decimals: 0 })}
                            </td>
                            <td
                              className={cn(
                                "num py-2 text-right",
                                goal.fundedOnTime ? "text-gain" : "text-loss",
                              )}
                            >
                              {goal.fundedOnTime
                                ? "Funded"
                                : `${formatMoney(goal.shortfall, base, { decimals: 0 })} short`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {(source.gaps.length > 0 || result.notes.length > 0) && (
                <section className="hairline rounded-lg bg-surface-raised p-4">
                  <p className="eyebrow">What this projection cannot see</p>
                  <ul className="mt-2 space-y-1.5 text-[0.7rem] leading-relaxed text-muted-foreground">
                    {source.gaps.map((gap) => (
                      <li key={gap}>· {gap}</li>
                    ))}
                    {result.notes.map((note) => (
                      <li key={note}>· {note}</li>
                    ))}
                  </ul>
                </section>
              )}

              <IncomeTable />
              <ExpensePlanTable assumptions={assumptions} />
            </div>

            <div className="xl:sticky xl:top-6 xl:self-start">
              <AssumptionPanel value={assumptions} onChange={setAssumptions} />
              <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
                A projection is arithmetic on assumptions, not a forecast of what will happen. It is
                an information and modelling tool, not regulated advice.
              </p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
