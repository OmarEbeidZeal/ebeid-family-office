import { StatTile } from "@/components/StatTile";
import { formatMoney, formatPercent } from "@/lib/format";
import type { NetWorthSummary } from "@/hooks/useNetWorth";
import type { ObservedSpending } from "@/hooks/useObservedSpending";

/**
 * Three numbers, chosen because each one can change a decision this month:
 * how long the cash lasts, what is left over, and how much of what comes in
 * survives. Everything else moved to the page it belongs on.
 *
 * All three prefer what the statements actually show; until two complete
 * months are imported they fall back to the recorded plan and say so.
 */
export function MetricRow({
  summary,
  spending,
}: {
  summary: NetWorthSummary;
  spending: ObservedSpending;
}) {
  const { base } = summary;
  const loading = summary.loading || spending.loading;

  const observedEssential = spending.essentialBaseline;
  const essentialSpend = observedEssential ?? summary.essentialSpend;
  // Policy rule 4 counts GBP cash only. ISA, GIA and crypto balances are
  // liquid but they are investments, so they never pad the runway.
  const runwayMonths = essentialSpend > 0 ? summary.reserveCash / essentialSpend : null;
  const monthsWord = `${spending.completeMonthCount} complete month${spending.completeMonthCount === 1 ? "" : "s"}`;

  const observedIncome = spending.incomeBaseline;
  const observedSpend = spending.spendBaseline;
  const useObservedCashflow =
    observedIncome !== null && observedIncome > 0 && observedSpend !== null;
  const netCashflow = useObservedCashflow ? observedIncome - observedSpend : summary.netCashflow;
  const savingsRate = useObservedCashflow
    ? ((observedIncome - observedSpend) / observedIncome) * 100
    : summary.savingsRate;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile
        label="Emergency runway"
        loading={loading}
        tone={
          runwayMonths === null
            ? "neutral"
            : runwayMonths >= 12
              ? "gain"
              : runwayMonths >= 6
                ? "neutral"
                : "loss"
        }
        value={runwayMonths === null ? "—" : `${runwayMonths.toFixed(1)} mo`}
        definition={`${
          observedEssential !== null
            ? "How many months of your observed essential spending your GBP cash covers if income stopped tomorrow."
            : "How many months of committed spending your GBP cash covers if income stopped tomorrow."
        } Policy rule 4 asks for twelve. ISA, GIA and crypto balances are investments, so they are left out.${
          summary.otherCurrencyCash > 0
            ? ` A further ${formatMoney(summary.otherCurrencyCash, base, { decimals: 0 })} sits in non-GBP cash and is excluded.`
            : ""
        }`}
        sub={
          observedEssential !== null
            ? `${formatMoney(observedEssential, base, { decimals: 0 })}/mo essentials, observed`
            : essentialSpend > 0
              ? `${formatMoney(essentialSpend, base, { decimals: 0 })}/mo committed, from your plan`
              : "Import a statement or add committed outgoings"
        }
      />
      <StatTile
        label="Spare each month"
        loading={loading}
        tone={netCashflow >= 0 ? "gain" : "loss"}
        value={formatMoney(netCashflow, base, { decimals: 0 })}
        definition={
          useObservedCashflow
            ? "Typical month from your imported statements: everything that came in, less everything that went out. Internal transfers are excluded."
            : "Recorded monthly income after every planned outgoing and debt payment. Positive means the household is adding to its wealth each month."
        }
        sub={
          useObservedCashflow
            ? `${formatMoney(observedIncome, base, { decimals: 0 })} in, typical of ${monthsWord}`
            : summary.monthlyIncome === 0
              ? "No income recorded yet"
              : `${formatMoney(summary.monthlyIncome, base, { decimals: 0 })} in, as planned`
        }
      />
      <StatTile
        label="Savings rate"
        loading={loading}
        tone={savingsRate === null ? "neutral" : savingsRate >= 20 ? "gain" : "neutral"}
        value={savingsRate === null ? "—" : formatPercent(savingsRate)}
        definition={
          useObservedCashflow
            ? "The share of the money that actually landed in your accounts that survived the month."
            : "The share of recorded income left over after everything you spend and repay each month."
        }
        sub={
          savingsRate === null
            ? "Import a statement or add income to calculate"
            : useObservedCashflow
              ? `Median of ${monthsWord}`
              : "From your recorded plan"
        }
      />
    </div>
  );
}
