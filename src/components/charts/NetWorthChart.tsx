import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatMoney } from "@/lib/format";

export type NetWorthPoint = { as_of: string; net_worth: number };

function ChartTooltip({
  active,
  payload,
  base,
}: {
  active?: boolean;
  payload?: { payload: NetWorthPoint }[];
  base: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="hairline rounded-md bg-popover px-3 py-2 shadow-none">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
        {new Date(point.as_of).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
      <p className="num mt-1 text-sm text-foreground">{formatMoney(point.net_worth, base)}</p>
    </div>
  );
}

export function NetWorthChart({ data, base }: { data: NetWorthPoint[]; base: string }) {
  const values = data.map((point) => point.net_worth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.02, 1);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="as_of"
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            }
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            domain={[min - pad, max + pad]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => formatCompact(value, base)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={<ChartTooltip base={base} />}
          />
          <Area
            type="monotone"
            dataKey="net_worth"
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            fill="url(#netWorthFill)"
            dot={data.length < 12 ? { r: 2, fill: "var(--chart-1)", strokeWidth: 0 } : false}
            activeDot={{ r: 3.5, fill: "var(--chart-1)", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
