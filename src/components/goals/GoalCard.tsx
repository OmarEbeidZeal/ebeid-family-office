import type { HTMLAttributes } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowActions } from "@/components/RowActions";
import { GoalStatusPill } from "./GoalStatusPill";
import { LineItemsTable } from "./LineItemsTable";
import { SdltCalculator } from "./SdltCalculator";
import {
  GOAL_CATEGORY_LABELS,
  countryLabel,
  formatDate,
  formatMoney,
  formatPercent,
  titleise,
} from "@/lib/format";
import { HORIZON_RULES, type GoalPlanRow } from "@/lib/goal-math";
import type { GoalLineItemRow, GoalRow } from "@/hooks/useFinancials";
import { cn } from "@/lib/utils";

const PRIORITY_LABELS: Record<string, string> = {
  must_have: "Must have",
  want: "Want",
  nice_to_have: "Nice to have",
};

export type FundingCheck = { tone: "ok" | "warn" | "unknown"; message: string };

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
}) {
  const months = row.monthsRemaining === null ? null : Math.max(0, Math.round(row.monthsRemaining));
  const shortfall = row.requiredMonthly === null ? 0 : row.requiredMonthly - row.allocatedMonthly;
  const isProperty = goal.goal_category === "property";
  const horizon = row.horizon ? HORIZON_RULES[row.horizon] : null;

  return (
    <article
      className={cn(
        "hairline rounded-lg bg-surface transition-colors",
        row.status === "at_risk" && "border-loss/40",
        row.status === "achieved" && "opacity-80",
        dragging && "opacity-50",
        dropTarget && "border-gold",
      )}
    >
      <div className="px-4 py-4 sm:px-5">
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
            className="mt-0.5 cursor-grab rounded-sm p-1 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm text-foreground">{goal.title}</h3>
              <Badge variant="outline" className="text-[0.65rem]">
                {GOAL_CATEGORY_LABELS[goal.goal_category] ?? titleise(goal.goal_category)}
              </Badge>
              {goal.priority === "must_have" ? (
                <Badge className="bg-gold-soft text-[0.65rem] text-gold hover:bg-gold-soft">
                  Must have
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[0.65rem]">
                  {PRIORITY_LABELS[goal.priority] ?? titleise(goal.priority)}
                </Badge>
              )}
              <GoalStatusPill status={row.status} reason={row.statusReason} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {goal.country ? countryLabel(goal.country) : "No country set"}
              <span className="mx-1.5 text-border">·</span>
              {goal.target_date ? `Target ${formatDate(goal.target_date)}` : "No target date"}
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

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* The figure that turns a wish into a plan. */}
          <div className="rounded-md border border-gold-line bg-gold-soft px-4 py-3">
            <p className="eyebrow text-gold/80">Monthly contribution needed</p>
            {row.requiredMonthly === null ? (
              <>
                <p className="mt-1 text-sm text-foreground">Not calculable yet</p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                  {row.statusReason}
                </p>
              </>
            ) : (
              <>
                <p className="num mt-1 text-[1.65rem] font-light leading-tight text-gold">
                  {formatMoney(row.requiredMonthly, base, { decimals: 0 })}
                  <span className="text-sm text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                  {formatMoney(row.remaining, base, { decimals: 0 })} left over {months ?? 0} month
                  {months === 1 ? "" : "s"}
                </p>
                {shortfall > 1 ? (
                  <p className="num mt-1.5 text-[0.7rem] text-loss">
                    Surplus covers {formatMoney(row.allocatedMonthly, base, { decimals: 0 })} —{" "}
                    {formatMoney(shortfall, base, { decimals: 0 })} a month short
                    {row.slipMonths !== null && row.slipMonths > 0
                      ? `, about ${Math.round(row.slipMonths)} months late at this rate`
                      : ""}
                  </p>
                ) : (
                  <p className="num mt-1.5 text-[0.7rem] text-gain">Covered by current surplus</p>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="All-in cost"
              value={row.allIn > 0 ? formatMoney(row.allIn, base, { decimals: 0 }) : "Unpriced"}
              tone={row.allIn > 0 ? "default" : "warn"}
              sub={
                row.hasBreakdown
                  ? row.gap > 1
                    ? `${formatMoney(row.gap, base, { decimals: 0 })} above the headline`
                    : "From the costed breakdown"
                  : goal.currency !== base
                    ? formatMoney(Number(goal.target_amount), goal.currency, { decimals: 0 })
                    : "Headline figure only"
              }
              subTone={row.hasBreakdown && row.gap > 1 ? "warn" : "muted"}
            />
            <Metric
              label="Set aside"
              value={formatMoney(row.funded, base, { decimals: 0 })}
              sub={`${formatPercent(row.progressPct)} of the cash needed`}
            />
            <Metric
              label="Still to find"
              value={formatMoney(row.remaining, base, { decimals: 0 })}
              sub={
                row.financed > 0
                  ? `${formatMoney(row.financed, base, { decimals: 0 })} borrowed`
                  : "No borrowing"
              }
            />
            <Metric
              label="Horizon"
              value={horizon ? horizon.label : "No date"}
              sub={
                horizon
                  ? horizon.maxEquityPct === 0
                    ? "Hold in cash"
                    : `Up to ${horizon.maxEquityPct}% equity`
                  : "Add a date to set the rule"
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                row.progressPct >= 100
                  ? "bg-gain"
                  : row.status === "at_risk"
                    ? "bg-loss"
                    : "bg-gold",
              )}
              style={{ width: `${Math.min(100, Math.max(0, row.progressPct))}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-muted-foreground">
            <span className="num">
              {formatMoney(row.funded, base, { decimals: 0 })} of{" "}
              {row.cashNeeded > 0 ? formatMoney(row.cashNeeded, base, { decimals: 0 }) : "—"} in
              cash
            </span>
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-expanded={expanded}
            >
              {row.costs.itemCount > 0
                ? `${row.costs.itemCount} costed line${row.costs.itemCount === 1 ? "" : "s"}`
                : "Break it into line items"}
              {isProperty && " · stamp duty"}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              />
            </button>
          </div>
        </div>

        {fundingCheck && fundingCheck.tone !== "ok" && (
          <p
            className={cn(
              "mt-3 rounded-md px-3 py-2 text-[0.7rem] leading-relaxed",
              fundingCheck.tone === "warn"
                ? "border border-warn/30 bg-warn/10 text-warn"
                : "hairline bg-surface-raised text-muted-foreground",
            )}
          >
            {fundingCheck.message}
          </p>
        )}

        {row.costs.unpricedItems > 0 && (
          <p className="mt-3 text-[0.7rem] text-warn">
            {row.costs.unpricedItems} line item{row.costs.unpricedItems === 1 ? "" : "s"} still
            without a figure — the all-in total is understated until they are priced.
          </p>
        )}

        {goal.description && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{goal.description}</p>
        )}
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4 sm:px-5">
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm text-foreground">Costed breakdown</h4>
              <p className="text-[0.7rem] text-muted-foreground">
                The headline price is never the price. Every line here is a figure you entered.
              </p>
            </div>
            <LineItemsTable goal={goal} items={items} />
          </div>

          {isProperty && <SdltCalculator goal={goal} items={items} />}

          {horizon && (
            <p className="hairline rounded-md bg-surface-raised px-3 py-2 text-[0.7rem] leading-relaxed text-muted-foreground">
              <span className="text-foreground">{horizon.label}.</span> {horizon.guidance}
              {fundingCheck && fundingCheck.tone === "ok" && ` ${fundingCheck.message}`}
            </p>
          )}

          <div className="grid gap-3 text-[0.7rem] text-muted-foreground sm:grid-cols-3">
            <ExpandedFact
              label="Buys an asset"
              value={formatMoney(row.capitalValue, base, { decimals: 0 })}
              hint="Lands on the balance sheet when the goal completes"
            />
            <ExpandedFact
              label="Cost of getting there"
              value={formatMoney(row.netWorthCost, base, { decimals: 0 })}
              hint="Tax, fees and furnishing — spend that buys nothing resaleable"
            />
            <ExpandedFact
              label="Already paid"
              value={formatMoney(row.costs.secured, base, { decimals: 0 })}
              hint="Line items ticked as settled"
            />
          </div>

          <div className="flex flex-wrap gap-2 sm:hidden">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canMoveUp}
              onClick={onMoveUp}
            >
              Move up
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canMoveDown}
              onClick={onMoveDown}
            >
              Move down
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "default",
  subTone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn";
  subTone?: "muted" | "warn";
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={cn("num mt-1 text-sm font-light", tone === "warn" && "text-warn")}>{value}</p>
      {sub && (
        <p
          className={cn(
            "mt-0.5 text-[0.7rem]",
            subTone === "warn" ? "text-warn" : "text-muted-foreground",
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function ExpandedFact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="hairline rounded-md bg-surface-raised px-3 py-2">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-sm font-light text-foreground">{value}</p>
      <p className="mt-0.5 leading-relaxed">{hint}</p>
    </div>
  );
}
