import { useMemo } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatMoney } from "@/lib/format";
import { monthLabel, shiftMonth } from "@/lib/spending";
import type { ObservedSpending } from "@/hooks/useObservedSpending";

export function MerchantsPanel({ spending }: { spending: ObservedSpending }) {
  const since = shiftMonth(spending.thisMonth, -2);
  const merchants = useMemo(() => spending.merchants(since, 10), [spending, since]);
  const peak = Math.max(1, ...merchants.map((merchant) => merchant.total));

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Top merchants"
        description={`Largest recipients since ${monthLabel(since, "long")}.`}
      />

      {merchants.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No outgoing transactions in the last three months on the accounts in view.
        </p>
      ) : (
        <ul className="space-y-3">
          {merchants.map((merchant) => (
            <li key={merchant.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-foreground/90">
                  {merchant.label}
                </span>
                <span className="num shrink-0 text-sm text-foreground">
                  {formatMoney(merchant.total, spending.base, { decimals: 0 })}
                  <span className="ml-2 text-[0.7rem] text-muted-foreground">
                    {merchant.count}×
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full bg-gold/70"
                  style={{ width: `${(merchant.total / peak) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
