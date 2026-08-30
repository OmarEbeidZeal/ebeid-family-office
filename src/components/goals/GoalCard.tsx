import type { HTMLAttributes } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RowActions } from "@/components/RowActions";
import { ProgressRing } from "@/components/ProgressRing";
import { GoalStatusPill } from "./GoalStatusPill";
import { GoalPhoto } from "./GoalPhoto";
import { LineItemsTable } from "./LineItemsTable";
import { SdltCalculator } from "./SdltCalculator";
import { RING_TONE, STATUS_TONE, priorityMeta } from "./goal-visuals";
import {
  GOAL_CATEGORY_LABELS,
  countryLabel,
  formatDate,
  formatMoney,
  formatPercent,
  formatReadableMoney,
  titleise,
} from "@/lib/format";
import { HORIZON_RULES, type GoalPlanRow } from "@/lib/goal-math";
import type { GoalLineItemRow, GoalRow } from "@/hooks/useFinancials";
import { cn } from "@/lib/utils";

export type FundingCheck = { tone: "ok" | "warn" | "unknown"; message: string };

export type WhatIfProjection = {
  label: string;
  tone: "gain" | "warn" | "loss" | "muted";
} | null;

export function GoalCard({
  row,
  goal,
  items,
  base,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  gripProps,
  fundingCheck,
  dragging,
  dropTarget,
  whatIf,
  highlighted,
}: {
  row: GoalPlanRow;
  goal: GoalRow;
  items: GoalLineItemRow[];
  base: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  gripProps: HTMLAttributes<HTMLButtonElement>;
  fundingCheck: FundingCheck | null;
  dragging: boolean;
  dropTarget: boolean;
  whatIf?: WhatIfProjection;
  highlighted?: boolean;
}) {
  const months = row.monthsRemaining === null ? null : Math.max(0, Math.round(row.monthsRemaining));
  const shortfall = row.requiredMonthly === null ? 0 : row.requiredMonthly - row.allocatedMonthly;
  const isProperty = goal.goal_category === "property";
  const horizon = row.horizon ? HORIZON_RULES[row.horizon] : null;
  const priority = priorityMeta(goal.priority);
  const tone = STATUS_TONE[row.status];

  return (
    <article
      className={cn(
        "panel relative overflow-hidden transition-colors",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
        priority.edge,
        row.status === "at_risk" && "border-loss/40",
        row.status === "achieved" && "opacity-80",
        dragging && "opacity-50",
        dropTarget && "border-gold",
        highlighted && "ring-1 ring-gold",
      )}
    >
      <GoalPhoto path={goal.image_path} />

      <div className="relative px-4 py-5 pl-5 sm:px-6 sm:pl-7">
        <div className="flex items-start gap-2">
          <button
            type="button"
            {...gripProps}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" && canMoveUp) {
                event.preventDefault();
                onMoveUp();
              }
              if (event.key === "ArrowDown" && canMoveDown) {
                event.preventDefault();
                onMoveDown();
              }
              gripProps.onKeyDown?.(event);
            }}
            aria-label={`Reorder ${goal.title}. Use the arrow keys to change its priority order.`}
            className="-ml-1 mt-0.5 hidden cursor-grab rounded-sm p-1 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:block"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h3 className="text-base font-light text-foreground">{goal.title}</h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em]",
                  priority.badge,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
                {priority.label}
              </span>
              <GoalStatusPill status={row.status} reason={row.statusReason} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {GOAL_CATEGORY_LABELS[goal.goal_category] ?? titleise(goal.goal_category)}
              <span className="mx-1.5 text-border">·</span>
              {goal.country ? countryLabel(goal.country) : "No country set"}
              <span className="mx-1.5 text-border">·</span>
              {goal.target_date ? formatDate(goal.target_date) : "No target date"}
              {months !== null && (
                <span className="num">
                  {" "}
                  · {months} month{months === 1 ? "" : "s"} away
                </span>
              )}
            </p>
          </div>

          <RowActions label={goal.title} onEdit={onEdit} onDelete={onDelete} />
        </div>

        {/* The face of the card: how far along, and the three numbers that decide. */}
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <ProgressRing
            value={row.progressPct}
            size={92}
            tone={RING_TONE[tone]}
            label={row.cashNeeded > 0 ? formatPercent(row.progressPct, 0) : "—"}
            caption="funded"
            ariaLabel={`${Math.round(row.progressPct)} per cent of ${goal.title} funded`}
            className="mx-auto sm:mx-0"
          />

          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Headline
              label="All-in cost"
              value={row.allIn > 0 ? formatReadableMoney(row.allIn, base) : "Unpriced"}
              exact={row.allIn > 0 ? formatMoney(row.allIn, base, { decimals: 0 }) : undefined}
              tone={row.allIn > 0 ? "default" : "warn"}
            />
            <Headline
              label="Saved"
              value={formatReadableMoney(row.funded, base)}
              exact={formatMoney(row.funded, base, { decimals: 0 })}
            />
            <Headline
              label="A month"
              value={
                row.requiredMonthly === null
                  ? "Not yet"
                  : `${formatReadableMoney(row.requiredMonthly, base)}`
              }
              exact={
                row.requiredMonthly === null
                  ? undefined
                  : `${formatMoney(row.requiredMonthly, base, { decimals: 0 })} a month`
              }
              tone={row.requiredMonthly === null ? "muted" : "gold"}
            />
          </div>
        </div>

        {whatIf && (
          <p
            className={cn(
              "mt-4 text-xs",
              whatIf.tone === "gain" && "text-gain",
              whatIf.tone === "warn" && "text-warn",
              whatIf.tone === "loss" && "text-loss",
              whatIf.tone === "muted" && "text-muted-foreground",
            )}
          >
            {whatIf.label}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {row.requiredMonthly === null
              ? row.statusReason
              : shortfall > 1
                ? `${formatMoney(shortfall, base, { decimals: 0 })} a month short of what this needs`
                : "Covered by the current surplus"}
          </p>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
          >
            {expanded ? "Hide detail" : "Detail"}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="relative space-y-5 border-t border-border bg-surface px-4 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail
              label="Still to find"
              value={formatMoney(row.remaining, base, { decimals: 0 })}
              hint={
                row.financed > 0
                  ? `${formatMoney(row.financed, base, { decimals: 0 })} of it borrowed`
                  : "No borrowing against this goal"
              }
            />
            <Detail
              label="Cash needed at completion"
              value={row.cashNeeded > 0 ? formatMoney(row.cashNeeded, base, { decimals: 0 }) : "—"}
              hint={
                row.hasBreakdown
                  ? row.gap > 1
                    ? `${formatMoney(row.gap, base, { decimals: 0 })} above the headline figure`
                    : "From the costed breakdown"
                  : goal.currency !== base
                    ? `Headline ${formatMoney(Number(goal.target_amount), goal.currency, { decimals: 0 })}`
                    : "Headline figure only"
              }
              hintTone={row.hasBreakdown && row.gap > 1 ? "warn" : "muted"}
            />
            <Detail
              label="Buys an asset"
              value={formatMoney(row.capitalValue, base, { decimals: 0 })}
              hint="Lands on the balance sheet when the goal completes"
            />
            <Detail
              label="Cost of getting there"
              value={formatMoney(row.netWorthCost, base, { decimals: 0 })}
              hint="Tax, fees and furnishing — spend that buys nothing resaleable"
            />
          </div>

          {fundingCheck && fundingCheck.tone !== "ok" && (
            <p
              className={cn(
                "rounded-md px-3 py-2.5 text-xs leading-relaxed",
                fundingCheck.tone === "warn"
                  ? "border border-warn/30 bg-warn/10 text-warn"
                  : "hairline bg-surface-raised text-muted-foreground",
              )}
            >
              {fundingCheck.message}
            </p>
          )}

          {row.costs.unpricedItems > 0 && (
            <p className="text-xs text-warn">
              {row.costs.unpricedItems} line item{row.costs.unpricedItems === 1 ? "" : "s"} still
              without a figure — the all-in total is understated until they are priced.
            </p>
          )}

          {goal.description && (
            <p className="text-xs leading-relaxed text-muted-foreground">{goal.description}</p>
          )}

          <div>
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm text-foreground">Costed breakdown</h4>
              <p className="text-xs text-muted-foreground">
                The headline price is never the price. Every line here is a figure you entered.
              </p>
            </div>
            <LineItemsTable goal={goal} items={items} />
          </div>

          {isProperty && <SdltCalculator goal={goal} items={items} />}

          {horizon && (
            <p className="hairline rounded-md bg-surface-raised px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <span className="text-foreground">{horizon.label}.</span> {horizon.guidance}
              {fundingCheck && fundingCheck.tone === "ok" && ` ${fundingCheck.message}`}
            </p>
          )}

          <div className="flex flex-wrap gap-2 sm:hidden">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              className="min-h-11"
            >
              Move up
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              className="min-h-11"
            >
              Move down
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function Headline({
  label,
  value,
  exact,
  tone = "default",
}: {
  label: string;
  value: string;
  exact?: string | undefined;
  tone?: "default" | "gold" | "warn" | "muted";
}) {
  return (
    <div title={exact}>
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "num mt-1.5 text-xl font-light tracking-tight",
          tone === "gold" && "text-gold",
          tone === "warn" && "text-warn",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
  hint,
  hintTone = "muted",
}: {
  label: string;
  value: string;
  hint: string;
  hintTone?: "muted" | "warn";
}) {
  return (
    <div className="hairline rounded-md bg-surface-raised px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-sm font-light text-foreground">{value}</p>
      <p
        className={cn(
          "mt-1 text-[0.7rem] leading-relaxed",
          hintTone === "warn" ? "text-warn" : "text-muted-foreground",
        )}
      >
        {hint}
      </p>
    </div>
  );
}
