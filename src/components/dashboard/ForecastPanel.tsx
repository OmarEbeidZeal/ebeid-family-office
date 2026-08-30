import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarRange, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssumptions } from "@/hooks/useAssumptions";
import { useProjection } from "@/hooks/usePlanning";
import { headlineOf, monthKeyLabel } from "@/lib/forecast";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/hooks/useCurrency";

/**
 * The five-year read, condensed: where net worth lands, the tightest cash
 * month, and the first month the plan breaks. Same engine and the same saved
 * assumptions as /forecast, so the two never disagree.
 */
export function ForecastPanel() {
  const [assumptions] = useAssumptions();
  const { source, result } = useProjection(assumptions);
  const { base } = useCurrency();
  const headline = headlineOf(result);

  const chartData = result.points
    .filter((_, index) => index % 3 === 0 || index === result.points.length - 1)
    .map((point) => ({
      key: point.key,
      label: monthKeyLabel(point.key),
      netWorth: Math.round(point.netWorth),
    }));

  const breach = result.firstFloorBreach;

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Five-year outlook"
        {...(source.hasData
          ? {
              description: `Projected from recorded income, outgoings, debt and goals at ${assumptions.investmentReturnPct.toFixed(1)}% assumed return.`,
            }
          : {})}
        action={
          <Link
            to="/forecast"
            className="text-xs text-muted-foreground transition-colors hover:text-gold"
          >
            Full forecast →
          </Link>
        }
      />

      {source.hasData === false ? (
        <EmptyState
          icon={<CalendarRange className="h-4 w-4" strokeWidth={1.6} />}
          title="Nothing to project yet"
          body="The projection needs at least one income stream and either a recorded outgoing or an imported month of spending. Add Omar's and Haya's income and the forecast will run 60 months forward from today's balances."
          action={
            <Link
              to="/forecast"
              className="inline-flex h-9 items-center rounded-md border border-gold-line bg-gold-soft px-4 text-sm text-gold transition-colors hover:bg-gold-soft/80"
            >
              Set up the forecast
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="h-40 w-full">
            {chartData.length === 0 ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dash-forecast" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis hide domain={["auto", "auto"]} />
                  <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                  <Tooltip
                    cursor={{ stroke: "var(--border-strong)" }}
                    contentStyle={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(value: number) => [
                      formatMoney(value, base, { decimals: 0 }),
                      "Net worth",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                    fill="url(#dash-forecast)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:gap-3">
            <div>
              <dt className="eyebrow">Net worth in 5 years</dt>
              <dd className="num mt-1 text-xl font-light text-foreground">
                {formatMoney(headline.endNetWorth, base, { decimals: 0 })}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Tightest cash month</dt>
              <dd
                className={`num mt-1 text-base font-light ${headline.minCash < 0 ? "text-loss" : "text-foreground"}`}
              >
                {formatMoney(headline.minCash, base, { decimals: 0 })}
              </dd>
              <dd className="mt-0.5 text-[0.68rem] text-muted-foreground">
                {monthKeyLabel(headline.minCashMonth)}
                {breach ? " · below the reserve floor" : ""}
              </dd>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <dt className="eyebrow">Goals landing on time</dt>
              <dd className="num mt-1 text-base font-light text-foreground">
                {headline.goalsTotal === 0
                  ? "No dated goals"
                  : `${headline.goalsOnTime} of ${headline.goalsTotal}`}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {source.hasData && headline.breakingPoint && (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-xs leading-relaxed text-loss">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The plan first breaks in {monthKeyLabel(headline.breakingPoint.key)} —{" "}
            {headline.breakingPoint.reason}
          </span>
        </p>
      )}

      {source.hasData && !headline.breakingPoint && headline.deficitMonths > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {headline.deficitMonths} of the next 60 months spend more than they earn. Reserves
            absorb it, but the run-rate is worth a look.
          </span>
        </p>
      )}

      {source.hasData && source.gaps.length > 0 && (
        <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
          {source.gaps[0]}
          {source.gaps.length > 1 ? ` (+${source.gaps.length - 1} more on the forecast page)` : ""}
        </p>
      )}
    </section>
  );
}
