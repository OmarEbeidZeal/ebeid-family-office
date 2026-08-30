import { TrendingUp } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatMoney, formatSignedPercent } from "@/lib/format";
import type { ObservedSpending } from "@/hooks/useObservedSpending";

const CREEP_THRESHOLD = 5;

export function RecurringPanel({ spending }: { spending: ObservedSpending }) {
  const items = spending.recurring.slice(0, 12);
  const annualTotal = spending.recurring.reduce((sum, item) => sum + item.annual, 0);

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Standing costs"
        description="Subscriptions and regular payments detected across your statements, priced per year."
      />

      {items.length === 0 ? (
        <p className="py-6 text-sm leading-relaxed text-muted-foreground">
          Nothing has repeated often enough yet to call it a standing cost. A merchant needs to
          appear in at least three months at a stable amount before it is listed here.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const crept = item.creep !== null && item.creep > CREEP_THRESHOLD;
              return (
                <li key={item.key} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm text-foreground/90">
                      {item.label}
                      {crept && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-0.5 text-[0.65rem] text-warn">
                              <TrendingUp className="size-3" />
                              {formatSignedPercent(item.creep!, 0)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-56 text-xs">
                            First charge {formatMoney(item.earliest, spending.base)}, latest{" "}
                            {formatMoney(item.latest, spending.base)}.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </p>
                    <p className="num mt-0.5 text-[0.7rem] text-muted-foreground">
                      {item.category ?? "Uncategorised"} · {item.occurrences} charges across{" "}
                      {item.months} months · last {formatDate(item.lastDate, "short")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-sm text-foreground">
                      {formatMoney(item.annual, spending.base, { decimals: 0 })}
                      <span className="text-xs text-muted-foreground">/yr</span>
                    </p>
                    <p className="num text-[0.7rem] text-muted-foreground">
                      {formatMoney(item.monthly, spending.base)}/mo
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">
              {spending.recurring.length} standing costs, annualised
            </span>
            <span className="num text-foreground">
              {formatMoney(annualTotal, spending.base, { decimals: 0 })}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
