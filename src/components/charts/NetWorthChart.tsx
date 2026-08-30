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

export function NetWorthChart({ data, currency }: { data: NetWorthPoint[]; currency: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="as_of"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString("en-GB", { month: "short", day: "numeric" })
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => formatCompact(value, currency)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              color: "var(--color-popover-foreground)",
              fontSize: 12,
            }}
            labelFormatter={(value: string) =>
              new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" })
            }
            formatter={(value: number) => [
              formatMoney(value, currency, { decimals: 0 }),
              "Net worth",
            ]}
          />
          <Area
            type="monotone"
            dataKey="net_worth"
            stroke="var(--color-gold)"
            strokeWidth={1.5}
            fill="url(#netWorthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
