/**
 * What the system did while nobody was watching.
 *
 * Four scheduled jobs keep the household's figures current: the nightly
 * snapshot, the twice-daily exchange rates, weekday closing prices and the
 * weekly briefing. Each one records its run, and these hooks read those records
 * back so Settings can show what actually happened rather than what is meant to.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCurrency } from "./useCurrency";
import { useAccounts, useAssets } from "./useFinancials";

export type AutomationRun = {
  id: string;
  job: string;
  status: "ok" | "partial" | "skipped" | "failed" | string;
  message: string | null;
  households: number;
  duration_ms: number | null;
  ran_at: string;
};

export type JobKey = "net_worth_snapshot" | "fx_refresh" | "market_close" | "weekly_briefing";

export const SCHEDULED_JOBS: {
  key: JobKey;
  label: string;
  cadence: string;
  purpose: string;
  /** Past this, the job has missed a turn and the card says so. */
  overdueAfterHours: number;
}[] = [
  {
    key: "net_worth_snapshot",
    label: "Net worth snapshot",
    cadence: "Every night, 23:30 UTC",
    purpose: "Keeps the trend chart continuous instead of only sampling the days you sign in.",
    overdueAfterHours: 36,
  },
  {
    key: "fx_refresh",
    label: "Exchange rates",
    cadence: "06:00 and 18:00 UTC",
    purpose: "Converts EGP, JOD, USD and EUR balances against a rate from today.",
    overdueAfterHours: 20,
  },
  {
    key: "market_close",
    label: "Closing prices",
    cadence: "Weekdays, 21:15 UTC",
    purpose: "Stores a closing price for every held and watchlisted ticker.",
    // Friday evening to Monday evening is three days, so a weekend is not late.
    overdueAfterHours: 96,
  },
  {
    key: "weekly_briefing",
    label: "Advisor briefing",
    cadence: "07:00 UTC on your chosen day",
    purpose: "Reads the position and writes up anything material — in the app, and by email.",
    overdueAfterHours: 8 * 24,
  },
];

export function useAutomationRuns() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["automation_runs"],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_runs")
        .select("id, job, status, message, households, duration_ms, ran_at")
        .order("ran_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as AutomationRun[];
    },
  });
}

/** The most recent run of each job, whatever its outcome. */
export function useLatestRuns() {
  const { data, isLoading } = useAutomationRuns();
  const latest = useMemo(() => {
    const map = new Map<string, AutomationRun>();
    for (const run of data ?? []) {
      if (!map.has(run.job)) map.set(run.job, run);
    }
    return map;
  }, [data]);
  return { latest, loading: isLoading, runs: data ?? [] };
}

export type FreshnessSource = { label: string; at: string | null };

/**
 * "When were these figures last refreshed?" — answered from the data itself
 * rather than from a promise about the schedule. Reads queries the shell has
 * already loaded, so it costs one extra request at most.
 */
export function useLastRefreshed() {
  const { ratesAsOf } = useCurrency();
  const accounts = useAccounts();
  const assets = useAssets();
  const { latest } = useLatestRuns();

  return useMemo(() => {
    const newest = (values: (string | null | undefined)[]) =>
      values
        .filter((value): value is string => !!value)
        .sort()
        .at(-1) ?? null;

    const sources: FreshnessSource[] = [
      {
        label: "Balances updated",
        at: newest((accounts.data ?? []).map((account) => account.last_balance_update)),
      },
      {
        label: "Assets valued",
        at: newest((assets.data ?? []).map((asset) => asset.last_valued_at)),
      },
      { label: "Exchange rates", at: ratesAsOf },
      { label: "Nightly snapshot", at: latest.get("net_worth_snapshot")?.ran_at ?? null },
      { label: "Closing prices", at: latest.get("market_close")?.ran_at ?? null },
    ];

    return {
      at: newest(sources.map((source) => source.at)),
      sources: sources.filter((source) => source.at),
      loading: accounts.isLoading || assets.isLoading,
    };
  }, [accounts.data, accounts.isLoading, assets.data, assets.isLoading, ratesAsOf, latest]);
}
