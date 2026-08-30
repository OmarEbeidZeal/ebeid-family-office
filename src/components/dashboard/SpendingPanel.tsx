import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatSignedPercent } from "@/lib/format";
import { monthLabel, shiftMonth } from "@/lib/spending";
import { useObservedSpending } from "@/hooks/useObservedSpending";

export function SpendingPanel() {
  const spending = useObservedSpending();
  const { base, thisMonth, lastMonth } = spending;

  const rows = useMemo(
    () =>
      spending.hasData
        ? spending
            .breakdown(thisMonth, lastMonth)
            .filter((row) => row.current > 0 || row.previous > 0)
            .slice(0, 6)
        : [],
    [spending, thisMonth, lastMonth],
  );

  const peak = Math.max(1, ...rows.flatMap((row) => [row.current, row.previous]));

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Where the money goes"
        description={`Top categories in ${monthLabel(thisMonth, "long")} against ${monthLabel(shiftMonth(thisMonth, -1), "long")}, from imported statements.`}
        action={
          spending.hasData ? (
            <Link
              to="/spending"
              className="text-xs text-muted-foreground transition-colors hover:text-gold"
            >
              Full analysis
            </Link>
          ) : null
        }
      />

      {spending.loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            spending.hasData ? "Nothing spent in these two months" : "No statements imported yet"
          }
          body={
            spending.hasData
              ? "There are transactions on file, but none dated in this month or last. Import the statement covering the current period to see where the money is going."
              : "Spending is read from real statements, never estimated. Import a PDF or CSV from any of your accounts and this panel fills with the categories the money actually went to."
          }
          action={
            <Link
              to="/transactions"
              className="inline-flex h-9 items-center rounded-md border border-border bg-surface-raised px-4 text-sm text-foreground transition-colors hover:border-gold-line hover:text-gold"
            >
              Import a statement
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.id ?? "__none"}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-foreground/85">{row.name}</span>
                <span className="num text-sm text-foreground">
                  {formatMoney(row.current, base, { decimals: 0 })}
                  {row.change !== null && Math.abs(row.change) >= 2 && (
                    <span
                      className={
                        row.change > 0 ? "ml-2 text-xs text-loss" : "ml-2 text-xs text-gain"
                      }
                    >
                      {formatSignedPercent(row.change, 0)}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${(row.current / peak) * 100}%` }}
                  />
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-muted-foreground/40"
                    style={{ width: `${(row.previous / peak) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
          <li className="flex gap-4 border-t border-border pt-3 text-[0.7rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-gold" /> This month
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-muted-foreground/40" /> Last month
            </span>
          </li>
        </ul>
      )}
    </section>
  );
}
