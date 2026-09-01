import { StatTile } from "@/components/StatTile";
import { formatMoney, formatPercent, formatSignedPercent } from "@/lib/format";
import type { PortfolioTotals } from "@/lib/portfolio";

export function PortfolioSummary({
  totals,
  base,
  loading,
  netWorthShare,
}: {
  totals: PortfolioTotals;
  base: string;
  loading?: boolean | undefined;
  /** Priced portfolio as a share of household net worth. */
  netWorthShare: number | null;
}) {
  const priced = totals.pricedCount > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Portfolio value"
        definition="Market value of every holding with a live price, converted to your base currency. Positions without a price are excluded rather than valued at cost."
        value={priced ? formatMoney(totals.marketValueBase, base, { decimals: 0 }) : "—"}
        tone="gold"
        loading={!!loading}
        sub={
          priced
            ? netWorthShare !== null
              ? `${formatPercent(netWorthShare)} of net worth`
              : `${totals.pricedCount} priced position${totals.pricedCount === 1 ? "" : "s"}`
            : "No priced positions"
        }
      />

      <StatTile
        label="Unrealised P/L"
        definition="Market value less the cost of the shares still held. Only positions with both a live price and a known cost are counted — a position whose purchase price is in none of your files is left out rather than counted as pure profit."
        value={
          totals.unrealisedPct === null ? "—" : formatMoney(totals.unrealisedBase, base, { decimals: 0 })
        }
        tone={
          totals.unrealisedPct === null
            ? "neutral"
            : totals.unrealisedBase > 0
              ? "gain"
              : totals.unrealisedBase < 0
                ? "loss"
                : "neutral"
        }
        loading={!!loading}
        sub={
          totals.unrealisedPct === null
            ? totals.unknownBasisCount > 0
              ? `Cost unknown on ${totals.unknownBasisCount} position${totals.unknownBasisCount === 1 ? "" : "s"}`
              : "Record average cost to see the return"
            : totals.unknownBasisCount > 0
              ? `${formatSignedPercent(totals.unrealisedPct)} on ${formatMoney(totals.costBase, base, { decimals: 0 })} cost · ${formatMoney(totals.unknownBasisValueBase, base, { decimals: 0 })} excluded, cost unknown`
              : `${formatSignedPercent(totals.unrealisedPct)} on ${formatMoney(totals.costBase, base, { decimals: 0 })} cost`
        }
      />

      <StatTile
        label="Today"
        definition="Change since the previous close across all priced positions, in your base currency."
        value={priced ? formatMoney(totals.dayChangeBase, base, { decimals: 0 }) : "—"}
        tone={totals.dayChangeBase > 0 ? "gain" : totals.dayChangeBase < 0 ? "loss" : "neutral"}
        loading={!!loading}
        sub={
          totals.dayChangePct === null
            ? "No previous close available"
            : formatSignedPercent(totals.dayChangePct)
        }
      />

      <StatTile
        label="Realised P/L"
        definition="Profit and loss booked on shares already sold, computed from your recorded trades at the average cost at the time of each sale. Sales whose purchase price is in none of your files are excluded."
        value={formatMoney(totals.realisedBase, base, { decimals: 0 })}
        tone={totals.realisedBase > 0 ? "gain" : totals.realisedBase < 0 ? "loss" : "neutral"}
        loading={!!loading}
        sub={
          totals.unknownRealisedCount > 0
            ? `${totals.unknownRealisedCount} holding${totals.unknownRealisedCount === 1 ? "" : "s"} excluded, cost unknown`
            : totals.unpricedCount > 0
              ? `${totals.unpricedCount} position${totals.unpricedCount === 1 ? "" : "s"} unpriced`
              : "From recorded sells"
        }
      />

    </div>
  );
}
