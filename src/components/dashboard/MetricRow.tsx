import { StatTile, type StatTrend } from "@/components/StatTile";
import { formatMoney, formatPercent } from "@/lib/format";
import type { NetWorthSummary } from "@/hooks/useNetWorth";

export function MetricRow({
  summary,
  liquidTrend,
}: {
  summary: NetWorthSummary;
  liquidTrend: StatTrend | null;
}) {
  const { base, loading } = summary;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile
        label="Liquid net worth"
        loading={loading}
        value={formatMoney(summary.liquidNetWorth, base, { decimals: 0 })}
        definition="Cash, savings and investments you could realistically access within a week, less short-term debt. Pensions and private company shares are excluded."
        trend={liquidTrend}
      />
      <StatTile
        label="Illiquid net worth"
        loading={loading}
        value={formatMoney(summary.illiquidNetWorth, base, { decimals: 0 })}
        definition="Wealth locked in property, pensions and private company shareholdings. Real, but not spendable."
        sub={
          summary.privateStakeValue > 0
            ? `${formatMoney(summary.privateStakeValue, base, { decimals: 0 })} private stake`
            : undefined
        }
      />
      <StatTile
        label="Monthly net cashflow"
        loading={loading}
        tone={summary.netCashflow >= 0 ? "gain" : "loss"}
        value={formatMoney(summary.netCashflow, base, { decimals: 0 })}
        definition="Recorded monthly income after every planned outgoing and debt payment. Positive means the household is adding to its wealth each month."
        sub={
          summary.monthlyIncome === 0
            ? "No income recorded yet"
            : `${formatMoney(summary.monthlyIncome, base, { decimals: 0 })} in`
        }
      />
      <StatTile
        label="Emergency runway"
        loading={loading}
        tone={
          summary.runwayMonths === null
            ? "neutral"
            : summary.runwayMonths >= 6
              ? "gain"
              : summary.runwayMonths >= 3
                ? "neutral"
                : "loss"
        }
        value={summary.runwayMonths === null ? "—" : `${summary.runwayMonths.toFixed(1)} mo`}
        definition="How many months of committed spending your accessible cash covers if income stopped tomorrow. Six months is the usual first target."
        sub={
          summary.essentialSpend > 0
            ? `${formatMoney(summary.essentialSpend, base, { decimals: 0 })}/mo committed`
            : "Add committed outgoings to calculate"
        }
      />
      <StatTile
        label="Savings rate"
        loading={loading}
        tone={
          summary.savingsRate === null ? "neutral" : summary.savingsRate >= 20 ? "gain" : "neutral"
        }
        value={summary.savingsRate === null ? "—" : formatPercent(summary.savingsRate)}
        definition="The share of recorded income left over after everything you spend and repay each month."
        sub={summary.savingsRate === null ? "Add income to calculate" : undefined}
      />
    </div>
  );
}
