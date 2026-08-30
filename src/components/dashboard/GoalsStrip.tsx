import { Link } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { GoalStatusPill } from "@/components/goals/GoalStatusPill";
import { formatDate, formatMoney, formatPercent, GOAL_CATEGORY_LABELS } from "@/lib/format";
import { useGoalPlan } from "@/hooks/usePlanning";

/**
 * The dashboard read on the wish list: the all-in cost, where funding stands
 * and what each goal needs every month from today. Goals are household-level,
 * so this deliberately ignores the Me/partner scope toggle.
 */
export function GoalsStrip() {
  const { loading, plan, base } = useGoalPlan();
  const rows = plan.open.slice(0, 4);
  const onTrack = plan.open.filter((row) => row.status === "on_track").length;

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Goals"
        {...(plan.open.length > 0
          ? {
              description: `${onTrack} of ${plan.open.length} on track · ${formatMoney(plan.totals.requiredMonthly, base, { decimals: 0 })} a month needed across the open list`,
            }
          : {})}
        action={
          <Link
            to="/goals"
            className="text-xs text-muted-foreground transition-colors hover:text-gold"
          >
            All goals →
          </Link>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Target className="h-4 w-4" strokeWidth={1.6} />}
          title={plan.rows.length === 0 ? "No goals set" : "Every goal is achieved"}
          body={
            plan.rows.length === 0
              ? "A goal turns a balance into a plan — a UK property purchase, furnishing the home in Egypt, a place in Jordan. Add one with a target amount and date, break it into line items, and the forecast will tell you whether it lands."
              : "Nothing open on the wish list. Add the next one — a property, a school-fee pot, a car — and it will be costed and projected alongside the rest."
          }
          action={
            <Link
              to="/goals"
              className="inline-flex h-9 items-center rounded-md border border-gold-line bg-gold-soft px-4 text-sm text-gold transition-colors hover:bg-gold-soft/80"
            >
              {plan.rows.length === 0 ? "Set a goal" : "Add a goal"}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <Link
              key={row.goal.id}
              to="/goals"
              className="group flex flex-col rounded-md border border-border bg-surface-raised p-4 transition-colors hover:border-gold-line"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-foreground transition-colors group-hover:text-gold">
                  {row.goal.title}
                </p>
                <GoalStatusPill status={row.status} className="shrink-0" />
              </div>

              <p className="mt-1 text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                {GOAL_CATEGORY_LABELS[row.goal.goal_category] ?? row.goal.goal_category}
                {row.goal.target_date ? ` · ${formatDate(row.goal.target_date, "short")}` : ""}
              </p>

              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${Math.min(100, Math.max(0, row.progressPct))}%` }}
                />
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="num text-xs text-foreground/85">
                  {row.allIn > 0 ? formatMoney(row.allIn, base, { decimals: 0 }) : "Not priced"}
                </span>
                <span className="num text-[0.7rem] text-muted-foreground">
                  {row.allIn > 0 ? formatPercent(row.progressPct, 0) : "—"}
                </span>
              </div>

              <div className="mt-3 border-t border-border pt-2">
                <p className="eyebrow">Needed monthly</p>
                <p className="num mt-0.5 text-base font-light text-foreground">
                  {row.requiredMonthly === null
                    ? "—"
                    : formatMoney(row.requiredMonthly, base, { decimals: 0 })}
                </p>
                {row.requiredMonthly !== null && (
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                    {row.allocatedMonthly > 0
                      ? `${formatMoney(row.allocatedMonthly, base, { decimals: 0 })} allocated from surplus`
                      : "No surplus allocated to this goal"}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
