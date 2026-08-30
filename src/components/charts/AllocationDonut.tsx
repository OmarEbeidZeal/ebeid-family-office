import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatMoney, formatPercent } from "@/lib/format";
import type { Slice } from "@/hooks/useNetWorth";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

export function AllocationDonut({
  slices,
  base,
  centreLabel,
  emphasise,
}: {
  slices: Slice[];
  base: string;
  centreLabel: string;
  /** Slice names drawn in the loss colour — used for soft-currency exposure. */
  emphasise?: string[];
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const colourFor = (name: string, index: number) =>
    emphasise?.includes(name) ? "var(--loss)" : (PALETTE[index % PALETTE.length] as string);

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="relative h-40 w-40 shrink-0 self-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={1.5}
              stroke="var(--background)"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.name} fill={colourFor(slice.name, index)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
            {centreLabel}
          </span>
          <span className="num mt-1 text-sm font-light text-foreground">
            {formatMoney(total, base, { decimals: 0 })}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: colourFor(slice.name, index) }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground/85">{slice.name}</span>
            <span className="num text-xs text-muted-foreground">
              {formatPercent(total > 0 ? (slice.value / total) * 100 : 0)}
            </span>
            <span className="num w-24 text-right text-xs text-foreground/85">
              {formatMoney(slice.value, base, { decimals: 0 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
