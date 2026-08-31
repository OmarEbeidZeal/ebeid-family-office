import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import {
  useForecastExpenses,
  useGoalLineItems,
  useGoals,
  type ForecastExpenseRow,
  type GoalLineItemRow,
  type LifeEventRow,
} from "@/hooks/useFinancials";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { BABY_ONE_OFF_ITEMS, BABY_RECURRING_ITEMS } from "@/lib/planning/baby-plan";
import { addMonths } from "@/lib/planning/dates";
import { cn } from "@/lib/utils";

/** A cost cell that saves what was typed when focus leaves it. */
function AmountCell({
  value,
  currency,
  onSave,
}: {
  value: number;
  currency: string;
  onSave: (amount: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value ? String(value) : "");

  return (
    <div className="relative w-32 shrink-0">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {currency}
      </span>
      <Input
        inputMode="decimal"
        value={shown}
        placeholder="0"
        className={cn("num h-9 pl-10 text-right", !value && "text-muted-foreground")}
        onChange={(input) => setDraft(input.target.value)}
        onBlur={() => {
          if (draft === null) return;
          const parsed = Math.max(0, Number(draft) || 0);
          setDraft(null);
          if (Math.abs(parsed - value) > 0.005) onSave(parsed);
        }}
      />
    </div>
  );
}

function OneOffCosts({ event, base }: { event: LifeEventRow; base: string }) {
  const { household } = useAuth();
  const queryClient = useQueryClient();
  const goalsQuery = useGoals();
  const itemsQuery = useGoalLineItems();

  const goal = useMemo(
    () => (goalsQuery.data ?? []).find((row) => row.life_event_id === event.id) ?? null,
    [goalsQuery.data, event.id],
  );

  const items = useMemo(
    () =>
      (itemsQuery.data ?? [])
        .filter((row: GoalLineItemRow) => row.goal_id === goal?.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [itemsQuery.data, goal?.id],
  );

  const total = items.reduce((sum, item) => sum + Number(item.estimated_cost), 0);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await db
        .from("goals")
        .insert({
          household_id: household!.id,
          life_event_id: event.id,
          // Joint by default: the cost of a baby is not one person's.
          owner_profile_id: null,
          title: `${event.title} — setting up`,
          goal_category: "family",
          target_amount: 0,
          currency: base,
          target_date: event.expected_date,
          priority: "must_have",
          description:
            "Everything that has to be bought once before the baby arrives. Priced by the household, not by an average.",
        })
        .select("id")
        .single();
      if (error) throw error;
      const goalId = (data as { id: string }).id;

      const rows = BABY_ONE_OFF_ITEMS.map((item, index) => ({
        household_id: household!.id,
        goal_id: goalId,
        label: item.label,
        estimated_cost: 0,
        currency: base,
        kind: "other",
        sort_order: index,
        notes: item.note || null,
      }));
      const { error: itemError } = await db.from("goal_line_items").insert(rows);
      if (itemError) throw itemError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      queryClient.invalidateQueries({ queryKey: ["goal_line_items"] });
      toast.success("One-off costs added as a goal");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, cost }: { id: string; cost: number }) => {
      const { error } = await db
        .from("goal_line_items")
        .update({ estimated_cost: cost })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goal_line_items"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  // The goal's headline figure follows the line items, as it does on Goals.
  const syncTarget = useMutation({
    mutationFn: async (amount: number) => {
      if (!goal) return;
      const { error } = await db.from("goals").update({ target_amount: amount }).eq("id", goal.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });

  if (!goal) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm text-foreground">One-off costs are not priced yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          The pushchair, the cot, the nursery deposit. These become a joint goal with a line item
          each, priced by you rather than by a national average, and land in the forecast as a
          single step in the month before the due date.
        </p>
        <Button
          size="sm"
          className="mt-3 min-h-11"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add the one-off costs
        </Button>
      </div>
    );
  }

  const unpriced = items.filter((item) => Number(item.estimated_cost) === 0).length;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm text-foreground">{goal.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unpriced
              ? `${unpriced} of ${items.length} still to be priced`
              : `${items.length} items priced`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="num text-lg font-light text-foreground">
            {formatMoney(total, goal.currency, { decimals: 0 })}
          </p>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/goals">
              Open
              <ArrowUpRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{item.label}</p>
              {item.notes && (
                <p className="truncate text-[0.7rem] text-muted-foreground">{item.notes}</p>
              )}
            </div>
            <AmountCell
              value={Number(item.estimated_cost)}
              currency={item.currency}
              onSave={(cost) => {
                patch.mutate({ id: item.id, cost });
                const next = items.reduce(
                  (sum, row) => sum + (row.id === item.id ? cost : Number(row.estimated_cost)),
                  0,
                );
                syncTarget.mutate(next);
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecurringCosts({ event, base }: { event: LifeEventRow; base: string }) {
  const { household } = useAuth();
  const queryClient = useQueryClient();
  const expensesQuery = useForecastExpenses();

  const rows = useMemo(
    () =>
      (expensesQuery.data ?? [])
        .filter((row: ForecastExpenseRow) => row.life_event_id === event.id)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [expensesQuery.data, event.id],
  );

  const seed = useMutation({
    mutationFn: async () => {
      const existing = new Set(rows.map((row) => row.label));
      const inserts = BABY_RECURRING_ITEMS.filter((item) => !existing.has(item.label)).map(
        (item) => ({
          household_id: household!.id,
          life_event_id: event.id,
          owner_profile_id: null,
          label: item.label,
          amount: 0,
          currency: base,
          frequency: "monthly",
          confidence: "likely",
          // Anchored to the event, so moving the due date moves the outgoing.
          event_offset_months: 0,
          start_date: event.expected_date,
          end_date: addMonths(event.expected_date, item.endMonths),
        }),
      );
      if (!inserts.length) return 0;
      const { error } = await db.from("forecast_expenses").insert(inserts);
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: (added) => {
      queryClient.invalidateQueries({ queryKey: ["forecast_expenses"] });
      toast.success(added ? `${added} outgoing${added === 1 ? "" : "s"} added` : "Nothing missing");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await db.from("forecast_expenses").update({ amount }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forecast_expenses"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const monthly = rows.reduce((sum, row) => sum + Number(row.amount), 0);

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm text-foreground">No recurring costs added</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Nappies, formula, clothes, classes. Each one runs for as long as it actually runs —
          nappies for thirty months, formula for twelve — rather than for the whole projection.
        </p>
        <Button
          size="sm"
          className="mt-3 min-h-11"
          onClick={() => seed.mutate()}
          disabled={seed.isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add the recurring costs
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm text-foreground">Month by month, from the birth</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each line stops on its own date and is already in the forecast.
          </p>
        </div>
        <p className="num text-lg font-light text-foreground">
          {formatMoney(monthly, base, { decimals: 0 })}
          <span className="ml-1 text-xs text-muted-foreground">/mo</span>
        </p>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{row.label}</p>
              <p className="text-[0.7rem] text-muted-foreground">
                {row.end_date ? `Until ${row.end_date.slice(0, 7)}` : "No end date"}
              </p>
            </div>
            <AmountCell
              value={Number(row.amount)}
              currency={row.currency}
              onSave={(amount) => patch.mutate({ id: row.id, amount })}
            />
          </li>
        ))}
      </ul>

      <div className="border-t border-border px-4 py-2.5">
        <Button size="sm" variant="ghost" onClick={() => seed.mutate()} disabled={seed.isPending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Restore missing lines
        </Button>
      </div>
    </div>
  );
}

/**
 * What the baby costs, split the way the money actually behaves: things bought
 * once before the birth, which belong in a goal, and things bought every month
 * afterwards, which belong in the forecast as outgoings with an end date.
 */
export function BabyCosts({ event, base }: { event: LifeEventRow; base: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div>
        <p className="eyebrow mb-2 text-foreground/60">Bought once</p>
        <OneOffCosts event={event} base={base} />
      </div>
      <div>
        <p className="eyebrow mb-2 text-foreground/60">Bought every month</p>
        <RecurringCosts event={event} base={base} />
      </div>
    </div>
  );
}
