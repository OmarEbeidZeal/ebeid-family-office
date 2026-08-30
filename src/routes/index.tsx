import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHeader } from "@/components/SectionHeader";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { SpendingPanel } from "@/components/dashboard/SpendingPanel";
import { GoalsStrip } from "@/components/dashboard/GoalsStrip";
import { AdvisorPanel } from "@/components/dashboard/AdvisorPanel";
import { useNetWorth } from "@/hooks/useNetWorth";
import { useAccounts, useSnapshots } from "@/hooks/useFinancials";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { formatMoney, formatPercent } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Net Worth Dashboard | Ebeid Family Office" },
      {
        name: "description",
        content:
          "Live household net worth, liquidity, allocation and cash flow across UK, Egypt, Jordan and US holdings.",
      },
      { property: "og:title", content: "Net Worth Dashboard | Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Live household net worth, liquidity, allocation and cash flow across UK, Egypt, Jordan and US holdings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const { household, profile, profileLoading } = useAuth();
  const { scope } = useScope();
  const metrics = useNetWorth();
  const { data: snapshots, isLoading: snapshotsLoading } = useSnapshots();
  const { data: accounts } = useAccounts();
  const wroteSnapshot = useRef(false);

  const hasAnything = (accounts?.length ?? 0) > 0 || metrics.hasData;

  useEffect(() => {
    if (!profileLoading && profile && !metrics.loading && !hasAnything) {
      navigate({ to: "/onboarding" });
    }
  }, [profileLoading, profile, metrics.loading, hasAnything, navigate]);

  // Persist today's household net worth once per session so the trend line builds up.
  useEffect(() => {
    if (wroteSnapshot.current) return;
    if (metrics.loading || !metrics.hasData || !household?.id || scope !== "household") return;
    wroteSnapshot.current = true;
    void supabase
      .from("net_worth_snapshots")
      .upsert(
        {
          household_id: household.id,
          as_of: new Date().toISOString().slice(0, 10),
          net_worth: Math.round(metrics.netWorth * 100) / 100,
          total_assets: Math.round(metrics.totalAssets * 100) / 100,
          total_liabilities: Math.round(metrics.totalLiabilities * 100) / 100,
          liquid_net_worth: Math.round(metrics.liquidNetWorth * 100) / 100,
          base_currency: metrics.base,
        },
        { onConflict: "household_id,as_of" },
      )
      .then(() => undefined);
  }, [metrics, household?.id, scope]);

  const series = useMemo(() => {
    const rows = [...(snapshots ?? [])]
      .sort((a, b) => a.as_of.localeCompare(b.as_of))
      .map((row) => ({ as_of: row.as_of, net_worth: Number(row.net_worth) }));
    const today = new Date().toISOString().slice(0, 10);
    if (!rows.length || rows[rows.length - 1].as_of !== today) {
      if (metrics.hasData) rows.push({ as_of: today, net_worth: metrics.netWorth });
    }
    return rows;
  }, [snapshots, metrics.hasData, metrics.netWorth]);

  const change = useMemo(() => {
    if (series.length < 2) return null;
    const first = series[0].net_worth;
    const last = series[series.length - 1].net_worth;
    if (!first) return null;
    return { abs: last - first, pct: ((last - first) / Math.abs(first)) * 100 };
  }, [series]);

  if (!metrics.loading && !hasAnything) {
    return (
      <EmptyState
        title="Nothing on the balance sheet yet"
        body="Set up the household in a few minutes — accounts, property, debts, income and commitments — and the dashboard becomes live from the first entry."
        action={
          <Button asChild>
            <Link to="/onboarding">Start setup</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {household?.name ?? "Household"} · net worth
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <h1 className="headline-figure num text-4xl font-light sm:text-5xl">
            {metrics.loading ? "—" : formatMoney(metrics.netWorth, metrics.base, { decimals: 0 })}
          </h1>
          {change && (
            <span
              className={`num text-sm ${change.abs >= 0 ? "text-gain" : "text-loss"}`}
            >
              {formatMoney(change.abs, metrics.base, { decimals: 0 })} ({formatPercent(change.pct)})
              <span className="ml-1 text-muted-foreground">since first snapshot</span>
            </span>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total assets"
          loading={metrics.loading}
          value={formatMoney(metrics.totalAssets, metrics.base, { decimals: 0 })}
        />
        <StatTile
          label="Total liabilities"
          loading={metrics.loading}
          tone="loss"
          value={formatMoney(metrics.totalLiabilities, metrics.base, { decimals: 0 })}
        />
        <StatTile
          label="Liquid net worth"
          loading={metrics.loading}
          tone="gold"
          value={formatMoney(metrics.liquidNetWorth, metrics.base, { decimals: 0 })}
          sub={`${formatMoney(metrics.illiquidNetWorth, metrics.base, { decimals: 0 })} illiquid`}
        />
        <StatTile
          label="Monthly net cash flow"
          loading={metrics.loading}
          tone={metrics.netCashflow >= 0 ? "gain" : "loss"}
          value={formatMoney(metrics.netCashflow, metrics.base, { decimals: 0 })}
          sub={
            metrics.monthlyIncome > 0
              ? `${metrics.savingsRate.toFixed(0)}% savings rate`
              : "Add income to see savings rate"
          }
        />
      </section>

      <section>
        <SectionHeader
          title="Net worth trend"
          description="A snapshot is stored each day the dashboard is opened."
        />
        <div className="hairline rounded-lg bg-surface p-4">
          {snapshotsLoading ? (
            <div className="h-64" />
          ) : series.length > 1 ? (
            <NetWorthChart data={series} currency={metrics.base} />
          ) : (
            <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              The trend line starts building from today. Come back tomorrow for the first movement.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeader title="Allocation by asset class" />
          <div className="hairline rounded-lg bg-surface p-4">
            <AllocationDonut data={metrics.allocationByClass} currency={metrics.base} />
          </div>
        </div>
        <div>
          <SectionHeader
            title="Currency exposure"
            description={`${metrics.softCurrencyShare.toFixed(0)}% of assets sit in EGP or JOD.`}
          />
          <div className="hairline rounded-lg bg-surface p-4">
            <AllocationDonut data={metrics.allocationByCurrency} currency={metrics.base} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHeader
            title="Spending this month"
            action={
              <Link
                to="/accounts"
                className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
              >
                Accounts <ArrowUpRight className="size-3" />
              </Link>
            }
          />
          <div className="hairline rounded-lg bg-surface px-5 py-2">
            <SpendingPanel />
          </div>
        </div>
        <div>
          <SectionHeader title="Advisor" description="Automated review of the household position." />
          <AdvisorPanel />
        </div>
      </section>

      <section>
        <SectionHeader
          title="Goals"
          action={
            <span className="text-xs text-muted-foreground">
              Emergency runway:{" "}
              <span className="num text-foreground">
                {metrics.runwayMonths === null ? "—" : `${metrics.runwayMonths.toFixed(1)} months`}
              </span>
            </span>
          }
        />
        <GoalsStrip />
      </section>
    </div>
  );
}
