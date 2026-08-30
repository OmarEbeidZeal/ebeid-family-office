import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { Money } from "@/components/Money";
import { SelectNative } from "@/components/forms/FormField";
import { formatDate, formatMoney, formatSignedPercent } from "@/lib/format";
import { monthLabel, shiftMonth, type CategorySpend } from "@/lib/spending";
import type { ObservedSpending } from "@/hooks/useObservedSpending";
import { cn } from "@/lib/utils";

export function CategoryBreakdown({ spending }: { spending: ObservedSpending }) {
  const monthsWithActivity = spending.months.filter((month) => month.count > 0);
  const latest = monthsWithActivity[monthsWithActivity.length - 1]?.month ?? spending.thisMonth;
  const [month, setMonth] = useState(latest);
  const [open, setOpen] = useState<string | null>(null);

  const selected = monthsWithActivity.some((entry) => entry.month === month) ? month : latest;
  const previous = shiftMonth(selected, -1);

  const rows: CategorySpend[] = useMemo(
    () =>
      spending.breakdown(selected, previous).filter((row) => row.current > 0 || row.previous > 0),
    [spending, selected, previous],
  );

  const total = rows.reduce((sum, row) => sum + row.current, 0);
  const peak = Math.max(1, ...rows.map((row) => Math.max(row.current, row.previous)));

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Where the money goes"
        description={`Every category in ${monthLabel(selected, "long")}, against ${monthLabel(previous, "long")}.`}
        action={
          <div className="w-40">
            <SelectNative
              value={selected}
              onChange={setMonth}
              options={[...monthsWithActivity]
                .reverse()
                .map((entry) => ({ value: entry.month, label: monthLabel(entry.month, "long") }))}
              className="h-8 text-xs"
            />
          </div>
        }
      />

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Nothing was spent in {monthLabel(selected, "long")} on the accounts in view.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const key = row.id ?? "__none";
            const expanded = open === key;
            return (
              <li key={key} className="py-2.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setOpen(expanded ? null : key)}
                >
                  <ChevronRight
                    className={cn(
                      "size-3 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-90",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-sm text-foreground/90">{row.name}</span>
                        {row.essential && (
                          <span className="shrink-0 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                            essential
                          </span>
                        )}
                      </span>
                      <span className="num shrink-0 text-sm text-foreground">
                        {formatMoney(row.current, spending.base, { decimals: 0 })}
                        {row.change !== null && Math.abs(row.change) >= 1 && (
                          <span
                            className={cn(
                              "ml-2 text-xs",
                              row.change > 0 ? "text-loss" : "text-gain",
                            )}
                          >
                            {formatSignedPercent(row.change, 0)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <Bar value={row.current} peak={peak} className="bg-gold" />
                      <Bar value={row.previous} peak={peak} className="bg-muted-foreground/35" />
                    </div>
                  </div>
                </button>

                {expanded && (
                  <ul className="mt-2 space-y-1 border-l border-border pl-5">
                    {row.rows.slice(0, 25).map((transaction) => (
                      <li
                        key={transaction.id}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="num w-16 shrink-0 text-muted-foreground">
                          {formatDate(transaction.booked_date, "short")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground/80">
                          {transaction.merchant ?? transaction.description ?? "Unlabelled"}
                        </span>
                        <Money
                          amount={transaction.amount}
                          currency={transaction.currency}
                          hideConverted
                          className="text-xs text-foreground/80"
                        />
                      </li>
                    ))}
                    {row.rows.length > 25 && (
                      <li className="num text-[0.7rem] text-muted-foreground">
                        + {row.rows.length - 25} more in this category
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
          <li className="flex items-baseline justify-between gap-3 pt-3 text-sm">
            <span className="text-muted-foreground">Total out</span>
            <span className="num text-foreground">
              {formatMoney(total, spending.base, { decimals: 0 })}
            </span>
          </li>
        </ul>
      )}
    </section>
  );
}

function Bar({ value, peak, className }: { value: number; peak: number; className: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        className={cn("h-full rounded-full", className)}
        style={{ width: `${Math.min(100, (value / peak) * 100)}%` }}
      />
    </div>
  );
}
