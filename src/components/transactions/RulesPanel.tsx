import { useState } from "react";
import { ArrowLeftRight, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { CategoryCombobox } from "@/components/transactions/CategoryCombobox";
import {
  useCategoryRules,
  useCreateCategoryRule,
  useDeleteCategoryRule,
  useRescanTransfers,
} from "@/hooks/useTransactions";
import type { CategoryRow } from "@/hooks/useFinancials";
import { formatDate } from "@/lib/format";


const MATCH_LABELS: Record<string, string> = {
  contains: "contains",
  starts_with: "starts with",
  exact: "is exactly",
};

/**
 * Rules are the household's own categorisation, written down. They run ahead of
 * the model on every import, so this is the place to see and undo them.
 */
export function RulesPanel({ categories }: { categories: CategoryRow[] }) {
  const { data: rules = [], isLoading } = useCategoryRules();
  const createRule = useCreateCategoryRule();
  const deleteRule = useDeleteCategoryRule();
  const rescan = useRescanTransfers();

  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState("contains");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const categoryName = (id: string) =>
    categories.find((category) => category.id === id)?.name ?? "Unknown category";

  const submit = async () => {
    const trimmed = pattern.trim();
    if (!trimmed || !categoryId) return;
    try {
      const updated = await createRule.mutateAsync({
        pattern: trimmed,
        categoryId,
        matchType,
      });
      setPattern("");
      setCategoryId(null);
      toast.success(
        updated
          ? `Rule saved · ${updated} past transaction${updated === 1 ? "" : "s"} recategorised`
          : "Rule saved · it will apply to everything imported from now on",
      );
    } catch {
      toast.error("Could not save that rule.");
    }
  };

  const recheckMovement = async () => {
    try {
      const { scanned, flagged } = await rescan.mutateAsync();
      toast.success(
        flagged
          ? `${flagged} transaction${flagged === 1 ? "" : "s"} reclassified as internal movement`
          : `Nothing new — all ${scanned.toLocaleString("en-GB")} transactions already read correctly`,
      );
    } catch {
      toast.error("Could not re-check internal movement.");
    }
  };

  const remove = async (id: string, label: string) => {
    if (!window.confirm(`Stop applying the rule for “${label}”?`)) return;
    try {
      await deleteRule.mutateAsync(id);
      toast.success("Rule removed · transactions already filed are left as they are");
    } catch {
      toast.error("Could not remove that rule.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="hairline flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-4">
        <div className="min-w-[16rem] flex-1">
          <p className="text-sm">Internal movement</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Money between your own accounts is neither income nor spending. Each import only checks
            the days around itself — re-check the whole ledger after confirming an account or a
            name, and anything paying one of you by name is caught too.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={rescan.isPending}
          onClick={() => void recheckMovement()}
        >
          {rescan.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ArrowLeftRight className="size-3.5" />
          )}
          Re-check the ledger
        </Button>
      </div>

      <div className="hairline space-y-3 rounded-lg bg-surface p-4">
        <div>
          <p className="text-sm">Write a rule</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Anything matching the text below is filed automatically on every future import, and
            applied to matching transactions you already hold.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[10rem] flex-1 space-y-1">
            <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              When the description
            </span>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MATCH_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="min-w-[12rem] flex-[2] space-y-1">
            <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              This text
            </span>
            <Input
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="e.g. WAITROSE"
              className="h-9 text-xs"
            />
          </label>

          <div className="min-w-[10rem] flex-1 space-y-1">
            <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              File it as
            </span>
            <div className="hairline flex h-9 items-center rounded-md bg-background px-1">
              <CategoryCombobox
                value={categoryId}
                categories={categories}
                onChange={setCategoryId}
                placeholder="Choose a category"
              />
            </div>
          </div>

          <Button
            size="sm"
            className="h-9"
            disabled={!pattern.trim() || !categoryId || createRule.isPending}
            onClick={() => void submit()}
          >
            {createRule.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Save rule
          </Button>
        </div>
      </div>

      <div className="hairline rounded-lg bg-surface px-4">
        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={<Wand2 className="size-4" />}
            title="No rules yet"
            body="Change a transaction's category in the ledger and accept the “Always” prompt, or write a rule above. Rules beat the model, so anything you decide here stays decided."
            className="border-0"
          />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="text-muted-foreground">
                      {MATCH_LABELS[rule.match_type] ?? rule.match_type}{" "}
                    </span>
                    <span className="text-foreground">“{rule.match_pattern}”</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="text-gold">{categoryName(rule.category_id)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Written <span className="num">{formatDate(rule.created_at, "short")}</span>
                    {rule.applied_count > 0 && (
                      <>
                        {" · applied to "}
                        <span className="num">{rule.applied_count}</span>{" "}
                        {rule.applied_count === 1 ? "transaction" : "transactions"}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove rule for ${rule.match_pattern}`}
                  className="h-7 px-2 text-muted-foreground hover:text-loss"
                  disabled={deleteRule.isPending}
                  onClick={() => void remove(rule.id, rule.match_pattern)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
