import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatReadableMoney } from "@/lib/format";
import type { RentPoint } from "@/lib/documents/analysis";

/**
 * What rent has cost, year by year — the honest input to a rent-versus-buy
 * conversation, and the one figure a household never has to hand.
 */
export function RentTrajectoryChart({ points, base }: { points: RentPoint[]; base: string }) {
  if (points.length === 0) return null;
  const thisYear = new Date().getFullYear();

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => formatReadableMoney(value, base)}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(value: number, _name, item) => [
              `${formatMoney(value, base, { decimals: 0 })} a month`,
              (item?.payload as RentPoint | undefined)?.address ?? "Rent",
            ]}
          />
          <Bar dataKey="monthly" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {points.map((point) => (
              <Cell
                key={`${point.year}-${point.address}`}
                fill={point.year === thisYear ? "var(--gold)" : "var(--chart-2)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
