import { Link } from "@tanstack/react-router";
import { RefreshCw, SatelliteDish, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const MISSING_KEY_MESSAGE =
  "Market data is unavailable — no Finnhub key is configured. Add FINNHUB_API_KEY in Project Settings → Secrets (a free key from finnhub.io is enough) and prices will start updating.";

/**
 * Prices are either live or plainly absent. This banner is the "absent" half:
 * it never softens a missing feed into a stale number presented as current.
 */
export function MarketDataBanner({
  configured,
  message,
  fetchedAt,
  refreshing,
  onRefresh,
  unpricedCount,
  showSettingsLink = true,
  className,
}: {
  configured: boolean | null;
  message: string | null;
  fetchedAt?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  unpricedCount?: number;
  showSettingsLink?: boolean;
  className?: string;
}) {
  const missingKey = configured === false;
  const hasProblem = missingKey || !!message || (unpricedCount ?? 0) > 0;

  if (!hasProblem) {
    return (
      <div
        className={cn(
          "hairline flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface px-4 py-2.5",
          className,
        )}
      >
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <SatelliteDish className="h-3.5 w-3.5 text-gold" />
          Live prices {fetchedAt ? `· fetched ${relativeTime(fetchedAt)}` : ""}
        </p>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        missingKey ? "border-warn/40 bg-warn-soft" : "border-border bg-surface",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <TriangleAlert
            className={cn("mt-0.5 h-4 w-4 shrink-0", missingKey ? "text-warn" : "text-muted-foreground")}
          />
          <div className="min-w-0">
            <p className={cn("text-sm", missingKey ? "text-warn" : "text-foreground")}>
              {missingKey ? "Market data unavailable" : "Some prices could not be fetched"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {missingKey
                ? MISSING_KEY_MESSAGE
                : (message ??
                  `${unpricedCount} holding${unpricedCount === 1 ? "" : "s"} has no live price. Positions without a price are shown at cost and excluded from every market total and percentage below.`)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("mr-1.5 h-3 w-3", refreshing && "animate-spin")} />
              Retry
            </Button>
          )}
          {showSettingsLink && (
            <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
              <Link to="/settings" hash="market-data">
                Market data settings
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
