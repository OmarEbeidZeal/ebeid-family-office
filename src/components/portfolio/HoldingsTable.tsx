import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatMoney,
  formatPercent,
  formatSignedPercent,
  relativeTime,
} from "@/lib/format";
import { SLEEVE_LABELS } from "@/lib/policy";
import type { Position } from "@/lib/portfolio";

type SortKey =
  | "ticker"
  | "quantity"
  | "avgCost"
  | "price"
  | "value"
  | "unrealised"
  | "unrealisedPct"
  | "dayChange"
  | "weight";

const NUMERIC: Record<SortKey, (position: Position) => number | null> = {
  ticker: () => null,
  quantity: (p) => p.quantity,
  avgCost: (p) => p.avgCost,
  price: (p) => p.price,
  value: (p) => p.marketValueBase,
  unrealised: (p) => p.unrealisedBase,
  unrealisedPct: (p) => p.unrealisedPct,
  dayChange: (p) => p.dayChangeBase,
  weight: (p) => p.portfolioWeightPct,
};

/**
 * Two different silences, worded differently. A holding typed in without a cost
 * is waiting for someone to type one; a holding whose purchase predates every
 * imported export is waiting for a file, and saying "no cost recorded" there
 * would blame the household for the importer's blind spot.
 */
function basisLabel(position: Position): string {
  return position.openingQuantity > 0 ? "Cost not in your files" : "No cost recorded";
}

function basisTitle(position: Position): string {
  return position.openingQuantity > 0
    ? `${position.ticker} was bought before the earliest statement you have imported, so its purchase price is in none of your files. Import the earlier export and the cost fills in by itself.`
    : `No purchase price recorded for ${position.ticker}. Add the trades, or set an average cost on the holding.`;
}


function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "px-3 py-3 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
        {label}
      </button>
    </th>
  );
}

/** The price cell is the honesty surface: live, or plainly nothing. */
function PriceCell({ position }: { position: Position }) {
  if (position.priced && position.price !== null) {
    return (
      <div className="flex flex-col items-end">
        <span className="num">
          {formatMoney(position.price, position.priceCurrency, { decimals: 2 })}
        </span>
        <span className="text-[0.65rem] leading-tight text-muted-foreground">
          {position.asOf ? relativeTime(position.asOf) : "as of unknown"}
        </span>
      </div>
    );
  }

  const reason =
    position.quoteSource === "stale"
      ? "The provider failed on the last attempt. The most recent price we ever saw is deliberately not shown as if it were current."
      : (position.quoteError ??
        "No price returned for this ticker. Check the symbol matches the exchange listing, or add a market-data key.");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help text-xs text-warn underline decoration-dotted underline-offset-4">
          No live price
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[16rem] text-xs leading-relaxed">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}

export function HoldingsTable({
  positions,
  base,
  loading,
  onEdit,
  onDelete,
  onTrade,
  onSelect,
}: {
  positions: Position[];
  base: string;
  loading?: boolean;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
  onTrade: (position: Position) => void;
  onSelect: (position: Position) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "value",
    direction: "desc",
  });

  const rows = useMemo(() => {
    const copy = [...positions];
    copy.sort((a, b) => {
      if (sort.key === "ticker") {
        return sort.direction === "asc"
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      }
      const pick = NUMERIC[sort.key];
      const av = pick(a);
      const bv = pick(b);
      if (av === null && bv === null) return a.ticker.localeCompare(b.ticker);
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.direction === "asc" ? av - bv : bv - av;
    });
    return copy;
  }, [positions, sort]);

  const totals = useMemo(() => {
    const priced = positions.filter((position) => position.priced);
    return {
      value: priced.reduce((sum, position) => sum + (position.marketValueBase ?? 0), 0),
      unrealised: priced.reduce((sum, position) => sum + (position.unrealisedBase ?? 0), 0),
      dayChange: priced.reduce((sum, position) => sum + (position.dayChangeBase ?? 0), 0),
    };
  }, [positions]);

  const toggle = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "ticker" ? "asc" : "desc" },
    );

  if (loading) {
    return (
      <div className="hairline space-y-px overflow-hidden rounded-lg bg-surface">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex items-center justify-between px-4 py-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Desktop ledger */}
      <div className="hairline hidden overflow-x-auto rounded-lg bg-surface md:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b">
              <SortHeader
                label="Holding"
                sortKey="ticker"
                align="left"
                active={sort.key === "ticker"}
                direction={sort.direction}
                onSort={toggle}
              />
              <SortHeader
                label="Qty"
                sortKey="quantity"
                active={sort.key === "quantity"}
                direction={sort.direction}
                onSort={toggle}
              />
              <SortHeader
                label="Avg cost"
                sortKey="avgCost"
                active={sort.key === "avgCost"}
                direction={sort.direction}
                onSort={toggle}
              />
              <SortHeader
                label="Price"
                sortKey="price"
                active={sort.key === "price"}
                direction={sort.direction}
                onSort={toggle}
              />
              <SortHeader
                label="Market value"
                sortKey="value"
                active={sort.key === "value"}
                direction={sort.direction}
                onSort={toggle}
              />
              <SortHeader
                label="Unrealised"
                sortKey="unrealised"
                active={sort.key === "unrealised"}
                direction={sort.direction}
                onSort={toggle}
              />
              <SortHeader
                label="Today"
                sortKey="dayChange"
                active={sort.key === "dayChange"}
                direction={sort.direction}
                onSort={toggle}
              />
              <SortHeader
                label="Weight"
                sortKey="weight"
                active={sort.key === "weight"}
                direction={sort.direction}
                onSort={toggle}
              />
              <th className="w-10 px-2" />
            </tr>
          </thead>

          <tbody>
            {rows.map((position) => (
              <tr key={position.id} className="border-b last:border-b-0 hover:bg-surface-raised">
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(position)}
                    className="text-left transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <span className="num text-sm text-foreground">{position.ticker}</span>
                    <span className="mt-0.5 block max-w-[16rem] truncate text-xs text-muted-foreground">
                      {position.name ?? SLEEVE_LABELS[position.sleeve]}
                    </span>
                  </button>
                  <span className="mt-1 inline-block rounded-sm border border-border-strong bg-surface-raised px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.1em] text-muted-foreground">
                    {SLEEVE_LABELS[position.sleeve]}
                  </span>
                </td>

                <td className="num px-3 py-3 text-right text-foreground/85">
                  {formatAmount(position.quantity, {
                    decimals: position.quantity % 1 === 0 ? 0 : 4,
                  })}
                </td>

                <td className="px-3 py-3 text-right">
                  {position.avgCost === null ? (
                    <span className="text-xs text-muted-foreground" title={basisTitle(position)}>
                      —
                    </span>
                  ) : (
                    <span className="num text-foreground/85">
                      {formatMoney(position.avgCost, position.holding.currency, { decimals: 2 })}
                    </span>
                  )}
                </td>

                <td className="px-3 py-3 text-right">
                  <PriceCell position={position} />
                </td>

                <td className="px-3 py-3 text-right">
                  {position.priced && position.marketValueNative !== null ? (
                    <Money amount={position.marketValueNative} currency={position.priceCurrency} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                <td className="px-3 py-3 text-right">
                  {position.unrealisedBase === null ? (
                    <span className="text-xs text-muted-foreground" title={basisTitle(position)}>
                      {position.avgCost === null ? basisLabel(position) : "—"}
                    </span>
                  ) : (

                    <div className="flex flex-col items-end">
                      <Money
                        amount={position.unrealisedBase}
                        currency={base}
                        signed
                        hideConverted
                        decimals={0}
                      />
                      {position.unrealisedPct !== null && (
                        <span
                          className={cn(
                            "num text-[0.7rem] leading-tight",
                            position.unrealisedPct > 0 && "text-gain",
                            position.unrealisedPct < 0 && "text-loss",
                          )}
                        >
                          {formatSignedPercent(position.unrealisedPct)}
                        </span>
                      )}
                    </div>
                  )}
                </td>

                <td className="px-3 py-3 text-right">
                  {position.dayChangeBase === null ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span
                        className={cn(
                          "num",
                          position.dayChangeBase > 0 && "text-gain",
                          position.dayChangeBase < 0 && "text-loss",
                        )}
                      >
                        {position.dayChangePct === null
                          ? "—"
                          : formatSignedPercent(position.dayChangePct)}
                      </span>
                      <span className="num text-[0.7rem] leading-tight text-muted-foreground">
                        {formatMoney(position.dayChangeBase, base, { decimals: 0 })}
                      </span>
                    </div>
                  )}
                </td>

                <td className="num px-3 py-3 text-right text-foreground/85">
                  {position.portfolioWeightPct === null
                    ? "—"
                    : formatPercent(position.portfolioWeightPct)}
                </td>

                <td className="px-2 py-3 text-right">
                  <RowActions
                    label={position.ticker}
                    onEdit={() => onEdit(position)}
                    onDelete={() => onDelete(position)}
                    deleteDescription="The holding and every trade recorded against it are removed. This cannot be undone."
                  />
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t border-border-strong bg-surface-raised/60">
              <td className="px-3 py-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Total
              </td>
              <td colSpan={3} />
              <td className="num px-3 py-3 text-right text-foreground">
                {formatMoney(totals.value, base, { decimals: 0 })}
              </td>
              <td
                className={cn(
                  "num px-3 py-3 text-right",
                  totals.unrealised > 0 && "text-gain",
                  totals.unrealised < 0 && "text-loss",
                )}
              >
                {formatMoney(totals.unrealised, base, { decimals: 0 })}
              </td>
              <td
                className={cn(
                  "num px-3 py-3 text-right",
                  totals.dayChange > 0 && "text-gain",
                  totals.dayChange < 0 && "text-loss",
                )}
              >
                {formatMoney(totals.dayChange, base, { decimals: 0 })}
              </td>
              <td className="num px-3 py-3 text-right text-muted-foreground">
                {positions.some((position) => position.priced) ? "100.0%" : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((position) => (
          <div key={position.id} className="hairline rounded-lg bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onSelect(position)}
                className="min-w-0 text-left"
              >
                <p className="num text-sm text-foreground">{position.ticker}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {position.name ?? SLEEVE_LABELS[position.sleeve]}
                </p>
              </button>
              <RowActions
                label={position.ticker}
                onEdit={() => onEdit(position)}
                onDelete={() => onDelete(position)}
                deleteDescription="The holding and every trade recorded against it are removed."
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="eyebrow mb-1">Value</p>
                {position.priced && position.marketValueNative !== null ? (
                  <Money
                    amount={position.marketValueNative}
                    currency={position.priceCurrency}
                    align="left"
                  />
                ) : (
                  <span className="text-xs text-warn">No live price</span>
                )}
              </div>
              <div className="text-right">
                <p className="eyebrow mb-1">Unrealised</p>
                {position.unrealisedBase === null ? (
                  <span className="text-xs text-muted-foreground">
                    {position.avgCost === null ? basisLabel(position) : "—"}
                  </span>
                ) : (
                  <Money
                    amount={position.unrealisedBase}
                    currency={base}
                    signed
                    hideConverted
                    decimals={0}
                  />
                )}
              </div>
              <div>
                <p className="eyebrow mb-1">Qty · avg cost</p>
                <p className="num text-xs text-foreground/85">
                  {formatAmount(position.quantity, {
                    decimals: position.quantity % 1 === 0 ? 0 : 4,
                  })}
                  {position.avgCost !== null &&
                    ` · ${formatMoney(position.avgCost, position.holding.currency, { decimals: 2 })}`}
                </p>
              </div>

              <div className="text-right">
                <p className="eyebrow mb-1">Today · weight</p>
                <p className="num text-xs">
                  <span
                    className={cn(
                      position.dayChangePct !== null && position.dayChangePct > 0 && "text-gain",
                      position.dayChangePct !== null && position.dayChangePct < 0 && "text-loss",
                      position.dayChangePct === null && "text-muted-foreground",
                    )}
                  >
                    {position.dayChangePct === null
                      ? "—"
                      : formatSignedPercent(position.dayChangePct)}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {position.portfolioWeightPct === null
                      ? "—"
                      : formatPercent(position.portfolioWeightPct)}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onTrade(position)}
              className="mt-3 w-full rounded-md border border-border py-2 text-xs text-muted-foreground transition-colors hover:border-gold-line hover:text-gold"
            >
              Record a trade
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
