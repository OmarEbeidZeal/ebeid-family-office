import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectNative } from "@/components/forms/FormField";
import { CURRENCIES, formatMoney } from "@/lib/format";
import { LINE_ITEM_KINDS } from "@/lib/goal-math";
import { FURNISHING_PROMPTS, UK_PROPERTY_PROMPTS } from "@/lib/sdlt";
import type { GoalLineItemRow, GoalRow } from "@/hooks/useFinancials";
import { useCurrency } from "@/hooks/useCurrency";

/**
 * The costed breakdown behind a goal. Prompt rows can be added in one click,
 * but every figure is typed by the household — an unpriced row stays visibly
 * unpriced rather than being filled with a plausible number.
 */
export function LineItemsTable({ goal, items }: { goal: GoalRow; items: GoalLineItemRow[] }) {
  const { household } = useAuth();
  const { base, convert } = useCurrency();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    label: "",
    kind: "other",
    cost: "",
    currency: goal.currency,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["goal_line_items"] });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await db.from("goal_line_items").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(`Could not save that change: ${error.message}`),
  });

  const insert = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const { error } = await db
        .from("goal_line_items")
        .insert(rows.map((row) => ({ ...row, household_id: household!.id, goal_id: goal.id })));
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(`Could not add that line: ${error.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("goal_line_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(`Could not remove that line: ${error.message}`),
  });

  const nextOrder = items.length ? Math.max(...items.map((item) => item.sort_order)) + 1 : 0;

  const addPrompts = (prompts: { label: string; kind: string }[]) => {
    const existing = new Set(items.map((item) => item.label.toLowerCase()));
    const rows = prompts
      .filter((prompt) => !existing.has(prompt.label.toLowerCase()))
      .map((prompt, index) => ({
        label: prompt.label,
        kind: prompt.kind,
        estimated_cost: 0,
        currency: goal.currency,
        sort_order: nextOrder + index,
      }));
    if (!rows.length) {
      toast.info("Those lines are already on this goal.");
      return;
    }
    insert.mutate(rows);
  };

  const submitDraft = () => {
    const label = draft.label.trim();
    if (!label) return;
    insert.mutate([
      {
        label,
        kind: draft.kind,
        estimated_cost: Number(draft.cost) || 0,
        currency: draft.currency,
        sort_order: nextOrder,
      },
    ]);
    setDraft({ label: "", kind: draft.kind, cost: "", currency: draft.currency });
  };

  const total = items.reduce(
    (sum, item) => sum + convert(Number(item.estimated_cost), item.currency, base),
    0,
  );
  const unpriced = items.filter((item) => Number(item.estimated_cost) <= 0).length;

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="eyebrow pb-2 font-normal">Line</th>
                <th className="eyebrow pb-2 font-normal">Kind</th>
                <th className="eyebrow pb-2 text-right font-normal">Cost</th>
                <th className="eyebrow pb-2 text-center font-normal">Paid</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  onPatch={(values) => patch.mutate({ id: item.id, values })}
                  onRemove={() => remove.mutate(item.id)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="pt-2 text-xs text-muted-foreground" colSpan={2}>
                  All-in from {items.length} line{items.length === 1 ? "" : "s"}
                  {unpriced > 0 && (
                    <span className="text-warn"> · {unpriced} still without a figure</span>
                  )}
                </td>
                <td className="num pt-2 text-right text-sm">{formatMoney(total, base)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {adding ? (
        <div className="hairline grid gap-2 rounded-md bg-surface-raised p-3 sm:grid-cols-[1fr_9rem_8rem_6rem_auto]">
          <Input
            autoFocus
            placeholder="What this line covers"
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitDraft();
              }
            }}
          />
          <SelectNative
            value={draft.kind}
            onChange={(value) => setDraft({ ...draft, kind: value })}
            options={LINE_ITEM_KINDS.map((kind) => ({ value: kind.value, label: kind.label }))}
          />
          <Input
            type="number"
            step="100"
            inputMode="decimal"
            className="num text-right"
            placeholder="0"
            value={draft.cost}
            onChange={(event) => setDraft({ ...draft, cost: event.target.value })}
          />
          <SelectNative
            value={draft.currency}
            onChange={(value) => setDraft({ ...draft, currency: value })}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          />
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" onClick={submitDraft} disabled={insert.isPending}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add line
          </Button>
          {goal.goal_category === "property" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => addPrompts(UK_PROPERTY_PROMPTS)}
              disabled={insert.isPending}
            >
              Add UK purchase costs
            </Button>
          )}
          {(goal.goal_category === "home_improvement" || goal.goal_category === "property") && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => addPrompts(FURNISHING_PROMPTS)}
              disabled={insert.isPending}
            >
              Add furnishing rooms
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function LineItemRow({
  item,
  onPatch,
  onRemove,
}: {
  item: GoalLineItemRow;
  onPatch: (values: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [cost, setCost] = useState(String(Number(item.estimated_cost) || ""));

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-1.5 pr-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            const next = label.trim();
            if (next && next !== item.label) onPatch({ label: next });
            else setLabel(item.label);
          }}
          className="h-8 border-transparent bg-transparent px-1.5 hover:border-border focus:border-border"
          aria-label={`Label for ${item.label}`}
        />
      </td>
      <td className="py-1.5 pr-2">
        <SelectNative
          value={item.kind}
          onChange={(value) => onPatch({ kind: value })}
          options={LINE_ITEM_KINDS.map((kind) => ({ value: kind.value, label: kind.label }))}
          className="h-8"
        />
      </td>
      <td className="py-1.5 pr-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <Input
            value={cost}
            inputMode="decimal"
            type="number"
            step="100"
            placeholder="Not priced"
            onChange={(event) => setCost(event.target.value)}
            onBlur={() => {
              const next = Number(cost) || 0;
              if (next !== Number(item.estimated_cost)) onPatch({ estimated_cost: next });
            }}
            className="num h-8 w-28 border-transparent bg-transparent px-1.5 text-right hover:border-border focus:border-border"
            aria-label={`Cost for ${item.label}`}
          />
          <span className="text-[0.7rem] text-muted-foreground">{item.currency}</span>
        </div>
      </td>
      <td className="py-1.5 text-center">
        <Checkbox
          checked={item.is_purchased}
          onCheckedChange={(checked) => onPatch({ is_purchased: checked === true })}
          aria-label={`${item.label} already paid`}
        />
      </td>
      <td className="py-1.5 text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-loss"
          onClick={onRemove}
          aria-label={`Remove ${item.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}
