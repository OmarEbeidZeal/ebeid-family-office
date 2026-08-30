import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatMoney } from "@/lib/format";
import type { ForecastPoint } from "@/lib/forecast";

type ChartProps = { points: ForecastPoint[]; base: string };

const AXIS = { fill: "var(--muted-foreground)", fontSize: 11 } as const;

function tickInterval(points: ForecastPoint[]) {
  return Math.max(0, Math.floor(points.length / 6) - 1);
}

function Frame({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; value: string; tone?: string }[];
}) {
  return (
    <div className="hairline rounded-md bg-popover px-3 py-2">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <p key={row.name} className="flex items-baseline justify-between gap-4 text-xs">
            <span className="text-muted-foreground">{row.name}</span>
            <span className={`num ${row.tone ?? "text-foreground"}`}>{row.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Net worth over the projection, with every goal purchase marked on the line. */
export function NetWorthProjectionChart({ points, base }: ChartProps) {
  const goalMonths = points.filter((point) => point.events.some((event) => event.kind === "goal"));
  const values = points.map((point) => point.netWorth);
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.1, 1);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="projectionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.26} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={tickInterval(points)}
            tick={AXIS}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            domain={[min - pad, max + pad]}
            tick={AXIS}
            tickFormatter={(value: number) => formatCompact(value, base)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              const point = active
                ? (payload?.[0]?.payload as ForecastPoint | undefined)
                : undefined;
              if (!point) return null;
              return (
                <Frame
                  label={point.label}
                  rows={[
                    {
                      name: "Net worth",
                      value: formatMoney(point.netWorth, base, { decimals: 0 }),
                    },
                    { name: "Liquid", value: formatMoney(point.liquid, base, { decimals: 0 }) },
                    ...point.events.map((event) => ({
                      name: event.title,
                      value: `−${formatMoney(Math.abs(event.amount), base, { decimals: 0 })}`,
                      tone: "text-gold",
                    })),
                  ]}
                />
              );
            }}
          />
          {goalMonths.map((point, index) => {
            const title = point.events.find((event) => event.kind === "goal")?.title ?? "";
            return (
              <ReferenceLine
                key={point.key}
                x={point.label}
                stroke="var(--gold)"
                strokeDasharray="3 3"
                strokeOpacity={0.8}
                label={{
                  // Goals a few months apart would otherwise print their names on
                  // top of each other; each successive marker drops a line.
                  value: title.length > 18 ? `${title.slice(0, 17)}…` : title,
                  position: "insideTopLeft",
                  fill: "var(--gold)",
                  fontSize: 10,
                  dy: (index % 3) * 13,
                }}
              />
            );
          })}

          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            fill="url(#projectionFill)"
            dot={false}
            activeDot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Monthly surplus, with deficit months in red — the page's most useful signal. */
export function SurplusChart({ points, base }: ChartProps) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={tickInterval(points)}
            tick={AXIS}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            tickFormatter={(value: number) => formatCompact(value, base)}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            content={({ active, payload }) => {
              const point = active
                ? (payload?.[0]?.payload as ForecastPoint | undefined)
                : undefined;
              if (!point) return null;
              return (
                <Frame
                  label={point.label}
                  rows={[
                    { name: "Income", value: formatMoney(point.income, base, { decimals: 0 }) },
                    {
                      name: "Outgoings",
                      value: formatMoney(point.expenses, base, { decimals: 0 }),
                    },
                    {
                      name: "Debt service",
                      value: formatMoney(point.debtService, base, { decimals: 0 }),
                    },
                    {
                      name: point.surplus < 0 ? "Deficit" : "Surplus",
                      value: formatMoney(point.surplus, base, { decimals: 0 }),
                      tone: point.surplus < 0 ? "text-loss" : "text-gain",
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="surplus" radius={[2, 2, 0, 0]}>
            {points.map((point) => (
              <Cell
                key={point.key}
                fill={point.surplus < 0 ? "var(--loss)" : "var(--chart-2)"}
                fillOpacity={point.surplus < 0 ? 0.9 : 0.65}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Liquid assets against the reserve floor, with breaches called out. */
export function RunwayChart({ points, base }: ChartProps) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={tickInterval(points)}
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
              const point = active
                ? (payload?.[0]?.payload as ForecastPoint | undefined)
                : undefined;
              if (!point) return null;
              return (
                <Frame
                  label={point.label}
                  rows={[
                    { name: "Cash", value: formatMoney(point.cash, base, { decimals: 0 }) },
                    {
                      name: "Liquid total",
                      value: formatMoney(point.liquid, base, { decimals: 0 }),
                    },
                    {
                      name: "Reserve floor",
                      value: formatMoney(point.reserveFloor, base, { decimals: 0 }),
                      tone: point.belowFloor ? "text-loss" : "text-muted-foreground",
                    },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="reserveFloor"
            stroke="var(--loss)"
            strokeDasharray="4 4"
            strokeWidth={1}
            dot={false}
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="cash"
            stroke="var(--gold)"
            strokeWidth={1.5}
            dot={(props: { cx?: number; cy?: number; payload?: ForecastPoint }) => {
              const point = props.payload;
              if (!point?.belowFloor || props.cx === undefined || props.cy === undefined) {
                return <g key={`${point?.key ?? "dot"}-empty`} />;
              }
              return (
                <circle
                  key={point.key}
                  cx={props.cx}
                  cy={props.cy}
                  r={2.5}
                  fill="var(--loss)"
                  stroke="none"
                />
              );
            }}
            activeDot={{ r: 3, fill: "var(--gold)", strokeWidth: 0 }}
          />
          <Line
            type="monotone"
            dataKey="liquid"
            stroke="var(--chart-3)"
            strokeWidth={1}
            strokeOpacity={0.7}
            dot={false}
            activeDot={{ r: 3, fill: "var(--chart-3)", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
