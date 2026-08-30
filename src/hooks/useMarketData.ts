import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getQuotes, getSecurityDetail, testMarketData } from "@/lib/market-data.functions";
import type { QuoteResult } from "@/lib/market/shared";
import type { SecurityProfileRow } from "@/lib/market/service.server";

/** Slightly longer than the 60s server cache, so a poll always gets a fresh price. */
const REFRESH_MS = 75_000;

export function useQuotes(tickers: string[]) {
  const key = useMemo(
    () =>
      Array.from(
        new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)),
      ).sort(),
    [tickers],
  );

  const query = useQuery({
    queryKey: ["market-quotes", key],
    enabled: key.length > 0,
    queryFn: () => getQuotes({ data: { tickers: key, includeProfiles: true } }),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 45_000,
  });

  const quotes = useMemo(() => {
    const map: Record<string, QuoteResult> = {};
    for (const quote of query.data?.quotes ?? []) map[quote.ticker.toUpperCase()] = quote;
    return map;
  }, [query.data]);

  const profiles = useMemo(() => {
    const map: Record<string, SecurityProfileRow> = {};
    for (const profile of query.data?.profiles ?? []) map[profile.ticker.toUpperCase()] = profile;
    return map;
  }, [query.data]);

  return {
    quotes,
    profiles,
    configured: query.data?.configured ?? null,
    providerLabel: query.data?.providerLabel ?? null,
    message:
      query.data?.message ??
      (query.error instanceof Error
        ? query.error.message
        : query.error
          ? "Market data request failed."
          : null),
    fetchedAt: query.data?.fetchedAt ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    hasTickers: key.length > 0,
  };
}

export function useSecurityDetail(ticker: string | null) {
  return useQuery({
    queryKey: ["security-detail", ticker?.toUpperCase()],
    enabled: !!ticker,
    staleTime: 5 * 60_000,
    queryFn: () => getSecurityDetail({ data: { ticker: ticker! } }),
  });
}

export function useMarketDataTest() {
  return useMutation({ mutationFn: () => testMarketData() });
}
