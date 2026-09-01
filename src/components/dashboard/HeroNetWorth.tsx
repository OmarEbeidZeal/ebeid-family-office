import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatSignedPercent } from "@/lib/format";
import { useScope } from "@/hooks/useScope";
import { useCountUp } from "@/hooks/useMotion";

export type NetWorthDelta = {
  amount: number;
  pct: number;
  sinceLabel: string;
} | null;

/**
 * One number, unmistakably the biggest thing on the page. Everything else here
 * exists only to say what the number is made of.
 */
export function HeroNetWorth({
  netWorth,
  totalAssets,
  totalLiabilities,
  liquidNetWorth,
  illiquidNetWorth,
  base,
  loading,
  delta,
  balancesUnstated = 0,
}: {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  base: string;
  loading: boolean;
  delta: NetWorthDelta;
  /** Accounts with no stated balance — excluded from the figure above. */
  balancesUnstated?: number;
}) {
  const { activeLabel } = useScope();
  const counted = useCountUp(netWorth, { enabled: !loading });

  return (
    <section className="hairline relative overflow-hidden rounded-lg bg-surface px-5 py-9 sm:px-9 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gold-soft blur-3xl"
      />
      <div className="relative">
        <p className="eyebrow">{activeLabel} net worth</p>

        {loading ? (
          <Skeleton className="mt-4 h-16 w-72" />
        ) : (
          <p className="headline-figure mt-4 text-[2.75rem] tracking-[0.01em] text-foreground sm:text-[4rem]">
            {formatMoney(counted, base, { decimals: 0 })}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
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

        {!loading && (
          <p className="num mt-3 text-xs text-muted-foreground">
            {formatMoney(liquidNetWorth, base, { decimals: 0 })} reachable within a week
            <span className="px-2 text-muted-foreground/60">·</span>
            {formatMoney(illiquidNetWorth, base, { decimals: 0 })} in property, pensions and private
            shares
          </p>
        )}

        {/* The headline is only trustworthy if it admits what it left out. */}
        {!loading && balancesUnstated > 0 && (
          <p className="mt-3 text-xs text-warn">
            <Link to="/accounts" className="underline underline-offset-4">
              {balancesUnstated === 1
                ? "1 account has no balance yet"
                : `${balancesUnstated} accounts have no balance yet`}
            </Link>{" "}
            — they are excluded from this figure rather than counted as nothing.
          </p>
        )}
      </div>
    </section>
  );
}
