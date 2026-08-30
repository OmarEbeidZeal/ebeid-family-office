import { Link } from "@tanstack/react-router";
import { Money } from "@/components/Money";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatPercent } from "@/lib/format";
import type { ObservedSpending } from "@/hooks/useObservedSpending";
import { cn } from "@/lib/utils";

/**
 * The essential monthly baseline is the number the emergency runway and the
 * forecast both key off, so it leads the page — with the honest caveat about
 * how much history it rests on.
 */
export function EssentialSplitPanel({ spending }: { spending: ObservedSpending }) {
  const {
    essentialBaseline,
    lifestyleBaseline,
    spendBaseline,
    uncategorisedBaseline,
    movedBaseline,
    base,
  } = spending;

  const months = spending.completeMonthCount;
  const essential = essentialBaseline ?? 0;
  const lifestyle = lifestyleBaseline ?? 0;
  const unknown = uncategorisedBaseline ?? 0;
  const moved = movedBaseline ?? 0;
  const total = spendBaseline ?? essential + lifestyle + unknown;
  const essentialShare = total > 0 ? (essential / total) * 100 : 0;
  const lifestyleShare = total > 0 ? (lifestyle / total) * 100 : 0;
  const unknownShare = Math.max(0, 100 - essentialShare - lifestyleShare);

  if (essentialBaseline === null) {
    return (
      <section className="hairline rounded-lg bg-surface p-5">
        <p className="text-sm text-foreground">Essential baseline needs two complete months</p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {months === 0
            ? "Once a full calendar month of statements is imported, the essential monthly baseline is calculated from what actually left the accounts — not from an estimate."
            : "One complete month is imported. The baseline is the median of complete months, so it appears after the second one, rather than treating a single month as typical."}
        </p>
      </section>
    );
  }

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="cursor-help text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                Essential monthly baseline
              </p>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">
              The median of your last {Math.min(6, months)} complete months of spending in
              categories marked essential. Emergency runway and the forecast both key off this
              figure.
            </TooltipContent>
          </Tooltip>
          <p className="num mt-1.5 text-4xl font-light tracking-tight text-foreground">
            {formatMoney(essential, base, { decimals: 0 })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPercent(essentialShare, 0)} of everything that goes out, from{" "}
            <span className="num">{months}</span> complete month{months === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex gap-8">
          <Figure label="Lifestyle" value={lifestyle} base={base} tone="text-foreground/85" />
          <Figure label="All spending" value={total} base={base} tone="text-foreground" />
          {moved > 0 && (
            <Figure
              label="Set aside"
              value={moved}
              base={base}
              tone="text-gain"
              hint="Money moved into your own savings or investment pots. It left the current account but it is still yours, so it is counted as saved rather than spent."
            />
          )}
        </div>
      </div>

      <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full bg-gold" style={{ width: `${essentialShare}%` }} />
        <div className="h-full bg-muted-foreground/45" style={{ width: `${lifestyleShare}%` }} />
        <div className="h-full bg-warn/50" style={{ width: `${unknownShare}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.7rem] text-muted-foreground">
        <Legend colour="bg-gold" label={`Essential ${formatPercent(essentialShare, 0)}`} />
        <Legend
          colour="bg-muted-foreground/45"
          label={`Lifestyle ${formatPercent(lifestyleShare, 0)}`}
        />
        {unknown > 0 && (
          <Legend
            colour="bg-warn/50"
            label={`Uncategorised ${formatMoney(unknown, base, { decimals: 0 })}/mo`}
          />
        )}
        {unknown > 0 && (
          <Link to="/transactions" className="text-gold underline-offset-4 hover:underline">
            Clear the review queue to sharpen this
          </Link>
        )}
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  base,
  tone,
  hint,
}: {
  label: string;
  value: number;
  base: string;
  tone: string;
  hint?: string;
}) {
  const heading = (
    <p
      className={cn(
        "text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground",
        hint && "cursor-help",
      )}
    >
      {label}
    </p>
  );

  return (
    <div>
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>{heading}</TooltipTrigger>
          <TooltipContent className="max-w-64 text-xs">{hint}</TooltipContent>
        </Tooltip>
      ) : (
        heading
      )}
      <Money
        amount={value}
        currency={base}
        decimals={0}
        hideConverted
        align="left"
        className={cn("mt-1.5 text-xl font-light", tone)}
      />
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-4 rounded-full", colour)} />
      {label}
    </span>
  );
}
