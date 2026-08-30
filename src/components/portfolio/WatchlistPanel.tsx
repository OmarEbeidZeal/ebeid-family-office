import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { RowActions } from "@/components/RowActions";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney, formatSignedPercent, relativeTime } from "@/lib/format";
import type { WatchlistRow } from "@/hooks/useFinancials";
import type { QuoteResult } from "@/lib/market/shared";

const CONVICTION_LABELS: Record<string, string> = {
  high: "High conviction",
  medium: "Medium conviction",
  watching: "Watching",
};

export function WatchlistPanel({
  items,
  quotes,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onOpenTicker,
}: {
  items: WatchlistRow[];
  quotes: Record<string, QuoteResult | undefined>;
  loading?: boolean;
  onAdd: () => void;
  onEdit: (item: WatchlistRow) => void;
  onDelete: (item: WatchlistRow) => void;
  onOpenTicker: (ticker: string) => void;
}) {
  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Watchlist"
        description="Ideas with a written thesis and a written way to be wrong. Nothing else gets on the list."
        action={
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add idea
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing on the watchlist"
          body="Add a ticker you are thinking about, along with the thesis and what would prove it wrong. When the moment to buy comes, the reasoning is already written down instead of improvised."
          action={
            <Button variant="outline" size="sm" onClick={onAdd}>
              Add the first idea
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const quote = quotes[item.ticker.toUpperCase()];
            const priced = !!quote && quote.price !== null && quote.source !== "stale" && quote.source !== "none";
            const distance =
              priced && item.target_price
                ? ((item.target_price - quote.price!) / quote.price!) * 100
                : null;

            return (
              <li key={item.id} className="rounded-md border border-border bg-surface-raised/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenTicker(item.ticker)}
                      className="num text-sm text-foreground transition-colors hover:text-gold"
                    >
                      {item.ticker}
                    </button>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {item.name ?? CONVICTION_LABELS[item.conviction ?? "watching"]}
                    </span>
                    <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                      {CONVICTION_LABELS[item.conviction ?? "watching"]}
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="text-right">
                      {priced ? (
                        <>
                          <p className="num text-sm text-foreground">
                            {formatMoney(quote.price!, quote.currency ?? "USD", { decimals: 2 })}
                          </p>
                          <p
                            className={cn(
                              "num text-[0.7rem]",
                              (quote.changePct ?? 0) > 0 && "text-gain",
                              (quote.changePct ?? 0) < 0 && "text-loss",
                              quote.changePct === null && "text-muted-foreground",
                            )}
                          >
                            {quote.changePct === null
                              ? "—"
                              : formatSignedPercent(quote.changePct)}
                            <span className="ml-1.5 text-muted-foreground">
                              {quote.asOf ? relativeTime(quote.asOf) : ""}
                            </span>
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-warn">No live price</p>
                      )}
                    </div>
                    <RowActions
                      label={item.ticker}
                      onEdit={() => onEdit(item)}
                      onDelete={() => onDelete(item)}
                      deleteDescription="The idea and its written thesis are removed from the watchlist."
                    />
                  </div>
                </div>

                {(item.target_price || distance !== null) && (
                  <p className="num mt-2 text-xs text-muted-foreground">
                    Target {item.target_price ? formatMoney(item.target_price, quote?.currency ?? "USD", { decimals: 2 }) : "—"}
                    {distance !== null && (
                      <span className={cn("ml-2", distance > 0 ? "text-gain" : "text-loss")}>
                        {formatSignedPercent(distance)} away
                      </span>
                    )}
                  </p>
                )}

                <p className="mt-2.5 text-xs leading-relaxed text-foreground/80">{item.thesis}</p>
                <p className="mt-2 border-l-2 border-loss/40 pl-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="text-loss/90">Wrong if:</span> {item.falsification}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
