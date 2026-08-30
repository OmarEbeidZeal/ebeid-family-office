import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { RowActions } from "@/components/RowActions";
import { Money } from "@/components/Money";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatAmount, formatDate, formatMoney } from "@/lib/format";
import type { HoldingRow, TradeRow } from "@/hooks/useFinancials";

export function TradesPanel({
  trades,
  holdings,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: {
  trades: TradeRow[];
  holdings: HoldingRow[];
  loading?: boolean;
  onAdd: () => void;
  onEdit: (trade: TradeRow) => void;
  onDelete: (trade: TradeRow) => void;
}) {
  const tickerOf = (id: string) => holdings.find((holding) => holding.id === id)?.ticker ?? "—";

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Trade history"
        description="Every buy and sell. Average cost and realised P/L are recomputed from this list, never typed."
        action={
          <Button variant="outline" size="sm" onClick={onAdd} disabled={!holdings.length}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Record trade
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <EmptyState
          title="No trades recorded"
          body={
            holdings.length
              ? "Record the buys and sells behind each position and the average cost stops being an estimate. Until then, positions use whatever cost you entered by hand."
              : "Add a holding first, then record the trades behind it."
          }
          action={
            holdings.length ? (
              <Button variant="outline" size="sm" onClick={onAdd}>
                Record the first trade
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {trades.map((trade) => {
            const consideration =
              Number(trade.quantity) * Number(trade.price) +
              (trade.side === "buy" ? Number(trade.fees) : -Number(trade.fees));
            return (
              <li key={trade.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.1em]",
                      trade.side === "buy"
                        ? "border-gain/30 bg-gain/10 text-gain"
                        : "border-loss/30 bg-loss/10 text-loss",
                    )}
                  >
                    {trade.side}
                  </span>
                  <div className="min-w-0">
                    <p className="num truncate text-sm text-foreground">
                      {tickerOf(trade.holding_id)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatAmount(Number(trade.quantity), {
                          decimals: Number(trade.quantity) % 1 === 0 ? 0 : 4,
                        })}
                        {" @ "}
                        {formatMoney(Number(trade.price), trade.currency, { decimals: 2 })}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(trade.trade_date)}
                      {Number(trade.fees) > 0 &&
                        ` · fees ${formatMoney(Number(trade.fees), trade.currency, { decimals: 2 })}`}
                      {trade.notes ? ` · ${trade.notes}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Money amount={consideration} currency={trade.currency} decimals={2} />
                  <RowActions
                    label={`${trade.side} of ${tickerOf(trade.holding_id)}`}
                    onEdit={() => onEdit(trade)}
                    onDelete={() => onDelete(trade)}
                    deleteDescription="Removing the trade recomputes the holding's quantity, average cost and realised P/L."
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
