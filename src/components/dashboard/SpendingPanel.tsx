import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatSignedPercent } from "@/lib/format";
import { useCategories, useRecentTransactions } from "@/hooks/useFinancials";
import { useCurrency } from "@/hooks/useCurrency";

type CategorySpend = { name: string; thisMonth: number; lastMonth: number };

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function SpendingPanel() {
  const { convert, base } = useCurrency();
  const transactionsQuery = useRecentTransactions(2);
  const categoriesQuery = useCategories();

  const loading = transactionsQuery.isLoading || categoriesQuery.isLoading;

  const rows = useMemo<CategorySpend[]>(() => {
    const transactions = transactionsQuery.data ?? [];
    if (transactions.length === 0) return [];

    const categoryNames = new Map(
      (categoriesQuery.data ?? []).map((category) => [category.id, category.name]),
    );
    const now = new Date();
    const current = monthKey(now);
    const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previous = monthKey(previousDate);

    const totals = new Map<string, CategorySpend>();
    for (const transaction of transactions) {
      if (transaction.is_transfer) continue;
      if (transaction.direction !== "out") continue;
      const key = monthKey(new Date(transaction.booked_date));
      if (key !== current && key !== previous) continue;

      const name = transaction.category_id
        ? (categoryNames.get(transaction.category_id) ?? "Uncategorised")
        : "Uncategorised";
      const value =
        transaction.amount_base !== null
          ? Math.abs(Number(transaction.amount_base))
          : Math.abs(convert(Number(transaction.amount), transaction.currency, base));

      const entry = totals.get(name) ?? { name, thisMonth: 0, lastMonth: 0 };
      if (key === current) entry.thisMonth += value;
      else entry.lastMonth += value;
      totals.set(name, entry);
    }

    return Array.from(totals.values())
      .sort((a, b) => b.thisMonth + b.lastMonth - (a.thisMonth + a.lastMonth))
      .slice(0, 6);
  }, [transactionsQuery.data, categoriesQuery.data, convert, base]);

  const peak = Math.max(1, ...rows.flatMap((row) => [row.thisMonth, row.lastMonth]));

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Where the money goes"
        description="Top categories this month against last, from parsed statement transactions."
      />

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No transactions recorded yet"
          body="Spending is calculated from real parsed statements, never estimated. Statement upload and parsing land in the next build, and this panel fills in the moment the first statement is processed."
          action={
            <Link
              to="/transactions"
              className="inline-flex h-9 items-center rounded-md border border-border bg-surface-raised px-4 text-sm text-foreground transition-colors hover:border-gold-line hover:text-gold"
            >
              See what's coming
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => {
            const change =
              row.lastMonth > 0 ? ((row.thisMonth - row.lastMonth) / row.lastMonth) * 100 : null;
            return (
              <li key={row.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm text-foreground/85">{row.name}</span>
                  <span className="num text-sm text-foreground">
                    {formatMoney(row.thisMonth, base, { decimals: 0 })}
                    {change !== null && (
                      <span
                        className={
                          change > 2
                            ? "ml-2 text-xs text-loss"
                            : change < -2
                              ? "ml-2 text-xs text-gain"
                              : "ml-2 text-xs text-muted-foreground"
                        }
                      >
                        {formatSignedPercent(change, 0)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${(row.thisMonth / peak) * 100}%` }}
                    />
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-muted-foreground/40"
                      style={{ width: `${(row.lastMonth / peak) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
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
