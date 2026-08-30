import { Link } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMoney, formatPercent, GOAL_CATEGORY_LABELS } from "@/lib/format";
import { useGoals } from "@/hooks/useFinancials";
import { useScope } from "@/hooks/useScope";
import { useCurrency } from "@/hooks/useCurrency";

export function GoalsStrip() {
  const goalsQuery = useGoals();
  const { matches } = useScope();
  const { convert, base } = useCurrency();

  const goals = (goalsQuery.data ?? [])
    .filter((goal) => matches(goal.owner_profile_id))
    .filter((goal) => goal.status !== "achieved")
    .slice(0, 4);

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Goals"
        action={
          <Link
            to="/goals"
            className="text-xs text-muted-foreground transition-colors hover:text-gold"
          >
            All goals →
          </Link>
        }
      />

      {goalsQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target className="h-4 w-4" strokeWidth={1.6} />}
          title="No goals set"
          body="A goal turns a balance into a plan — a UK property purchase, furnishing the home in Egypt, a place in Jordan. Add one with a target amount and date and the forecast will tell you whether it lands."
          action={
            <Link
              to="/goals"
              className="inline-flex h-9 items-center rounded-md border border-gold-line bg-gold-soft px-4 text-sm text-gold transition-colors hover:bg-gold-soft/80"
            >
              Set a goal
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {goals.map((goal) => {
            const target = Number(goal.target_amount);
            const funded = Number(goal.funded_amount);
            const pct = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
            const targetBase = convert(target, goal.currency, base);
            return (
              <Link
                key={goal.id}
                to="/goals"
                className="group rounded-md border border-border bg-surface-raised p-4 transition-colors hover:border-gold-line"
              >
                <p className="truncate text-sm text-foreground transition-colors group-hover:text-gold">
                  {goal.title}
                </p>
                <p className="mt-1 text-[0.68rem] uppercase tracking-[0.1em] text-muted-foreground">
                  {GOAL_CATEGORY_LABELS[goal.goal_category] ?? goal.goal_category}
                  {goal.target_date ? ` · ${formatDate(goal.target_date, "short")}` : ""}
                </p>

                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                </div>

                <div className="mt-2 flex items-baseline justify-between">
                  <span className="num text-xs text-foreground/85">
                    {target > 0
                      ? formatMoney(targetBase, base, { decimals: 0 })
                      : "Target not priced"}
                  </span>
                  <span className="num text-[0.7rem] text-muted-foreground">
                    {target > 0 ? formatPercent(pct, 0) : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
