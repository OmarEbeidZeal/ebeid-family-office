import { Check, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryCombobox } from "./CategoryCombobox";
import type { CategoryRow } from "@/hooks/useFinancials";

export function BulkActionsBar({
  count,
  categories,
  busy,
  onCategorise,
  onMarkReviewed,
  onMarkTransfer,
  onClear,
}: {
  count: number;
  categories: CategoryRow[];
  busy: boolean;
  onCategorise: (categoryId: string | null) => void;
  onMarkReviewed: () => void;
  onMarkTransfer: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="hairline flex flex-wrap items-center gap-3 rounded-lg bg-surface-raised px-3 py-2">
      <p className="num text-xs text-foreground">{count} selected</p>

      <div className="min-w-44 rounded border border-border bg-surface px-1">
        <CategoryCombobox
          value={null}
          categories={categories}
          placeholder="Recategorise all…"
          onChange={onCategorise}
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[0.7rem]"
        disabled={busy}
        onClick={onMarkReviewed}
      >
        <Check className="size-3" /> Mark reviewed
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[0.7rem]"
        disabled={busy}
        onClick={onMarkTransfer}
      >
        <Shuffle className="size-3" /> Mark as transfer
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 px-2 text-[0.7rem] text-muted-foreground"
        onClick={onClear}
      >
        <X className="size-3" /> Clear
      </Button>
    </div>
  );
}
