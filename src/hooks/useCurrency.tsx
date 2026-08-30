import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type FxRow = { base_ccy: string; quote_ccy: string; rate: number; as_of: string };

const SIX_HOURS = 6 * 60 * 60 * 1000;

type CurrencyContextValue = {
  base: string;
  rates: Record<string, number>;
  ratesAsOf: string | null;
  /** No rates at all, or the newest is over six hours old. */
  isStale: boolean;
  hasRates: boolean;
  convert: (amount: number, from: string, to?: string) => number;
  refresh: () => Promise<void>;
  refreshing: boolean;
  refreshError: string | null;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { household, session } = useAuth();
  const queryClient = useQueryClient();
  const base = household?.base_currency ?? "GBP";

  const { data } = useQuery({
    queryKey: ["fx-rates"],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("fx_rates")
        .select("base_ccy, quote_ccy, rate, as_of")
        .order("as_of", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (rows ?? []) as FxRow[];
    },
  });

  const { rates, ratesAsOf } = useMemo(() => {
    const map: Record<string, number> = { GBP: 1 };
    let latest: string | null = null;
    for (const row of data ?? []) {
      if (row.base_ccy !== "GBP") continue;
      if (map[row.quote_ccy] === undefined) map[row.quote_ccy] = Number(row.rate);
      if (!latest || row.as_of > latest) latest = row.as_of;
    }
    return { rates: map, ratesAsOf: latest };
  }, [data]);

  const hasRates = Object.keys(rates).length > 1;
  const isStale = !ratesAsOf || Date.now() - new Date(ratesAsOf).getTime() > SIX_HOURS;

  const convert = useCallback(
    (amount: number, from: string, to: string = base) => {
      if (from === to) return amount;
      const fromRate = rates[from];
      const toRate = rates[to];
      if (!fromRate || !toRate) return amount;
      return (amount / fromRate) * toRate;
    },
    [rates, base],
  );

  const mutation = useMutation({
    mutationKey: ["fx-refresh"],
    mutationFn: async () => {
      const { refreshFxRates } = await import("@/lib/fx.functions");
      return refreshFxRates();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fx-rates"] });
    },
  });

  const { mutateAsync } = mutation;
  const refresh = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  // Rates older than six hours refresh themselves once the session is ready.
  const shouldAutoRefresh = !!session && !!data && isStale && mutation.isIdle;
  useEffect(() => {
    if (!shouldAutoRefresh) return;
    void mutateAsync().catch(() => {
      /* surfaced through refreshError in the FX indicator */
    });
  }, [shouldAutoRefresh, mutateAsync]);

  const value: CurrencyContextValue = {
    base,
    rates,
    ratesAsOf,
    isStale,
    hasRates,
    convert,
    refresh,
    refreshing: mutation.isPending,
    refreshError: mutation.error ? (mutation.error as Error).message : null,
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
