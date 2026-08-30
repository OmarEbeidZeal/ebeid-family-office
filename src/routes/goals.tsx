import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalSheet } from "@/components/forms/GoalSheet";
import { GoalCard, type FundingCheck, type WhatIfProjection } from "@/components/goals/GoalCard";
import { GoalTimeline } from "@/components/goals/GoalTimeline";
import { GoalSummaryStrip } from "@/components/goals/GoalSummaryStrip";
import { WhatIfSlider } from "@/components/goals/WhatIfSlider";
import { db } from "@/lib/db";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { useQuickAdd } from "@/lib/quick-add";
import { useScope } from "@/hooks/useScope";
import { useGoalPlan, useForecastSource } from "@/hooks/usePlanning";
import type { GoalRow } from "@/hooks/useFinancials";
import type { GoalPlanRow } from "@/lib/goal-math";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Ebeid Family Office" },
      {
        name: "description",
        content:
          "The household's goals on a five-year timeline: all-in costs, what is saved, the monthly contribution each one needs and when it lands.",
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

const MONTH_LABEL: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };

function addMonths(from: Date, months: number) {
  const date = new Date(from);
  date.setMonth(date.getMonth() + Math.round(months));
  return date;
}

function GoalsPage() {
  const { loading, plan, goals, itemsByGoal, surplus, base, replan } = useGoalPlan();
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
  const [whatIf, setWhatIf] = useState<number | null>(null);
  const [focusedGoal, setFocusedGoal] = useState<string | null>(null);

  const cardRefs = useRef(new Map<string, HTMLLIElement>());

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

  // Everything on the page reads from one plan. When the slider moves, the
  // plan is recomputed at that contribution — same arithmetic, different input.
  const activePlan = useMemo(
    () => (whatIf === null ? plan : replan(whatIf)),
    [whatIf, plan, replan],
  );

  const ordered = useMemo(() => {
    const rows = activePlan.rows;
    if (!pendingOrder) return rows;
    const rank = new Map(pendingOrder.map((id, index) => [id, index]));
    return [...rows].sort((a, b) => (rank.get(a.goal.id) ?? 99) - (rank.get(b.goal.id) ?? 99));
  }, [activePlan.rows, pendingOrder]);

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

  // Selecting a marker on the timeline opens the goal it belongs to.
  useEffect(() => {
    if (!focusedGoal) return;
    const node = cardRefs.current.get(focusedGoal);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setFocusedGoal(null), 1800);
    return () => window.clearTimeout(timer);
  }, [focusedGoal]);

  // Whether money earmarked for near-term goals could plausibly be sitting in
  // cash. Goal funding is not tied to an account, so this compares totals
  // rather than claiming to know where each pound sits.
  const nearTermFunded = activePlan.open
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

  const totals = activePlan.totals;
  const surplusValue = surplus.value;

  const lastCompletion = useMemo(() => {
    const dates = activePlan.open
      .map((row) => row.goal.target_date)
      .filter((date): date is string => !!date)
      .sort();
    return dates.length ? (dates[dates.length - 1] ?? null) : null;
  }, [activePlan.open]);

  const sliderMax = useMemo(() => {
    const anchor = Math.max(
      totals.requiredMonthly * 1.4,
      (surplusValue ?? 0) * 2,
      plan.totals.requiredMonthly * 1.4,
      1000,
    );
    const magnitude = Math.pow(10, Math.floor(Math.log10(anchor)));
    return Math.ceil(anchor / magnitude) * magnitude;
  }, [totals.requiredMonthly, surplusValue, plan.totals.requiredMonthly]);

  const sliderValue = whatIf ?? Math.max(0, Math.min(surplusValue ?? 0, sliderMax));

  const projections = useMemo(() => {
    const map = new Map<string, WhatIfProjection>();
    if (whatIf === null) return map;
    const today = new Date();
    for (const row of activePlan.rows) {
      map.set(row.goal.id, projectionFor(row, today));
    }
    return map;
  }, [whatIf, activePlan.rows]);

  const effect = useMemo(() => {
    const relevant = activePlan.open.filter(
      (row) => row.requiredMonthly !== null && row.monthsRemaining !== null,
    );
    if (!relevant.length) {
      return { text: "Add a cost and a date to a goal to model this.", tone: "muted" as const };
    }
    const onTime = relevant.filter(
      (row) =>
        row.monthsAtCurrentRate !== null &&
        row.monthsRemaining !== null &&
        row.monthsAtCurrentRate <= row.monthsRemaining + 0.5,
    ).length;
    const tone: "gain" | "warn" | "loss" =
      onTime === relevant.length ? "gain" : onTime === 0 ? "loss" : "warn";

    return {
      text: `${onTime} of ${relevant.length} dated goal${relevant.length === 1 ? "" : "s"} land${
        onTime === 1 ? "s" : ""
      } on time`,
      tone,
    };
  }, [activePlan.open]);

  return (
    <AppShell
      title="Goals"
      description={
        isHousehold
          ? "What the money is actually for."
          : `Goals owned by ${activeLabel}, plus joint ones.`
      }
      actions={
        <Button size="sm" onClick={() => openSheet(null)} className="min-h-11">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add goal
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full rounded-lg" />
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
            <Button size="sm" onClick={() => openSheet(null)} className="min-h-11">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {goals.length ? "Add a goal" : "Add your first goal"}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <GoalTimeline
            rows={visible}
            base={base}
            selectedId={expanded}
            onSelect={(goalId) => {
              setExpanded(goalId);
              setFocusedGoal(goalId);
            }}
          />

          <GoalSummaryStrip
            allIn={totals.allIn}
            funded={totals.funded}
            monthly={totals.requiredMonthly}
            lastCompletion={lastCompletion}
            base={base}
            monthlyNote={
              surplusValue === null
                ? surplus.label
                : totals.surplusShortfall && totals.surplusShortfall > 1
                  ? `${formatMoney(totals.surplusShortfall, base, { decimals: 0 })} more than the ${surplus.label.toLowerCase()}`
                  : `within the ${surplus.label.toLowerCase()}`
            }
            monthlyTone={
              surplusValue === null
                ? "warn"
                : totals.surplusShortfall && totals.surplusShortfall > 1
                  ? "loss"
                  : "gain"
            }
          />

          <WhatIfSlider
            value={sliderValue}
            onChange={setWhatIf}
            max={sliderMax}
            base={base}
            actual={surplusValue}
            actualLabel={surplus.label}
            effect={effect.text}
            effectTone={effect.tone}
            dirty={whatIf !== null}
            onReset={() => setWhatIf(null)}
          />

          {!nearTermCovered && (
            <p className="rounded-md border border-warn/30 bg-warn/10 px-4 py-3 text-xs leading-relaxed text-warn">
              Goals inside two years have {formatMoney(nearTermFunded, base, { decimals: 0 })} set
              aside, more than the {formatMoney(householdCash, base, { decimals: 0 })} the household
              holds in cash. Money needed that soon should not be exposed to a drawdown it cannot
              wait out.
            </p>
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm text-foreground">In priority order</h2>
              <p className="text-xs text-muted-foreground">
                {totals.firstUnfundedTitle
                  ? `Surplus runs out at “${totals.firstUnfundedTitle}” — drag to change what gives.`
                  : "Drag a goal, or focus its handle and use the arrow keys."}
              </p>
            </div>
            <ul className="space-y-4">
              {visible.map((row, index) => {
                const goal = goalById.get(row.goal.id);
                if (!goal) return null;
                return (
                  <li
                    key={row.goal.id}
                    ref={(node) => {
                      if (node) cardRefs.current.set(row.goal.id, node);
                      else cardRefs.current.delete(row.goal.id);
                    }}
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
                      whatIf={projections.get(row.goal.id) ?? null}
                      highlighted={focusedGoal === row.goal.id}
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

/** What a given contribution level does to one goal's completion date. */
function projectionFor(row: GoalPlanRow, today: Date): WhatIfProjection {
  if (row.status === "achieved") return { label: "Already funded.", tone: "gain" };
  if (row.allIn <= 0) {
    return { label: "Unpriced, so no date can be projected.", tone: "muted" };
  }
  if (row.monthsAtCurrentRate === null) {
    return {
      label: "At this level nothing reaches this goal — the ones above it take it all.",
      tone: "loss",
    };
  }

  const landing = addMonths(today, row.monthsAtCurrentRate).toLocaleDateString("en-GB", MONTH_LABEL);
  if (row.monthsRemaining === null) {
    return { label: `Funded by ${landing} at this rate.`, tone: "muted" };
  }
  if (row.monthsAtCurrentRate <= row.monthsRemaining + 0.5) {
    return { label: `Funded by ${landing} — on time.`, tone: "gain" };
  }
  const late = Math.round(row.monthsAtCurrentRate - row.monthsRemaining);
  return {
    label: `Funded by ${landing} — ${late} month${late === 1 ? "" : "s"} later than planned.`,
    tone: late > 12 ? "loss" : "warn",
  };
}
