import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalSheet } from "@/components/forms/GoalSheet";
import { GoalCard, type FundingCheck } from "@/components/goals/GoalCard";
import { db } from "@/lib/db";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { useQuickAdd } from "@/lib/quick-add";
import { useScope } from "@/hooks/useScope";
import { useGoalPlan, useForecastSource } from "@/hooks/usePlanning";
import type { GoalRow } from "@/hooks/useFinancials";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Household goals costed line by line, with the monthly contribution each one needs, stamp duty on property purchases and a status against real surplus cashflow.",
      },
      { property: "og:title", content: "Goals — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Every wish priced properly: all-in costs, required monthly contribution and whether the plan actually funds it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const { loading, plan, goals, itemsByGoal, surplus, base } = useGoalPlan();
  const forecast = useForecastSource();
  const { matches, activeLabel, isHousehold } = useScope();
  const remove = useDeleteRow("goals", "goals", "Goal");
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<GoalRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [handleId, setHandleId] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);

  useQuickAdd("goal", () => {
    setEditing(null);
    setSheetOpen(true);
  });

  const goalById = useMemo(() => new Map(goals.map((goal) => [goal.id, goal])), [goals]);

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [index, id] of ids.entries()) {
        const { error } = await db.from("goals").update({ sort_order: index }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
    onError: (error: Error) => {
      setPendingOrder(null);
      toast.error(`Could not save the new order: ${error.message}`);
    },
    onSettled: () => setPendingOrder(null),
  });

  const ordered = useMemo(() => {
    const rows = plan.rows;
    if (!pendingOrder) return rows;
    const rank = new Map(pendingOrder.map((id, index) => [id, index]));
    return [...rows].sort((a, b) => (rank.get(a.goal.id) ?? 99) - (rank.get(b.goal.id) ?? 99));
  }, [plan.rows, pendingOrder]);

  const visible = useMemo(
    () => ordered.filter((row) => matches(row.goal.owner_profile_id)),
    [ordered, matches],
  );

  const move = (id: string, targetId: string) => {
    const ids = ordered.map((row) => row.goal.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setPendingOrder(next);
    reorder.mutate(next);
  };

  const shift = (id: string, delta: number) => {
    const ids = ordered.map((row) => row.goal.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    move(id, ids[to]!);
  };

  const openSheet = (goal: GoalRow | null) => {
    setEditing(goal);
    setSheetOpen(true);
  };

  // Whether money earmarked for near-term goals could plausibly be sitting in
  // cash. Goal funding is not tied to an account, so this compares totals
  // rather than claiming to know where each pound sits.
  const nearTermFunded = plan.open
    .filter((row) => row.horizon === "near")
    .reduce((sum, row) => sum + row.funded, 0);
  const householdCash = forecast.input.cash;
  const nearTermCovered = nearTermFunded <= householdCash + 0.5;

  const fundingCheckFor = (horizon: "near" | "medium" | "long" | null): FundingCheck | null => {
    if (horizon === null) return null;
    if (horizon === "near") {
      return nearTermCovered
        ? {
            tone: "ok",
            message: `The household holds ${formatMoney(householdCash, base, { decimals: 0 })} in cash, which covers everything earmarked for goals inside two years.`,
          }
        : {
            tone: "warn",
            message: `${formatMoney(nearTermFunded, base, { decimals: 0 })} is set aside for goals inside two years but the household only holds ${formatMoney(householdCash, base, { decimals: 0 })} in cash. Some of that money is invested and could be worth less on the day it is needed.`,
          };
    }
    if (horizon === "medium") {
      return {
        tone: "ok",
        message:
          "At this horizon up to 40% of the funding can sit in equities; the rest belongs in cash or short bonds.",
      };
    }
    return {
      tone: "ok",
      message: "Beyond five years this funding can follow the standard portfolio allocation.",
    };
  };

  const totals = plan.totals;
  const surplusValue = surplus.value;

  return (
    <AppShell
      title="Goals"
      description={
        isHousehold
          ? "What the money is actually for — costed line by line, with the contribution each one needs."
          : `Goals owned by ${activeLabel}, plus joint ones. Funding priority is worked out across the whole household.`
      }
      actions={
        <Button size="sm" onClick={() => openSheet(null)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add goal
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : !visible.length ? (
        <EmptyState
          icon={<Target className="h-4 w-4" />}
          title={goals.length ? `No goals owned by ${activeLabel}` : "No goals set yet"}
          body={
            goals.length
              ? "Switch back to the household view to see every goal, or add one owned by this person."
              : "Add what the household is working toward — a UK property, furnishing the house in Egypt, a purchase in Jordan. Give each one a target and a date, then break it into line items so the all-in cost is honest."
          }
          action={
            <Button size="sm" onClick={() => openSheet(null)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {goals.length ? "Add a goal" : "Add your first goal"}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <section className="hairline rounded-lg bg-surface-raised px-5 py-4">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Open goals" value={String(totals.count)}>
                {totals.unpriced > 0 && (
                  <span className="text-warn">{totals.unpriced} still unpriced</span>
                )}
                {totals.unpriced === 0 && totals.undated > 0 && (
                  <span className="text-warn">{totals.undated} without a date</span>
                )}
              </Summary>
              <Summary label="All-in cost" value={formatMoney(totals.allIn, base, { decimals: 0 })}>
                <span>{formatMoney(totals.remaining, base, { decimals: 0 })} still to find</span>
              </Summary>
              <Summary label="Set aside" value={formatMoney(totals.funded, base, { decimals: 0 })}>
                {totals.allIn > 0 && (
                  <span>
                    {formatPercent((totals.funded / totals.allIn) * 100)} of the way there
                  </span>
                )}
              </Summary>
              <Summary
                label="Needed each month"
                value={formatMoney(totals.requiredMonthly, base, { decimals: 0 })}
                tone="gold"
              >
                {surplusValue === null ? (
                  <span className="text-warn">{surplus.label}</span>
                ) : totals.surplusShortfall && totals.surplusShortfall > 1 ? (
                  <span className="text-loss">
                    {formatMoney(totals.surplusShortfall, base, { decimals: 0 })} more than the{" "}
                    {surplus.label.toLowerCase()}
                  </span>
                ) : (
                  <span className="text-gain">Within the {surplus.label.toLowerCase()}</span>
                )}
              </Summary>
            </div>

            <p className="mt-4 border-t border-border pt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
              {surplus.detail}
              {surplusValue !== null && (
                <>
                  {" "}
                  Surplus of {formatMoney(surplusValue, base, { decimals: 0 })} a month is allocated
                  down this list in order.
                </>
              )}
              {totals.firstUnfundedTitle && (
                <>
                  {" "}
                  <span className="text-warn">
                    It runs out at “{totals.firstUnfundedTitle}” — drag the list to change what
                    gives.
                  </span>
                </>
              )}
            </p>
          </section>

          {!nearTermCovered && (
            <p className="rounded-md border border-warn/30 bg-warn/10 px-4 py-3 text-xs leading-relaxed text-warn">
              Goals inside two years have {formatMoney(nearTermFunded, base, { decimals: 0 })} set
              aside, more than the {formatMoney(householdCash, base, { decimals: 0 })} the household
              holds in cash. Money needed that soon should not be exposed to a drawdown it cannot
              wait out.
            </p>
          )}

          <div>
            <SectionHeader
              title="Priority order"
              description="Drag a goal by its handle — or focus a handle and use the arrow keys — to change which one the surplus funds first."
            />
            <ul className="space-y-3">
              {visible.map((row, index) => {
                const goal = goalById.get(row.goal.id);
                if (!goal) return null;
                return (
                  <li
                    key={row.goal.id}
                    draggable={handleId === row.goal.id}
                    onDragStart={(event) => {
                      setDragId(row.goal.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", row.goal.id);
                    }}
                    onDragOver={(event) => {
                      if (dragId && dragId !== row.goal.id) {
                        event.preventDefault();
                        setOverId(row.goal.id);
                      }
                    }}
                    onDragLeave={() =>
                      setOverId((current) => (current === row.goal.id ? null : current))
                    }
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragId) move(dragId, row.goal.id);
                      setDragId(null);
                      setOverId(null);
                      setHandleId(null);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                      setHandleId(null);
                    }}
                    className={cn(reorder.isPending && "pointer-events-none opacity-70")}
                  >
                    <GoalCard
                      row={row}
                      goal={goal}
                      items={itemsByGoal.get(row.goal.id) ?? []}
                      base={base}
                      expanded={expanded === row.goal.id}
                      onToggle={() =>
                        setExpanded((current) => (current === row.goal.id ? null : row.goal.id))
                      }
                      onEdit={() => openSheet(goal)}
                      onDelete={() => remove.mutate(goal.id)}
                      onMoveUp={() => shift(row.goal.id, -1)}
                      onMoveDown={() => shift(row.goal.id, 1)}
                      canMoveUp={index > 0}
                      canMoveDown={index < visible.length - 1}
                      gripProps={{
                        onMouseDown: () => setHandleId(row.goal.id),
                        onTouchStart: () => setHandleId(row.goal.id),
                        onBlur: () =>
                          setHandleId((current) => (current === row.goal.id ? null : current)),
                      }}
                      fundingCheck={fundingCheckFor(row.horizon)}
                      dragging={dragId === row.goal.id}
                      dropTarget={overId === row.goal.id}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <GoalSheet open={sheetOpen} onOpenChange={setSheetOpen} goal={editing} />
    </AppShell>
  );
}

function Summary({
  label,
  value,
  tone = "default",
  children,
}: {
  label: string;
  value: string;
  tone?: "default" | "gold";
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-1 text-xl font-light", tone === "gold" && "text-gold")}>{value}</p>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">{children}</p>
    </div>
  );
}
