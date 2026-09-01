import { SectionHeader } from "@/components/SectionHeader";
import { PolicyPill } from "@/components/portfolio/PolicyPill";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import { WRAPPER_LABELS, type Disposal, type RealisedSummary } from "@/lib/realised";

const gainTone = (value: number | null) =>
  value === null ? "text-muted-foreground" : value > 0 ? "text-gain" : value < 0 ? "text-loss" : "";

/**
 * Realised results, split by wrapper — because a £400 loss inside an ISA and
 * the same loss in a general investment account are different facts. Only the
 * second one is usable against capital gains.
 */
export function RealisedPanel({
  realised,
  disposals,
  base,
  loading,
}: {
  realised: RealisedSummary;
  disposals: Disposal[];
  base: string;
  loading?: boolean;
}) {
  const thisYearDisposals = disposals.filter((row) => row.taxYear === realised.taxYear);
  const recent = thisYearDisposals.slice(0, 6);
  const cgt = realised.cgt;
  const headroomPct =
    cgt.exemptAmount > 0
      ? Math.max(0, Math.min(100, (Math.max(cgt.netBase, 0) / cgt.exemptAmount) * 100))
      : 0;

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title={`Realised results ${realised.taxYear}`}
        description="Closed positions, replayed from the recorded trades at average cost. Capital gains tax applies to general investment accounts only."
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : realised.disposalCount === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No closed positions recorded in {realised.taxYear}. Realised gains and losses appear here
          as soon as a sell is imported from a broker statement or recorded as a trade.
        </p>
      ) : (
        <>
          <div className="rounded-md border border-border bg-surface-raised/50 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="eyebrow">Capital gains position · taxable accounts</p>
              <PolicyPill status={cgt.status} size="xs" />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="eyebrow mb-1">Gains</p>
                <p className="num text-sm text-gain">
                  {formatMoney(cgt.gainsBase, base, { decimals: 0 })}
                </p>
              </div>
              <div>
                <p className="eyebrow mb-1">Losses</p>
                <p className="num text-sm text-loss">
                  {formatMoney(cgt.lossesBase, base, { decimals: 0 })}
                </p>
              </div>
              <div>
                <p className="eyebrow mb-1">Net</p>
                <p className={cn("num text-sm", gainTone(cgt.netBase))}>
                  {formatMoney(cgt.netBase, base, { decimals: 0 })}
                </p>
              </div>
              <div>
                <p className="eyebrow mb-1">Exemption left</p>
                <p className="num text-sm text-foreground">
                  {formatMoney(cgt.headroomBase, base, { decimals: 0 })}
                </p>
              </div>
            </div>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className={cn(
                  "h-full rounded-full",
                  cgt.status === "breach" ? "bg-loss" : cgt.status === "watch" ? "bg-warn" : "bg-gold",
                )}
                style={{ width: `${headroomPct}%` }}
              />
            </div>

            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{cgt.headline}</p>
          </div>

          <ul className="mt-4 space-y-2.5">
            {realised.thisYear.map((wrapper) => (
              <li
                key={wrapper.wrapper}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2.5 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground/90">{wrapper.label}</p>
                  <p className="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">
                    {wrapper.disposals} disposal{wrapper.disposals === 1 ? "" : "s"} ·{" "}
                    {wrapper.tickers.slice(0, 5).join(", ")}
                    {wrapper.tickers.length > 5 ? ` +${wrapper.tickers.length - 5}` : ""} —{" "}
                    {wrapper.note}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("num text-sm", gainTone(wrapper.gainBase))}>
                    {wrapper.gainBase === null
                      ? "—"
                      : formatMoney(wrapper.gainBase, base, { decimals: 2 })}
                  </p>
                  <p className="num text-[0.7rem] leading-tight text-muted-foreground">
                    {formatMoney(wrapper.proceedsBase, base, { decimals: 0 })} proceeds
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {realised.shelteredNetBase !== null && realised.shelteredDisposals > 0 && (
            <p className="mt-3 rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {formatMoney(Math.abs(realised.shelteredNetBase), base, { decimals: 2 })}{" "}
              {realised.shelteredNetBase < 0 ? "of realised loss" : "of realised gain"} sits inside
              an ISA or pension across {realised.shelteredDisposals} disposal
              {realised.shelteredDisposals === 1 ? "" : "s"}.{" "}
              {realised.shelteredNetBase < 0
                ? "A loss inside a wrapper cannot be set against capital gains — it is not a usable loss, only a worse outcome."
                : "A gain inside a wrapper is not taxable and uses none of the annual exemption."}
            </p>
          )}

          {realised.unknownBasisCount > 0 && (
            <p className="mt-3 rounded-md border border-warn/35 bg-warn-soft/60 px-3 py-2 text-xs leading-relaxed text-warn">
              {realised.unknownBasisCount} disposal
              {realised.unknownBasisCount === 1 ? "" : "s"} had no purchase price in any imported
              file, so the gain on {realised.unknownBasisCount === 1 ? "it" : "them"} is unknown
              rather than zero. Import the earlier broker export to complete the picture.
            </p>
          )}

          {recent.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="eyebrow mb-2">Closed this tax year</p>
              <ul className="space-y-1.5">
                {recent.map((row) => (
                  <li
                    key={`${row.holdingId}-${row.date}-${row.quantity}`}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 truncate">
                      <span className="num text-foreground/85">{row.ticker}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {formatDate(row.date, "short")}
                        {" · "}
                        {WRAPPER_LABELS[row.wrapper]}
                      </span>
                    </span>
                    <span className={cn("num shrink-0", gainTone(row.gainBase))}>
                      {row.gainBase === null
                        ? "basis unknown"
                        : formatMoney(row.gainBase, base, { decimals: 2 })}
                    </span>
                  </li>
                ))}
              </ul>
              {thisYearDisposals.length > recent.length && (
                <p className="mt-2 text-[0.7rem] text-muted-foreground">
                  {thisYearDisposals.length - recent.length} earlier disposal
                  {thisYearDisposals.length - recent.length === 1 ? "" : "s"} this year not shown.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
