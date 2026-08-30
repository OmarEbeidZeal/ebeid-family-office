import { AlertTriangle } from "lucide-react";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPercent, SOFT_CURRENCIES } from "@/lib/format";
import type { NetWorthSummary } from "@/hooks/useNetWorth";

function PanelShell({ children }: { children: React.ReactNode }) {
  return <section className="hairline rounded-lg bg-surface p-5">{children}</section>;
}

export function AllocationPanels({ summary }: { summary: NetWorthSummary }) {
  const { base, loading } = summary;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <PanelShell>
        <SectionHeader title="Allocation by asset class" />
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : summary.allocationByClass.length === 0 ? (
          <EmptyState
            title="No assets recorded"
            body="Add accounts on the Accounts page and property, pensions or private shareholdings on the Balance Sheet to see how the household is allocated."
          />
        ) : (
          <>
            <AllocationDonut slices={summary.allocationByClass} base={base} centreLabel="Assets" />
            {summary.privateStakeValue > 0 && (
              <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                {formatMoney(summary.privateStakeValue, base, { decimals: 0 })} of this is a private
                company shareholding — illiquid, and excluded from spendable wealth.
              </p>
            )}
          </>
        )}
      </PanelShell>

      <PanelShell>
        <SectionHeader title="Currency exposure" />
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : summary.allocationByCurrency.length === 0 ? (
          <EmptyState
            title="No currency exposure yet"
            body="Once accounts and assets are recorded in their native currencies, this shows how much of the household sits outside sterling."
          />
        ) : (
          <>
            <AllocationDonut
              slices={summary.allocationByCurrency}
              base={base}
              centreLabel="Assets"
              emphasise={SOFT_CURRENCIES}
            />
            <SoftCurrencyLine summary={summary} />
          </>
        )}
      </PanelShell>
    </div>
  );
}

function SoftCurrencyLine({ summary }: { summary: NetWorthSummary }) {
  const share = summary.softCurrencyShare;
  const severe = share >= 25;
  const notable = share >= 10;

  if (share <= 0) {
    return (
      <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
        No EGP or JOD exposure recorded. Soft-currency holdings are tracked here because devaluation
        risk is a real cost, not a rounding error.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p
        className={`flex items-start gap-2 text-xs leading-relaxed ${
          severe ? "text-loss" : notable ? "text-warn" : "text-muted-foreground"
        }`}
      >
        {notable && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        <span>
          <span className="num">{formatPercent(share)}</span> of household assets —{" "}
          <span className="num">
            {formatMoney(summary.softCurrencyValue, summary.base, { decimals: 0 })}
          </span>{" "}
          — sits in soft currencies (EGP, JOD).{" "}
          {severe
            ? "That is a concentrated devaluation risk; consider whether the sterling or dollar side should carry more."
            : notable
              ? "Worth watching: devaluation there hits sterling net worth directly."
              : "Currently a modest share of the balance sheet."}
        </span>
      </p>
    </div>
  );
}
