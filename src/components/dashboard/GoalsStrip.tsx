import { useGoals } from "@/hooks/useFinancials";
import { useScope } from "@/hooks/useScope";
import { useCurrency } from "@/hooks/useCurrency";
import { formatMoney, titleise } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

export function GoalsStrip() {
  const { data, isLoading } = useGoals();
  const { matches } = useScope();
  const { base, convert } = useCurrency();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const goals = (data ?? []).filter((goal) => matches(goal.owner_profile_id));

  if (!goals.length) {
    return (
      <EmptyState
        title="No goals set"
        body="Add what you are actually saving towards — the Egypt house furnishings, school fees, a two-year emergency buffer — and every figure above gets a purpose."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {goals.slice(0, 8).map((goal) => {
        const target = convert(Number(goal.target_amount), goal.currency, base);
        const funded = convert(Number(goal.funded_amount), goal.currency, base);
        const pct = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
        return (
          <div key={goal.id} className="hairline rounded-lg bg-surface p-4">
            <p className="truncate text-sm font-medium">{goal.title}</p>
            <p className="mt-0.5 text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground">
              {titleise(goal.goal_category)} · {titleise(goal.priority)}
            </p>
            <div className="mt-3 h-1 w-full rounded-full bg-muted">
              <div className="h-1 rounded-full bg-gold" style={{ width: `${pct}%` }} />
            </div>
            <p className="num mt-2 text-xs text-muted-foreground">
              {formatMoney(funded, base, { decimals: 0 })} of {formatMoney(target, base, { decimals: 0 })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
