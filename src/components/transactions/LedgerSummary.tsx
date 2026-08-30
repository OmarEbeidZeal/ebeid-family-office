import { AlertTriangle } from "lucide-react";
import { Money } from "@/components/Money";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

/** Totals for whatever the current filter selects — not the whole ledger. */
export function LedgerSummary({
  totals,
  loading,
}: {
  totals:
    | { inflow: number; outflow: number; net: number; count: number; unconverted: number }
    | undefined;
  loading: boolean;
}) {
  const { base } = useCurrency();

  if (loading || !totals) {
    return <Skeleton className="h-14 w-full" />;
  }

  const figures = [
    { label: "Money in", value: totals.inflow, tone: "text-gain" },
    { label: "Money out", value: totals.outflow, tone: "text-foreground" },
    { label: "Net", value: totals.net, tone: totals.net >= 0 ? "text-gain" : "text-loss" },
  ];

  return (
    <div className="hairline flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-6">
        {figures.map((figure) => (
          <div key={figure.label}>
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {figure.label}
            </p>
            <Money
              amount={figure.value}
              currency={base}
              hideConverted
              align="left"
              className={cn("text-sm", figure.tone)}
            />
          </div>
        ))}
      </div>

      <div className="text-right">
        <p className="num text-xs text-muted-foreground">
          {totals.count.toLocaleString("en-GB")} transactions
        </p>
        {totals.unconverted > 0 && (
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[0.7rem] text-warn">
            <AlertTriangle className="size-3" />
            {totals.unconverted} without a sterling rate for their date
          </p>
        )}
      </div>
    </div>
  );
}
