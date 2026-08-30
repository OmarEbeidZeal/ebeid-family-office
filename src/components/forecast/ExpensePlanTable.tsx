import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { SectionHeader } from "@/components/SectionHeader";
import { ExpenseSheet } from "@/components/forms/ExpenseSheet";
import { useQuickAdd } from "@/lib/quick-add";
import { useForecastExpenses, type ForecastExpenseRow } from "@/hooks/useFinancials";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { rateToPct } from "@/hooks/usePlanning";
import { FREQUENCY_LABELS, formatDate, formatPercent } from "@/lib/format";
import type { ForecastAssumptions } from "@/lib/forecast";
import { cn } from "@/lib/utils";

const CONFIDENCE_LABELS: Record<string, string> = {
  committed: "Committed",
  likely: "Likely",
  possible: "Possible",
};

/** Everything the household can see coming, with the confidence attached to it. */
export function ExpensePlanTable({ assumptions }: { assumptions: ForecastAssumptions }) {
  const { data: expenses = [], isLoading } = useForecastExpenses();
  const remove = useDeleteRow("forecast_expenses", "forecast_expenses", "Planned outgoing");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ForecastExpenseRow | null>(null);

  useQuickAdd("expense", () => {
    setEditing(null);
    setOpen(true);
  });

  const edit = (row: ForecastExpenseRow | null) => {
    setEditing(row);
    setOpen(true);
  };

  const included = (confidence: string) => {
    if (confidence === "likely") return assumptions.includeLikely;
    if (confidence === "possible") return assumptions.includePossible;
    return true;
  };

  return (
    <section>
      <SectionHeader
        title="Planned outgoings"
        description="Nursery, school fees, a car, travel, family support, furnishing — anything you can see over the next five years."
        action={
          <Button size="sm" variant="secondary" onClick={() => edit(null)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add outgoing
          </Button>
        }
      />

      {!isLoading && !expenses.length ? (
        <EmptyState
          icon={<CalendarClock className="h-4 w-4" />}
          title="Nothing planned yet"
          body="Add the outgoings you already know about — nursery fees, school fees from a given year, a car, annual travel, support sent to family, the Egypt furnishing. Each one takes an amount, a start and end date, an inflation rate and how certain it is."
          action={
            <Button size="sm" onClick={() => edit(null)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first outgoing
            </Button>
          }
        />
      ) : (
        <div className="hairline overflow-x-auto rounded-lg bg-surface">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="eyebrow px-4 py-2.5 font-normal">Outgoing</th>
                <th className="eyebrow px-4 py-2.5 font-normal">Runs</th>
                <th className="eyebrow px-4 py-2.5 text-right font-normal">Amount</th>
                <th className="eyebrow px-4 py-2.5 text-right font-normal">Inflation</th>
                <th className="eyebrow px-4 py-2.5 font-normal">Confidence</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((row) => {
                const counted = included(row.confidence);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      !counted && "opacity-55",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <p className="text-foreground">{row.label}</p>
                      <p className="text-[0.7rem] text-muted-foreground">
                        {FREQUENCY_LABELS[row.frequency] ?? row.frequency}
                        {row.notes && ` · ${row.notes}`}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-[0.75rem] text-muted-foreground">
                      {row.start_date ? formatDate(row.start_date, "short") : "From now"}
                      {" → "}
                      {row.end_date ? formatDate(row.end_date, "short") : "open-ended"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Money amount={Number(row.amount)} currency={row.currency} decimals={0} />
                    </td>
                    <td className="num px-4 py-2.5 text-right text-muted-foreground">
                      {formatPercent(rateToPct(row.inflation_rate))}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={row.confidence === "committed" ? "secondary" : "outline"}
                        className="text-[0.65rem]"
                      >
                        {CONFIDENCE_LABELS[row.confidence] ?? row.confidence}
                      </Badge>
                      {!counted && (
                        <p className="mt-1 text-[0.65rem] text-muted-foreground">Not counted</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <RowActions
                        label={row.label}
                        onEdit={() => edit(row)}
                        onDelete={() => remove.mutate(row.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseSheet open={open} onOpenChange={setOpen} expense={editing} />
    </section>
  );
}
