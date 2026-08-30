import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CategoryCombobox } from "./CategoryCombobox";
import { useSaveSplits, useSplits, type TransactionRow } from "@/hooks/useTransactions";
import type { CategoryRow } from "@/hooks/useFinancials";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Line = { category_id: string | null; amount: string; note: string };

export function SplitDialog({
  transaction,
  categories,
  onOpenChange,
}: {
  transaction: TransactionRow | null;
  categories: CategoryRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const { data: existing } = useSplits(transaction?.id ?? null);
  const save = useSaveSplits();
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!transaction) return;
    if (existing?.length) {
      setLines(
        existing.map((split) => ({
          category_id: split.category_id,
          amount: Number(split.amount).toFixed(2),
          note: split.note ?? "",
        })),
      );
    } else {
      setLines([
        {
          category_id: transaction.category_id,
          amount: Number(transaction.amount).toFixed(2),
          note: "",
        },
        { category_id: null, amount: "", note: "" },
      ]);
    }
  }, [transaction, existing]);

  if (!transaction) return null;

  const total = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const remaining = Number((transaction.amount - total).toFixed(2));
  const balanced = Math.abs(remaining) < 0.01;

  const update = (index: number, values: Partial<Line>) =>
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...values } : line)),
    );

  const submit = async () => {
    const usable = lines
      .map((line) => ({
        category_id: line.category_id,
        amount: Number(Number(line.amount).toFixed(2)),
        note: line.note.trim() || null,
      }))
      .filter((line) => line.amount > 0);

    if (!usable.length) {
      toast.error("Give at least one part an amount.");
      return;
    }
    if (!balanced) {
      toast.error(
        `The parts add up to ${formatMoney(total, transaction.currency)}, not ${formatMoney(transaction.amount, transaction.currency)}.`,
      );
      return;
    }

    await save.mutateAsync({ transactionId: transaction.id, splits: usable });
    toast.success(`Split across ${usable.length} categories`);
    onOpenChange(false);
  };

  const clear = async () => {
    await save.mutateAsync({ transactionId: transaction.id, splits: [] });
    toast.success("Split removed");
    onOpenChange(false);
  };

  return (
    <Dialog open={!!transaction} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base font-light tracking-tight">
            Split this transaction
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {transaction.description} ·{" "}
            <span className="num">{formatMoney(transaction.amount, transaction.currency)}</span> —
            divide it across the categories it really covers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="min-w-0 flex-1 rounded border border-border bg-surface-raised px-1">
                <CategoryCombobox
                  value={line.category_id}
                  categories={categories}
                  onChange={(categoryId) => update(index, { category_id: categoryId })}
                />
              </div>
              <Input
                inputMode="decimal"
                value={line.amount}
                placeholder="0.00"
                onChange={(event) => update(index, { amount: event.target.value })}
                className="num h-8 w-28 text-right text-xs"
              />
              <button
                type="button"
                aria-label="Remove part"
                className="text-muted-foreground transition-colors hover:text-loss"
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[0.7rem]"
            onClick={() =>
              setLines((current) => [...current, { category_id: null, amount: "", note: "" }])
            }
          >
            <Plus className="size-3" /> Add part
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className={cn("num text-xs", balanced ? "text-muted-foreground" : "text-warn")}>
            {balanced
              ? "Parts match the transaction"
              : `${formatMoney(Math.abs(remaining), transaction.currency)} ${remaining > 0 ? "unallocated" : "over"}`}
          </p>
          <div className="flex items-center gap-2">
            {!!existing?.length && (
              <Button
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => void clear()}
              >
                Remove split
              </Button>
            )}
            <Button size="sm" disabled={save.isPending || !balanced} onClick={() => void submit()}>
              Save split
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
