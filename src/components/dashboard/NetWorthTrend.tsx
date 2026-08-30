import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/SectionHeader";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import type { SnapshotRow } from "@/hooks/useFinancials";

const RANGES = [
  { key: "3M", months: 3 },
  { key: "6M", months: 6 },
  { key: "1Y", months: 12 },
  { key: "All", months: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

export function NetWorthTrend({
  snapshots,
  base,
  loading,
}: {
  snapshots: SnapshotRow[];
  base: string;
  loading: boolean;
}) {
  const [range, setRange] = useState<RangeKey>("6M");

  const ordered = useMemo(
    () => [...snapshots].sort((a, b) => a.as_of.localeCompare(b.as_of)),
    [snapshots],
  );

  const data = useMemo(() => {
    const months = RANGES.find((option) => option.key === range)?.months ?? null;
    if (!months) return ordered;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const iso = cutoff.toISOString().slice(0, 10);
    return ordered.filter((row) => row.as_of >= iso);
  }, [ordered, range]);

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Net worth over time"
        action={
          <div className="inline-flex rounded-md border border-border p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRange(option.key)}
                className={cn(
                  "num flex items-center rounded-[4px] px-3 py-1 text-xs transition-colors coarse:min-h-10 lg:px-2.5",
                  range === option.key
                    ? "bg-gold-soft text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.key}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : ordered.length < 2 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed border-border px-6 text-center">
          <p className="text-sm text-foreground">History starts building from today</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {ordered.length === 1
              ? `One snapshot recorded, on ${formatDate(ordered[0]!.as_of, "short")}. A second one is written the next day you open the app, and the curve appears then.`
              : "A household snapshot is written each day you open the dashboard. No history is invented before that."}
          </p>
        </div>
      ) : data.length < 2 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-md border border-dashed border-border px-6 text-center">
          <p className="text-sm text-foreground">Nothing recorded in this window</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Snapshots exist from {formatDate(ordered[0]!.as_of, "short")}. Try a longer range.
          </p>
        </div>
      ) : (
        <NetWorthChart data={data} base={base} />
      )}
    </section>
  );
}
