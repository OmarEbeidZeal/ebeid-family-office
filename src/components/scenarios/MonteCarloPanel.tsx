import { useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Dices, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/SectionHeader";
import { Field, SelectNative } from "@/components/forms/FormField";
import { formatCompact, formatMoney, formatPercent } from "@/lib/format";
import type { ForecastInput } from "@/lib/forecast";
import { runMonteCarlo, type MonteCarloResult } from "@/lib/montecarlo";
import { cn } from "@/lib/utils";

const AXIS = { fill: "var(--muted-foreground)", fontSize: 11 } as const;

export type SimulationPlan = { id: string; name: string; input: ForecastInput };

type FanRow = MonteCarloResult["fan"][number] & { band: number };

/** 1,000 seeded paths over the projection — a model, presented as one. */
export function MonteCarloPanel({ plans, base }: { plans: SimulationPlan[]; base: string }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [paths, setPaths] = useState(1000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ planName: string; data: MonteCarloResult } | null>(null);

  const plan = plans.find((row) => row.id === planId) ?? plans[0];

  const run = () => {
    if (!plan) return;
    setRunning(true);
    // Yield a frame so the button can show it is working before the maths runs.
    window.setTimeout(() => {
      try {
        const data = runMonteCarlo(plan.input, { paths: Math.max(100, Math.min(5000, paths)) });
        setResult({ planName: plan.name, data });
      } finally {
        setRunning(false);
      }
    }, 20);
  };

  const fan: FanRow[] = (result?.data.fan ?? []).map((row) => ({
    ...row,
    band: Math.max(0, row.p90 - row.p10),
  }));

  return (
    <section className="hairline rounded-lg bg-surface p-4">
      <SectionHeader
        title="Monte Carlo"
        description="Draws monthly returns from the return and volatility you set, then runs the whole household projection on each path."
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
        <Field label="Plan to simulate">
          <SelectNative
            value={plan?.id ?? ""}
            onChange={setPlanId}
            options={plans.map((row) => ({ value: row.id, label: row.name }))}
          />
        </Field>
        <Field label="Paths">
          <Input
            type="number"
            min={100}
            max={5000}
            step={100}
            value={paths}
            onChange={(event) => setPaths(Number(event.target.value) || 1000)}
          />
        </Field>
        <Button onClick={run} disabled={running || !plan} className="h-9">
          {running ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Dices className="mr-1.5 h-3.5 w-3.5" />
          )}
          {running ? "Simulating…" : "Run simulation"}
        </Button>
      </div>

      {!result ? (
        <p className="mt-4 text-[0.72rem] leading-relaxed text-muted-foreground">
          Nothing is simulated until you ask for it. The result is a probability produced by a model
          from assumptions you chose — an expected return, a volatility — not a prediction of what
          markets will do.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            {result.data.paths.toLocaleString("en-GB")} paths on {result.planName}, at{" "}
            {formatPercent(result.data.returnPct)} expected return and{" "}
            {formatPercent(result.data.volatilityPct)} volatility. Seeded, so the same inputs give
            the same numbers.
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fan} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(0, Math.floor(fan.length / 6) - 1)}
                  tick={AXIS}
                />
                <YAxis
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS}
                  tickFormatter={(value: number) => formatCompact(value, base)}
                />
                <Tooltip
                  cursor={{ stroke: "var(--border-strong)" }}
                  content={({ active, payload }) => {
                    const row = active ? (payload?.[0]?.payload as FanRow | undefined) : undefined;
                    if (!row) return null;
                    return (
                      <div className="hairline rounded-md bg-popover px-3 py-2">
                        <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                          {row.label}
                        </p>
                        {(
                          [
                            ["90th percentile", row.p90],
                            ["Median", row.p50],
                            ["10th percentile", row.p10],
                          ] as const
                        ).map(([name, value]) => (
                          <p
                            key={name}
                            className="flex items-baseline justify-between gap-4 text-xs"
                          >
                            <span className="text-muted-foreground">{name}</span>
                            <span className="num">{formatMoney(value, base, { decimals: 0 })}</span>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Area
                  dataKey="p10"
                  stackId="fan"
                  stroke="none"
                  fill="transparent"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="band"
                  stackId="fan"
                  stroke="none"
                  fill="var(--gold)"
                  fillOpacity={0.14}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="p50"
                  type="monotone"
                  stroke="var(--gold)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Outcome
              label="Net worth at 5 years"
              value={formatMoney(result.data.endNetWorth.p50, base, { decimals: 0 })}
              sub={`10th ${formatMoney(result.data.endNetWorth.p10, base, { decimals: 0 })} · 90th ${formatMoney(result.data.endNetWorth.p90, base, { decimals: 0 })}`}
            />
            <Outcome
              label="Lowest cash point"
              value={formatMoney(result.data.minCash.p50, base, { decimals: 0 })}
              sub={`10th ${formatMoney(result.data.minCash.p10, base, { decimals: 0 })} · 90th ${formatMoney(result.data.minCash.p90, base, { decimals: 0 })}`}
              tone={result.data.minCash.p10 < 0 ? "loss" : "neutral"}
            />
            <Outcome
              label="Paths staying solvent"
              value={formatPercent(result.data.solventPct)}
              sub={`Reserve floor held on ${formatPercent(result.data.floorHeldPct)} of paths`}
              tone={result.data.solventPct < 90 ? "loss" : "gain"}
            />
          </div>

          {result.data.goals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="eyebrow py-2 font-normal">Goal</th>
                    <th className="eyebrow py-2 text-right font-normal">Funded on time</th>
                    <th className="eyebrow py-2 text-right font-normal">Median miss</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.goals.map((goal) => (
                    <tr key={goal.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 text-foreground">{goal.title}</td>
                      <td
                        className={cn(
                          "num py-2 text-right",
                          goal.probability >= 80
                            ? "text-gain"
                            : goal.probability >= 50
                              ? "text-gold"
                              : "text-loss",
                        )}
                      >
                        {formatPercent(goal.probability, 0)}
                      </td>
                      <td className="num py-2 text-right text-muted-foreground">
                        {goal.medianShortfall > 0
                          ? formatMoney(goal.medianShortfall, base, { decimals: 0 })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[0.7rem] text-muted-foreground">
              No dated, priced goals fall inside the projection window, so there is nothing to
              measure a funding probability against.
            </p>
          )}

          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            A probability here is only as good as the two numbers behind it. It assumes returns are
            independent month to month and normally distributed in log terms, which real markets are
            not. Treat it as a stress test, not a forecast, and confirm any decision with an
            FCA-authorised adviser.
          </p>
        </div>
      )}
    </section>
  );
}

function Outcome({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "gain" | "loss" | "neutral";
}) {
  return (
    <div className="hairline rounded-md bg-surface-raised px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "num mt-1 text-sm",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{sub}</p>
    </div>
  );
}
