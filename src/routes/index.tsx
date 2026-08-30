import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FirstRunPanel } from "@/components/dashboard/FirstRunPanel";
import { HeroNetWorth, type NetWorthDelta } from "@/components/dashboard/HeroNetWorth";
import { MetricRow } from "@/components/dashboard/MetricRow";
import { NetWorthTrend } from "@/components/dashboard/NetWorthTrend";
import { AllocationPanels } from "@/components/dashboard/AllocationPanels";
import { SpendingPanel } from "@/components/dashboard/SpendingPanel";
import { AdvisorPanel } from "@/components/dashboard/AdvisorPanel";
import { GoalsStrip } from "@/components/dashboard/GoalsStrip";
import type { StatTrend } from "@/components/StatTile";
import { useNetWorth } from "@/hooks/useNetWorth";
import { useHoldings, useSnapshots } from "@/hooks/useFinancials";
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
      description="Everything the household owns and owes, converted to sterling and updated as you record it."
    >
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const summary = useNetWorth();
  const householdSummary = useNetWorth({ householdWide: true });
  const snapshotsQuery = useSnapshots();
  const holdingsQuery = useHoldings();
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

  const liquidTrend = useMemo<StatTrend | null>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const history = snapshots.filter((row) => row.as_of < today);
    const previous = history[history.length - 1];
    if (!previous) return null;
    const previousValue = Number(previous.liquid_net_worth);
    if (!previousValue) return null;
    return {
      changePct:
        ((householdSummary.liquidNetWorth - previousValue) / Math.abs(previousValue)) * 100,
      label: "vs last snapshot",
    };
  }, [snapshots, householdSummary.liquidNetWorth]);

  if (!summary.loading && !householdSummary.hasData) {
    return <FirstRunPanel />;
  }

  return (
    <div className="space-y-4">
      <HeroNetWorth
        netWorth={summary.netWorth}
        totalAssets={summary.totalAssets}
        totalLiabilities={summary.totalLiabilities}
        base={summary.base}
        loading={summary.loading}
        delta={delta}
      />

      <MetricRow summary={summary} liquidTrend={liquidTrend} />

      <NetWorthTrend
        snapshots={snapshots}
        base={summary.base}
        loading={snapshotsQuery.isLoading || summary.loading}
      />

      <AllocationPanels summary={summary} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SpendingPanel />
        <AdvisorPanel summary={summary} holdingsCount={holdingsQuery.data?.length ?? 0} />
      </div>

      <GoalsStrip />
    </div>
  );
}
