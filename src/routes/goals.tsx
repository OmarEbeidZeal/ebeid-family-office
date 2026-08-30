import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Target } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalSheet } from "@/components/forms/GoalSheet";
import { useGoals, type GoalRow } from "@/hooks/useFinancials";
import { useCurrency } from "@/hooks/useCurrency";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { useScope } from "@/hooks/useScope";
import {
  GOAL_CATEGORY_LABELS,
  GOAL_STATUSES,
  countryLabel,
  formatDate,
  formatMoney,
  formatPercent,
  titleise,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Household goals with real targets, dates and funding progress — property in the UK and Jordan, a home in Egypt, and whatever comes next.",
      },
      { property: "og:title", content: "Goals — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Track what the household is saving toward, priced and dated.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GoalsPage,
});

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  saving: 1,
  planning: 2,
  paused: 3,
  achieved: 4,
};

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  GOAL_STATUSES.map((status) => [status.value, status.label]),
);

function GoalsPage() {
  const { data: goals = [], isLoading } = useGoals();
  const { base, convert } = useCurrency();
  const { matches, activeLabel, isHousehold } = useScope();
  const remove = useDeleteRow("goals", "goals", "Goal");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<GoalRow | null>(null);

  const visible = useMemo(
    () =>
      goals
        .filter((goal) => matches(goal.owner_profile_id))
        .sort((a, b) => {
          const statusDelta = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
          if (statusDelta !== 0) return statusDelta;
          if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
          if (a.target_date) return -1;
          if (b.target_date) return 1;
          return b.target_amount - a.target_amount;
        }),
    [goals, matches],
  );

  const totals = useMemo(() => {
    const open = visible.filter((goal) => goal.status !== "achieved");
    const target = open.reduce(
      (sum, goal) => sum + convert(Number(goal.target_amount), goal.currency, base),
      0,
    );
    const funded = open.reduce(
      (sum, goal) => sum + convert(Number(goal.funded_amount), goal.currency, base),
      0,
    );
    const unpriced = open.filter((goal) => Number(goal.target_amount) <= 0).length;
    return { target, funded, unpriced, count: open.length };
  }, [visible, base, convert]);

  const openSheet = (goal: GoalRow | null) => {
    setEditing(goal);
    setSheetOpen(true);
  };

  return (
    <AppShell
      title="Goals"
      description={
        isHousehold
          ? "What the money is actually for, priced and dated."
          : `Goals owned by ${activeLabel}, plus joint ones.`
      }
      actions={
        <Button size="sm" onClick={() => openSheet(null)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add goal
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : !visible.length ? (
        <EmptyState
          icon={<Target className="h-4 w-4" />}
          title="No goals set yet"
          body="Add what the household is working toward — a UK property, furnishing a home in Egypt, a purchase in Jordan. Give each one a target and a date so the forecast has something to aim at."
          action={
            <Button size="sm" onClick={() => openSheet(null)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first goal
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="hairline grid gap-6 rounded-lg bg-surface-raised px-5 py-4 sm:grid-cols-3">
            <div>
              <p className="eyebrow text-muted-foreground">Open goals</p>
              <p className="num mt-1 text-lg font-light">{totals.count}</p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Combined target</p>
              <p className="num mt-1 text-lg font-light">
                {formatMoney(totals.target, base, { decimals: 0 })}
              </p>
              {totals.unpriced > 0 && (
                <p className="mt-1 text-[0.7rem] text-warn">
                  {totals.unpriced} {totals.unpriced === 1 ? "goal is" : "goals are"} still unpriced
                </p>
              )}
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Set aside</p>
              <p className="num mt-1 text-lg font-light">
                {formatMoney(totals.funded, base, { decimals: 0 })}
              </p>
              {totals.target > 0 && (
                <p className="num mt-1 text-[0.7rem] text-muted-foreground">
                  {formatPercent((totals.funded / totals.target) * 100)} of the way there
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {visible.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={() => openSheet(goal)}
                onDelete={() => remove.mutate(goal.id)}
              />
            ))}
          </div>
        </div>
      )}

      <GoalSheet open={sheetOpen} onOpenChange={setSheetOpen} goal={editing} />
    </AppShell>
  );
}

function GoalCard({
  goal,
  onEdit,
  onDelete,
}: {
  goal: GoalRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const target = Number(goal.target_amount);
  const funded = Number(goal.funded_amount);
  const unpriced = target <= 0;
  const progress = unpriced ? 0 : Math.min(100, (funded / target) * 100);

  return (
    <article className="hairline rounded-lg bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm text-foreground">{goal.title}</h3>
            <Badge variant="outline" className="text-[0.65rem]">
              {GOAL_CATEGORY_LABELS[goal.goal_category] ?? titleise(goal.goal_category)}
            </Badge>
            {goal.priority === "must_have" && (
              <Badge className="bg-gold-soft text-[0.65rem] text-gold hover:bg-gold-soft">
                Must have
              </Badge>
            )}
            <Badge variant="secondary" className="text-[0.65rem]">
              {STATUS_LABELS[goal.status] ?? titleise(goal.status)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {goal.country ? countryLabel(goal.country) : "No country set"}
            <span className="mx-1.5 text-border">·</span>
            {goal.target_date ? `Target ${formatDate(goal.target_date)}` : "No target date"}
          </p>
        </div>

        <div className="flex items-start gap-1">
          <div className="text-right">
            {unpriced ? (
              <p className="text-sm text-warn">Not yet priced</p>
            ) : (
              <Money amount={target} currency={goal.currency} className="text-sm" />
            )}
          </div>
          <RowActions label={goal.title} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <div className="mt-4">
        <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={cn("h-full rounded-full", progress >= 100 ? "bg-gain" : "bg-gold")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[0.7rem] text-muted-foreground">
          <span className="num">
            {formatMoney(funded, goal.currency, { decimals: 0 })} set aside
          </span>
          <span className="num">
            {unpriced
              ? "Add a target to track progress"
              : `${formatPercent(progress)} · ${formatMoney(Math.max(target - funded, 0), goal.currency, { decimals: 0 })} to go`}
          </span>
        </div>
      </div>

      {goal.description && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{goal.description}</p>
      )}
    </article>
  );
}
