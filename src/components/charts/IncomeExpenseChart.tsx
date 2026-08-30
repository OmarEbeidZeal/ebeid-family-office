import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatMoney } from "@/lib/format";
import type { MonthTotals } from "@/lib/spending";
import { monthLabel } from "@/lib/spending";

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
    <div className="hairline rounded-md bg-popover px-3 py-2">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
        {monthLabel(point.month, "long")}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-xs">
        <Row label="In" value={formatMoney(point.income, base, { decimals: 0 })} tone="text-gain" />
        <Row label="Out" value={formatMoney(point.expenses, base, { decimals: 0 })} />
        <Row
          label="Net"
          value={formatMoney(point.net, base, { decimals: 0 })}
          tone={point.net >= 0 ? "text-gain" : "text-loss"}
        />
      </dl>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`num ${tone ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}

export function IncomeExpenseChart({ data, base }: { data: MonthTotals[]; base: string }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={16}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => formatCompact(value, base)}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            content={<ChartTooltip base={base} />}
          />
          <Bar
            dataKey="income"
            fill="var(--gain)"
            fillOpacity={0.55}
            radius={[2, 2, 0, 0]}
            maxBarSize={18}
          />
          <Bar
            dataKey="expenses"
            fill="var(--muted-foreground)"
            fillOpacity={0.35}
            radius={[2, 2, 0, 0]}
            maxBarSize={18}
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
