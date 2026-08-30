import type { ReactNode } from "react";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSignedPercent } from "@/lib/format";

export type StatTrend = {
  /** Percentage change against the previous observation. */
  changePct: number;
  label: string;
};

export function StatTile({
  label,
  value,
  definition,
  sub,
  tone = "neutral",
  loading,
  trend,
}: {
  label: string;
  value: ReactNode;
  /** One line of plain English, shown on hover. */
  definition: string;
  sub?: ReactNode;
  tone?: "neutral" | "gain" | "loss" | "gold";
  loading?: boolean;
  trend?: StatTrend | null;
}) {
  return (
    <div className="group hairline relative rounded-lg bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`What ${label} means`}
              className="-m-2 rounded-sm p-2 text-muted-foreground/50 opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 coarse:opacity-100"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[15rem] text-xs leading-relaxed">
            {definition}
          </TooltipContent>
        </Tooltip>
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p
          className={cn(
            "num mt-2 text-[1.4rem] font-light leading-tight",
            tone === "gain" && "text-gain",
            tone === "loss" && "text-loss",
            tone === "gold" && "text-gold",
          )}
        >
          {value}
        </p>
      )}

      {!loading && (
        <div className="mt-1.5 flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                "num inline-flex items-center gap-1 text-[0.7rem]",
                trend.changePct > 0 && "text-gain",
                trend.changePct < 0 && "text-loss",
                trend.changePct === 0 && "text-muted-foreground",
              )}
            >
              {trend.changePct >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {formatSignedPercent(trend.changePct)}
              <span className="text-muted-foreground">{trend.label}</span>
            </span>
          )}
          {sub && <span className="text-[0.7rem] text-muted-foreground">{sub}</span>}
        </div>
      )}
    </div>
  );
}
