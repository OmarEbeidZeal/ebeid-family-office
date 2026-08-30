import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "./SettingsCard";
import { useCurrency } from "@/hooks/useCurrency";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FxCard() {
  const { base, rates, ratesAsOf, isStale, hasRates, refresh, refreshing, refreshError } =
    useCurrency();

  const quotes = Object.entries(rates).filter(([code]) => code !== base);

  return (
    <SettingsCard
      title="Exchange rates"
      description={
        refreshError
          ? `Last refresh failed: ${refreshError}`
          : ratesAsOf
            ? `Refreshed ${relativeTime(ratesAsOf)} from open.er-api.com. Rates older than six hours refresh themselves.`
            : "No rates stored yet — fetch them so foreign-currency balances convert correctly."
      }
      action={
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh now"}
        </Button>
      }
    >
      {hasRates ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {quotes.map(([code, rate]) => (
            <div key={code} className="hairline rounded-md bg-surface-raised px-3 py-2">
              <p className="eyebrow text-muted-foreground">
                {base} / {code}
              </p>
              <p className="num mt-0.5 text-sm">{rate.toFixed(4)}</p>
            </div>
          ))}
          {isStale && (
            <p className="text-xs text-warn sm:col-span-3 lg:col-span-4">
              These rates are over six hours old. Conversions still work, but refresh before making
              a decision on them.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Until rates are stored, foreign-currency figures are shown in their native currency
          without a sterling conversion. Nothing is estimated.
        </p>
      )}
    </SettingsCard>
  );
}
