import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FirstRunPanel } from "@/components/dashboard/FirstRunPanel";
import { HeroNetWorth, type NetWorthDelta } from "@/components/dashboard/HeroNetWorth";
import { MetricRow } from "@/components/dashboard/MetricRow";
import { NetWorthTrend } from "@/components/dashboard/NetWorthTrend";
import { AdvisorPanel } from "@/components/dashboard/AdvisorPanel";
import { GoalsStrip } from "@/components/dashboard/GoalsStrip";
import { useNetWorth } from "@/hooks/useNetWorth";
import { useObservedSpending } from "@/hooks/useObservedSpending";
import { useAdvisorNotes, useHoldings, useSnapshots } from "@/hooks/useFinancials";
import { useSnapshotSync } from "@/hooks/useSnapshotSync";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Net Worth Dashboard — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Household net worth, liquidity, currency exposure and cashflow across UK, Egypt, Jordan and US holdings.",
      },
      { property: "og:title", content: "Net Worth Dashboard — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Household net worth, liquidity, currency exposure and cashflow across UK, Egypt, Jordan and US holdings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  const { household } = useAuth();
  return (
    <AppShell
      title={household?.name ?? "Household"}
      description="Where the household stands today, and what it is heading toward."
    >
      <Dashboard />
    </AppShell>
  );
}

/**
 * Five blocks, in the order a person actually asks the questions: what are we
 * worth, can we absorb a shock, which way are we moving, what is it all for,
 * and what should we look at next. Depth lives on the page it belongs to.
 */
function Dashboard() {
  const summary = useNetWorth();
  const householdSummary = useNetWorth({ householdWide: true });
  const spending = useObservedSpending();
  const snapshotsQuery = useSnapshots();
  const holdingsQuery = useHoldings();
  const notesQuery = useAdvisorNotes();
  useSnapshotSync();

  const snapshots = useMemo(
    () => [...(snapshotsQuery.data ?? [])].sort((a, b) => a.as_of.localeCompare(b.as_of)),
    [snapshotsQuery.data],
  );

  // The delta compares today's household position with the most recent
  // earlier snapshot — never a modelled or back-filled figure.
  const delta = useMemo<NetWorthDelta>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const history = snapshots.filter((row) => row.as_of < today);
    const previous = history[history.length - 1];
    if (!previous) return null;
    const previousValue = Number(previous.net_worth);
    if (!previousValue) return null;
    const amount = householdSummary.netWorth - previousValue;
    return {
      amount,
      pct: (amount / Math.abs(previousValue)) * 100,
      sinceLabel: `since ${formatDate(previous.as_of, "short")}`,
    };
  }, [snapshots, householdSummary.netWorth]);

  if (!summary.loading && !householdSummary.hasData) {
    return <FirstRunPanel />;
  }

  return (
    <div className="space-y-5">
      <HeroNetWorth
        netWorth={summary.netWorth}
        totalAssets={summary.totalAssets}
        totalLiabilities={summary.totalLiabilities}
        liquidNetWorth={summary.liquidNetWorth}
        illiquidNetWorth={summary.illiquidNetWorth}
        base={summary.base}
        loading={summary.loading}
        delta={delta}
      />

      <MetricRow summary={summary} spending={spending} />

      <NetWorthTrend
        snapshots={snapshots}
        base={summary.base}
        loading={snapshotsQuery.isLoading || summary.loading}
      />

      <GoalsStrip />

      <AdvisorPanel
        summary={summary}
        holdingsCount={holdingsQuery.data?.length ?? 0}
        notes={notesQuery.data ?? []}
      />
    </div>
  );
}
