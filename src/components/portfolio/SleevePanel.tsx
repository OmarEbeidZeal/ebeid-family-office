import { SectionHeader } from "@/components/SectionHeader";
import { PolicyPill } from "@/components/portfolio/PolicyPill";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent } from "@/lib/format";
import { SLEEVES, type AllocationRow } from "@/lib/policy";

/** Actual sleeve weights against the policy targets, drift shown in points. */
export function SleevePanel({
  rows,
  base,
  investableTotal,
  loading,
}: {
  rows: AllocationRow[];
  base: string;
  investableTotal: number;
  loading?: boolean;
}) {
  const notes = Object.fromEntries(SLEEVES.map((sleeve) => [sleeve.value, sleeve.note]));

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Sleeves against policy"
        description={`Weights are a share of ${formatMoney(investableTotal, base, { decimals: 0 })} of liquid investable assets — cash, ISAs, GIAs, accessible pensions and priced holdings. Property and the private stake are excluded.`}
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-3.5">
          {rows.map((row) => {
            const actual = row.actualPct ?? 0;
            const marker = row.targetPct ?? row.capPct;
            return (
              <li key={row.sleeve}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground/90">{row.label}</span>
                    {row.status !== "ok" && row.status !== "not_applicable" && (
                      <PolicyPill status={row.status} size="xs" />
                    )}
                  </div>
                  <span className="num text-xs text-muted-foreground">
                    <span className="text-foreground">
                      {row.actualPct === null ? "—" : formatPercent(row.actualPct)}
                    </span>
                    {marker !== null && (
                      <>
                        {" "}
                        · {row.targetPct !== null ? "target" : "cap"} {formatPercent(marker, 0)}
                      </>
                    )}
                    {" · "}
                    {formatMoney(row.value, base, { decimals: 0 })}
                  </span>
                </div>

                <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      row.status === "breach"
                        ? "bg-loss"
                        : row.status === "watch"
                          ? "bg-warn"
                          : "bg-gold",
                    )}
                    style={{ width: `${Math.min(100, actual)}%` }}
                  />
                  {marker !== null && (
                    <span
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-foreground/50"
                      style={{ left: `${Math.min(100, marker)}%` }}
                    />
                  )}
                </div>

                <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                  {row.driftPp !== null && Math.abs(row.driftPp) >= 5
                    ? `${Math.abs(row.driftPp).toFixed(1)}pp ${row.driftPp > 0 ? "above" : "below"} target — rule 11 calls for a rebalance at the next contribution.`
                    : notes[row.sleeve]}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
