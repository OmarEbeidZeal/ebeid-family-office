import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { SectionHeader } from "@/components/SectionHeader";
import { IncomeSheet } from "@/components/forms/IncomeSheet";
import { useQuickAdd } from "@/lib/quick-add";
import { useIncomeStreams, type IncomeRow } from "@/hooks/useFinancials";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { rateToPct } from "@/hooks/usePlanning";
import { FREQUENCY_LABELS, INCOME_TYPE_LABELS, formatPercent } from "@/lib/format";

/** Income streams and their growth rates — the top line of the projection. */
export function IncomeTable() {
  const { data: income = [], isLoading } = useIncomeStreams();
  const remove = useDeleteRow("income_streams", "income_streams", "Income stream");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeRow | null>(null);

  useQuickAdd("income", () => {
    setEditing(null);
    setOpen(true);
  });

  const edit = (row: IncomeRow | null) => {
    setEditing(row);
    setOpen(true);
  };

  return (
    <section>
      <SectionHeader
        title="Income streams"
        description="What comes in each month, and how fast each line grows."
        action={
          <Button size="sm" variant="secondary" onClick={() => edit(null)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add income
          </Button>
        }
      />

      {!isLoading && !income.length ? (
        <EmptyState
          icon={<Wallet className="h-4 w-4" />}
          title="No income recorded"
          body="The projection has nothing coming in. Add Omar's Zeal salary, Haya's income, rental income from Egypt — whatever actually lands, at the frequency it lands."
          action={
            <Button size="sm" onClick={() => edit(null)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add an income stream
            </Button>
          }
        />
      ) : (
        <div className="hairline overflow-x-auto rounded-lg bg-surface">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="eyebrow px-4 py-2.5 font-normal">Stream</th>
                <th className="eyebrow px-4 py-2.5 font-normal">Frequency</th>
                <th className="eyebrow px-4 py-2.5 text-right font-normal">Amount</th>
                <th className="eyebrow px-4 py-2.5 text-right font-normal">Growth</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {income.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-foreground">{row.label}</p>
                    <p className="text-[0.7rem] text-muted-foreground">
                      {INCOME_TYPE_LABELS[row.income_type] ?? row.income_type}
                      {row.net_amount === null && " · gross only"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {FREQUENCY_LABELS[row.frequency] ?? row.frequency}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money
                      amount={Number(row.net_amount ?? row.gross_amount)}
                      currency={row.currency}
                      decimals={0}
                    />
                  </td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">
                    {formatPercent(rateToPct(row.annual_growth_rate))}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RowActions
                      label={row.label}
                      onEdit={() => edit(row)}
                      onDelete={() => remove.mutate(row.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <IncomeSheet open={open} onOpenChange={setOpen} income={editing} />
    </section>
  );
}
