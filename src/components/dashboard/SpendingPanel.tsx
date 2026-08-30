import { useMemo } from "react";
import { useCategories, useRecentTransactions } from "@/hooks/useFinancials";
import { useCurrency } from "@/hooks/useCurrency";
import { formatMoney, formatPercent } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function SpendingPanel() {
  const { data: transactions, isLoading } = useRecentTransactions(2);
  const { data: categories } = useCategories();
  const { base, convert } = useCurrency();

  const rows = useMemo(() => {
    if (!transactions?.length) return [];
    const now = new Date();
    const thisMonth = monthKey(now);
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = monthKey(previous);
    const names = new Map((categories ?? []).map((c) => [c.id, c.name]));
    const totals = new Map<string, { current: number; previous: number }>();

    for (const tx of transactions) {
      if (tx.direction !== "debit" || tx.is_transfer) continue;
      const key = monthKey(new Date(tx.booked_date));
      if (key !== thisMonth && key !== lastMonth) continue;
      const label = names.get(tx.category_id ?? "") ?? "Uncategorised";
      const value = tx.amount_base != null ? Number(tx.amount_base) : convert(Number(tx.amount), tx.currency, base);
      const entry = totals.get(label) ?? { current: 0, previous: 0 };
      if (key === thisMonth) entry.current += value;
      else entry.previous += value;
      totals.set(label, entry);
    }

    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.current - a.current)
      .slice(0, 6);
  }, [transactions, categories, convert, base]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No spending recorded yet"
        body="Once statements are imported — or transactions added — this shows your biggest categories this month against last month, so a creeping bill is obvious immediately."
      />
    );
  }

  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const delta = row.previous > 0 ? ((row.current - row.previous) / row.previous) * 100 : null;
        return (
          <li key={row.name} className="flex items-center justify-between py-3">
            <span className="text-sm">{row.name}</span>
            <span className="flex items-baseline gap-3">
              <span className="num text-sm">{formatMoney(row.current, base, { decimals: 0 })}</span>
              {delta !== null && (
                <span className={`num text-xs ${delta > 0 ? "text-loss" : "text-gain"}`}>
                  {formatPercent(delta, 0)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
