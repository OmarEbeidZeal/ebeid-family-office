import type { ReactNode } from "react";
import { AlertTriangle, Check, Minus, X } from "lucide-react";
import { RowActions } from "@/components/RowActions";
import { formatMoney } from "@/lib/format";
import { monthKeyLabel, type ForecastHeadline } from "@/lib/forecast";
import { compareGoals, deltaOf, type ScenarioRun } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

/** A delta reads as a delta: sign first, magnitude second. */
function signedMoney(value: number, base: string) {
  const rounded = Math.round(value);
  if (rounded === 0) return `no change`;
  return `${rounded > 0 ? "+" : "−"}${formatMoney(Math.abs(value), base, { decimals: 0 })}`;
}

type ColumnProps = {
  base: string;
  baselineHeadline: ForecastHeadline;
  baselineResult: Parameters<typeof compareGoals>[0];
};

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "gain" | "loss" | "gold" | "neutral";
}) {
  return (
    <div className="border-b border-border/60 px-4 py-2.5 last:border-0">
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "num mt-1 text-sm",
          tone === "gain" && "text-gain",
          tone === "loss" && "text-loss",
          tone === "gold" && "text-gold",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** The baseline column — what happens if nothing changes. */
export function BaselineColumn({
  base,
  headline,
  reserveMonths,
}: {
  base: string;
  headline: ForecastHeadline;
  reserveMonths: number;
}) {
  return (
    <article className="hairline flex w-full min-w-[16rem] flex-col rounded-lg bg-surface">
      <header className="border-b border-border px-4 py-3">
        <p className="text-sm text-foreground">Baseline</p>
        <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted-foreground">
          Recorded income, outgoings, debts and goals, on the assumptions set on the forecast page.
        </p>
      </header>
      <Metric
        label="Net worth at 5 years"
        value={formatMoney(headline.endNetWorth, base, { decimals: 0 })}
        tone="gold"
      />
      <Metric
        label="Lowest cash point"
        value={formatMoney(headline.minCash, base, { decimals: 0 })}
        sub={monthKeyLabel(headline.minCashMonth)}
        tone={headline.minCash < 0 ? "loss" : "neutral"}
      />
      <Metric
        label="Deficit months"
        value={String(headline.deficitMonths)}
        sub={`Against a ${reserveMonths}-month reserve target`}
        tone={headline.deficitMonths > 0 ? "loss" : "gain"}
      />
      <Metric
        label="Goals on time"
        value={
          headline.goalsTotal ? `${headline.goalsOnTime} of ${headline.goalsTotal}` : "None dated"
        }
      />
      <Metric
        label="Where it first breaks"
        value={
          headline.breakingPoint ? monthKeyLabel(headline.breakingPoint.key) : "Nothing breaks"
        }
        sub={headline.breakingPoint?.reason}
        tone={headline.breakingPoint ? "loss" : "gain"}
      />
    </article>
  );
}

/** One scenario column, every figure shown as a delta against the baseline. */
export function ScenarioColumn({
  run,
  base,
  baselineHeadline,
  baselineResult,
  onEdit,
  onDelete,
}: ColumnProps & {
  run: ScenarioRun;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const delta = deltaOf(run.headline, baselineHeadline);
  const goals = compareGoals(baselineResult, run.result);
  const broken = goals.filter((goal) => goal.baseline?.onTime && goal.scenario?.onTime === false);

  return (
    <article className="hairline flex w-full min-w-[16rem] flex-col rounded-lg bg-surface">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{run.name}</p>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted-foreground">
            {run.summary}
          </p>
          {run.description && (
            <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground/80">
              {run.description}
            </p>
          )}
        </div>
        <RowActions label={run.name} onEdit={onEdit} onDelete={onDelete} />
      </header>

      {run.unavailable && (
        <p className="flex items-start gap-1.5 border-b border-border bg-surface-raised px-4 py-2 text-[0.68rem] leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
          {run.unavailable}
        </p>
      )}

      <Metric
        label="Net worth at 5 years"
        value={formatMoney(run.headline.endNetWorth, base, { decimals: 0 })}
        sub={`${signedMoney(delta.netWorth, base)} against baseline`}
        tone={delta.netWorth < 0 ? "loss" : "gain"}
      />
      <Metric
        label="Lowest cash point"
        value={formatMoney(run.headline.minCash, base, { decimals: 0 })}
        sub={`${monthKeyLabel(run.headline.minCashMonth)} · ${signedMoney(delta.minCash, base)}`}
        tone={run.headline.minCash < 0 ? "loss" : delta.minCash < 0 ? "neutral" : "gain"}
      />
      <Metric
        label="Deficit months"
        value={String(run.headline.deficitMonths)}
        sub={
          delta.deficitMonths === 0
            ? "Same as baseline"
            : `${delta.deficitMonths > 0 ? "+" : ""}${delta.deficitMonths} against baseline`
        }
        tone={delta.deficitMonths > 0 ? "loss" : run.headline.deficitMonths ? "neutral" : "gain"}
      />
      <Metric
        label="Goals on time"
        value={
          run.headline.goalsTotal
            ? `${run.headline.goalsOnTime} of ${run.headline.goalsTotal}`
            : "None dated"
        }
        sub={
          broken.length
            ? `${broken.map((goal) => goal.title).join(", ")} stops landing`
            : delta.goalsOnTime > 0
              ? "One more goal lands"
              : "No change to which goals land"
        }
        tone={broken.length ? "loss" : delta.goalsOnTime > 0 ? "gain" : "neutral"}
      />
      <Metric
        label="Where it first breaks"
        value={
          run.headline.breakingPoint
            ? monthKeyLabel(run.headline.breakingPoint.key)
            : "Nothing breaks"
        }
        sub={run.headline.breakingPoint?.reason}
        tone={run.headline.breakingPoint ? "loss" : "gain"}
      />

      {goals.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <p className="eyebrow">Goal by goal</p>
          <ul className="mt-1.5 space-y-1">
            {goals.map((goal) => {
              const onTime = goal.scenario?.onTime ?? null;
              return (
                <li key={goal.id} className="flex items-center justify-between gap-2 text-[0.7rem]">
                  <span className="truncate text-muted-foreground">{goal.title}</span>
                  <span
                    className={cn(
                      "num inline-flex shrink-0 items-center gap-1",
                      onTime === true && "text-gain",
                      onTime === false && "text-loss",
                      onTime === null && "text-muted-foreground",
                    )}
                  >
                    {onTime === true ? (
                      <Check className="h-3 w-3" />
                    ) : onTime === false ? (
                      <X className="h-3 w-3" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                    {onTime === false && goal.scenario
                      ? formatMoney(goal.scenario.shortfall, base, { decimals: 0 })
                      : onTime === null
                        ? "dropped"
                        : "funded"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}
