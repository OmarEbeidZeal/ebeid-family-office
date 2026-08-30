import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import {
  useAccounts,
  useAssets,
  useForecastExpenses,
  useGoals,
  useHoldings,
  useIncomeStreams,
  useLiabilities,
  useTaxAllowances,
  useWatchlist,
} from "@/hooks/useFinancials";
import { useObservedSpending } from "@/hooks/useObservedSpending";
import { useQuotes } from "@/hooks/useMarketData";
import { buildPositions } from "@/lib/portfolio";
import { buildHouseholdContext, type CtxSpending } from "@/lib/household-context";

/**
 * One assembly of the household's real position, shared by the portfolio's
 * policy panel, the advisor page and the dashboard briefing.
 *
 * The identical pure builder runs on the server for the advisor call, so what
 * the screen shows and what the model reasons from cannot drift apart.
 */
export function useHouseholdContext() {
  const { household, members } = useAuth();
  const { base, convert } = useCurrency();

  const accounts = useAccounts();
  const assets = useAssets();
  const liabilities = useLiabilities();
  const income = useIncomeStreams();
  const expenses = useForecastExpenses();
  const goals = useGoals();
  const holdings = useHoldings();
  const watchlist = useWatchlist();
  const allowances = useTaxAllowances();
  const spending = useObservedSpending();

  const tickers = useMemo(
    () => [
      ...(holdings.data ?? []).map((holding) => holding.ticker),
      ...(watchlist.data ?? []).map((item) => item.ticker),
    ],
    [holdings.data, watchlist.data],
  );

  const market = useQuotes(tickers);

  const loading =
    accounts.isLoading ||
    assets.isLoading ||
    liabilities.isLoading ||
    income.isLoading ||
    expenses.isLoading ||
    goals.isLoading ||
    holdings.isLoading ||
    watchlist.isLoading ||
    allowances.isLoading;

  const toBase = useMemo(
    () => (amount: number, currency: string) => convert(amount, currency, base),
    [convert, base],
  );

  const positions = useMemo(
    () =>
      buildPositions({
        holdings: holdings.data ?? [],
        quotes: market.quotes,
        profiles: market.profiles,
        toBase,
      }),
    [holdings.data, market.quotes, market.profiles, toBase],
  );

  const observed: CtxSpending | null = useMemo(() => {
    if (!spending.hasData) return null;
    const breakdown = spending.breakdown(spending.thisMonth, spending.lastMonth);
    return {
      essentialMonthly: spending.essentialBaseline,
      lifestyleMonthly: spending.lifestyleBaseline,
      totalMonthly: spending.spendBaseline,
      incomeMonthly: spending.incomeBaseline,
      monthsOfData: spending.completeMonthCount,
      topCategories: breakdown
        .filter((row) => row.current > 0)
        .slice(0, 8)
        .map((row) => ({ name: row.name, monthly: row.current, essential: row.essential })),
      movers: breakdown
        .filter((row) => row.change !== null && Math.abs(row.change) >= 20 && row.current > 0)
        .slice(0, 6)
        .map((row) => ({
          name: row.name,
          current: row.current,
          previous: row.previous,
          changePct: row.change ?? 0,
        })),
    };
  }, [spending]);

  const built = useMemo(
    () =>
      buildHouseholdContext({
        base,
        householdName: household?.name ?? null,
        members: members.map((member) => ({
          id: member.id,
          display_name: member.display_name,
          full_name: member.full_name,
          role: member.role,
        })),
        accounts: accounts.data ?? [],
        assets: assets.data ?? [],
        liabilities: liabilities.data ?? [],
        income: income.data ?? [],
        expenses: expenses.data ?? [],
        goals: goals.data ?? [],
        watchlist: watchlist.data ?? [],
        positions,
        watchQuotes: Object.fromEntries(
          Object.entries(market.quotes).map(([ticker, quote]) => [
            ticker,
            {
              price: quote.source === "live" || quote.source === "cache" ? quote.price : null,
              asOf: quote.asOf,
            },
          ]),
        ),
        spending: observed,
        allowances: allowances.data ?? [],
        marketDataAvailable: market.configured !== false,
        marketDataMessage: market.message,
        toBase,
      }),
    [
      base,
      household?.name,
      members,
      accounts.data,
      assets.data,
      liabilities.data,
      income.data,
      expenses.data,
      goals.data,
      watchlist.data,
      positions,
      market.quotes,
      market.configured,
      market.message,
      observed,
      allowances.data,
      toBase,
    ],
  );

  return {
    ...built,
    toBase,
    positions,
    market,
    loading,
    spendingLoading: spending.loading,
  };
}

export type HouseholdContextValue = ReturnType<typeof useHouseholdContext>;
