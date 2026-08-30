import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type FxRow = { base_ccy: string; quote_ccy: string; rate: number; as_of: string };

type CurrencyContextValue = {
  base: string;
  rates: Record<string, number>;
  ratesAsOf: string | null;
  isStale: boolean;
  convert: (amount: number, from: string, to?: string) => number;
  refresh: () => Promise<void>;
  refreshing: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { household, session } = useAuth();
  const queryClient = useQueryClient();
  const base = household?.base_currency ?? "GBP";

  const { data } = useQuery({
    queryKey: ["fx-rates"],
    enabled: !!session,
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

  const isStale = !ratesAsOf || Date.now() - new Date(ratesAsOf).getTime() > 6 * 3600 * 1000;

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

  const refreshMutationKey = ["fx-refresh"];
  const refreshing = false;

  const refresh = useCallback(async () => {
    const { refreshFxRates } = await import("@/lib/fx.functions");
    await refreshFxRates();
    await queryClient.invalidateQueries({ queryKey: ["fx-rates"] });
  }, [queryClient]);

  void refreshMutationKey;

  const value: CurrencyContextValue = {
    base,
    rates,
    ratesAsOf,
    isStale,
    convert,
    refresh,
    refreshing,
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
