import { Link } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ProgressRing";
import { GoalStatusPill } from "@/components/goals/GoalStatusPill";
import { RING_TONE, STATUS_TONE, priorityMeta } from "@/components/goals/goal-visuals";
import { formatDate, formatMoney, formatReadableMoney } from "@/lib/format";
import { useGoalPlan } from "@/hooks/usePlanning";
import { cn } from "@/lib/utils";

/**
 * What the money is for, on the dashboard: the ring, the all-in cost and the
 * monthly ask. Goals are household-level, so this deliberately ignores the
 * Me/partner scope toggle.
 */
export function GoalsStrip() {
  const { loading, plan, base } = useGoalPlan();
  const rows = plan.open.slice(0, 4);
  const onTrack = plan.open.filter((row) => row.status === "on_track").length;

  return (
    <section className="panel p-5">
      <SectionHeader
        title="What it's all for"
        {...(plan.open.length > 0
          ? {
              description: `${onTrack} of ${plan.open.length} on track · ${formatMoney(plan.totals.requiredMonthly, base, { decimals: 0 })} a month needed across the open list`,
            }
          : {})}
        action={
          <Link
            to="/goals"
            className="-my-2 inline-flex items-center py-2 text-xs text-muted-foreground transition-colors hover:text-gold coarse:min-h-10"
          >
            All goals →
          </Link>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-36 w-full" />
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
              className="tap inline-flex items-center rounded-md border border-gold-line bg-gold-soft px-4 text-sm text-gold transition-colors hover:bg-gold-soft/80"
            >
              {plan.rows.length === 0 ? "Set a goal" : "Add a goal"}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => {
            const priority = priorityMeta(row.goal.priority);
            return (
              <li key={row.goal.id}>
                <Link
                  to="/goals"
                  className="group flex h-full flex-col gap-3 rounded-md border border-border bg-surface-raised p-4 transition-colors hover:border-gold-line"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground transition-colors group-hover:text-gold">
                      {row.goal.title}
                    </p>
                    <GoalStatusPill status={row.status} className="shrink-0" />
                  </div>

                  <div className="flex items-center gap-3">
                    <ProgressRing
                      value={row.progressPct}
                      size={56}
                      stroke={5}
                      tone={RING_TONE[STATUS_TONE[row.status]]}
                      label={`${Math.round(Math.min(100, Math.max(0, row.progressPct)))}%`}
                      ariaLabel={`${row.goal.title}: ${Math.round(row.progressPct)}% funded`}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="num text-sm font-light text-foreground">
                        {row.requiredMonthly === null
                          ? "—"
                          : `${formatReadableMoney(row.requiredMonthly, base)}/mo`}
                      </p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">
                        {row.allIn > 0
                          ? `of ${formatReadableMoney(row.allIn, base)} all-in`
                          : "Not priced yet"}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                        <span
                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", priority.dot)}
                          aria-hidden
                        />
                        <span className="truncate">
                          {priority.label}
                          {row.goal.target_date
                            ? ` · ${formatDate(row.goal.target_date, "short")}`
                            : ""}
                        </span>
                      </p>

                    </div>
                  </div>
                </Link>

              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
