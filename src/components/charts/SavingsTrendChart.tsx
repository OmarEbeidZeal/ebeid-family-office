import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatPercent } from "@/lib/format";
import { monthLabel, type MonthTotals } from "@/lib/spending";

function ChartTooltip({
  active,
  payload,
  base,
}: {
  active?: boolean;
  payload?: { payload: MonthTotals }[];
  base: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="hairline rounded-md bg-popover px-3 py-2 text-xs">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
        {monthLabel(point.month, "long")}
      </p>
      <p className="num mt-1 text-foreground">
        {point.savingsRate === null ? "No income recorded" : formatPercent(point.savingsRate, 0)}
      </p>
      <p className="num mt-0.5 text-muted-foreground">
        Burn {formatMoney(point.expenses, base, { decimals: 0 })}
      </p>
    </div>
  );
}

export function SavingsTrendChart({ data, base }: { data: MonthTotals[]; base: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={16}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => `${Math.round(value)}%`}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={<ChartTooltip base={base} />}
          />
          <Line
            type="monotone"
            dataKey="savingsRate"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            connectNulls
            dot={{ r: 2, fill: "var(--chart-1)", strokeWidth: 0 }}
            activeDot={{ r: 3.5, fill: "var(--chart-1)", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
