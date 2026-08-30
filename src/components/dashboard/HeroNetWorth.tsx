import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatSignedPercent } from "@/lib/format";
import { useScope } from "@/hooks/useScope";

export type NetWorthDelta = {
  amount: number;
  pct: number;
  sinceLabel: string;
} | null;

export function HeroNetWorth({
  netWorth,
  totalAssets,
  totalLiabilities,
  base,
  loading,
  delta,
}: {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  base: string;
  loading: boolean;
  delta: NetWorthDelta;
}) {
  const { activeLabel } = useScope();

  return (
    <section className="rise hairline relative overflow-hidden rounded-lg bg-surface px-5 py-8 sm:px-8 sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold-soft blur-3xl"
      />
      <div className="relative">
        <p className="eyebrow">{activeLabel} net worth</p>

        {loading ? (
          <Skeleton className="mt-4 h-14 w-72" />
        ) : (
          <p className="headline-figure mt-3 text-[2.6rem] tracking-[0.01em] text-foreground sm:text-[3.6rem]">
            {formatMoney(netWorth, base, { decimals: 0 })}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {loading ? (
            <Skeleton className="h-4 w-64" />
          ) : (
            <p className="num text-sm text-muted-foreground">
              Assets {formatMoney(totalAssets, base, { decimals: 0 })}
              <span className="px-2 text-muted-foreground/60">−</span>
              Liabilities {formatMoney(totalLiabilities, base, { decimals: 0 })}
            </p>
          )}

          {!loading && delta && (
            <span
              className={cn(
                "num inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                delta.amount >= 0 ? "bg-gain-soft text-gain" : "bg-loss-soft text-loss",
              )}
            >
              {delta.amount >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {formatMoney(Math.abs(delta.amount), base, { decimals: 0 })}
              <span className="opacity-80">({formatSignedPercent(delta.pct)})</span>
              <span className="text-muted-foreground">{delta.sinceLabel}</span>
            </span>
          )}

          {!loading && !delta && (
            <span className="text-xs text-muted-foreground">
              First snapshot recorded today — change appears from tomorrow.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
