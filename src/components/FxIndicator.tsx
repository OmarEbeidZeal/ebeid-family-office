import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import { relativeTime } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** FX freshness at a glance. Amber once rates pass six hours old. */
export function FxIndicator({ className }: { className?: string }) {
  const { ratesAsOf, isStale, refreshing, refresh, refreshError, base } = useCurrency();

  const tone = refreshError ? "loss" : isStale ? "warn" : "gain";
  const detail = refreshError
    ? `Rates could not be refreshed: ${refreshError}`
    : ratesAsOf
      ? `${base} rates refreshed ${relativeTime(ratesAsOf)}. Click to refresh now.`
      : "No exchange rates stored yet. Click to fetch them.";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 lg:min-h-0 lg:px-2.5 lg:py-1.5",
            className,
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              tone === "gain" && "bg-gain",
              tone === "warn" && "bg-warn",
              tone === "loss" && "bg-loss",
            )}
          />
          <span className="hidden sm:inline">FX</span>
          <span className="num hidden text-[0.7rem] md:inline">
            {ratesAsOf ? relativeTime(ratesAsOf) : "none"}
          </span>
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem] text-xs leading-relaxed">{detail}</TooltipContent>
    </Tooltip>
  );
}
