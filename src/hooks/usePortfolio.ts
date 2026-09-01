import { useMemo } from "react";
import { useCurrency } from "./useCurrency";
import { useAuth } from "./useAuth";
import { useObservedSpending } from "./useObservedSpending";
import { useQuotes } from "./useMarketData";
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
} from "./useFinancials";
import {
  buildPositions,
  exposureBy,
  portfolioTotals,
  reconcileAccounts,
  sleeveTotals,
  type Position,
} from "@/lib/portfolio";
import { buildHouseholdContext } from "@/lib/household-context";
import { concentrationRows } from "@/lib/policy";
import { countryLabel } from "@/lib/format";

/**
 * Holdings priced with live market data. Positions without a usable price come
 * through unpriced rather than valued at cost, so the page can say which rows
 * are missing a price instead of quietly under-reporting the portfolio.
 */
export function usePortfolio() {
  const { convert, base } = useCurrency();
  const holdingsQuery = useHoldings();
  const accountsQuery = useAccounts();
  const holdings = useMemo(() => holdingsQuery.data ?? [], [holdingsQuery.data]);

  const tickers = useMemo(() => holdings.map((holding) => holding.ticker), [holdings]);
  const market = useQuotes(tickers);

  const toBase = useMemo(
    () => (amount: number, currency: string) => convert(amount, currency, base),
    [convert, base],
  );

  const positions = useMemo(
    () =>
      buildPositions({
        holdings,
        quotes: market.quotes,
        profiles: market.profiles,
        toBase,
      }),
    [holdings, market.quotes, market.profiles, toBase],
  );

  const totals = useMemo(() => portfolioTotals(positions, toBase), [positions, toBase]);
  const sleeves = useMemo(() => sleeveTotals(positions), [positions]);

  const sectorExposure = useMemo(
    () => exposureBy(positions, (position) => position.industry, "Unclassified"),
    [positions],
  );
  const geoExposure = useMemo(
    () =>
      exposureBy(
        positions,
        (position) => (position.country ? countryLabel(position.country) : null),
        "Unclassified",
      ),
    [positions],
  );

  const reconciliation = useMemo(
    () =>
      reconcileAccounts(
        positions,
        (accountsQuery.data ?? []).map((account) => ({
          id: account.id,
          currency: account.currency,
          current_balance: Number(account.current_balance),
          balance_source: account.balance_source,
        })),

        toBase,
      ),
    [positions, accountsQuery.data, toBase],
  );

  return {
    positions,
    totals,
    sleeves,
    sectorExposure,
    geoExposure,
    reconciliation,
    market,
    base,
    loading: holdingsQuery.isLoading || (market.hasTickers && market.isLoading),
    hasHoldings: holdings.length > 0,
  };
}

export type PortfolioState = ReturnType<typeof usePortfolio>;

/**
 * The household's whole position, assembled through the same pure function the
 * advisor uses on the server — so the policy panel on screen and the advisor's
 * context can never disagree.
 */
export function useHouseholdPosition() {
  const { convert, base } = useCurrency();
  const { household, members } = useAuth();
  const portfolio = usePortfolio();
  const accountsQuery = useAccounts();
  const assetsQuery = useAssets();
  const liabilitiesQuery = useLiabilities();
  const incomeQuery = useIncomeStreams();
  const expensesQuery = useForecastExpenses();
  const goalsQuery = useGoals();
  const watchlistQuery = useWatchlist();
  const allowancesQuery = useTaxAllowances();
  const spending = useObservedSpending();

  const watchTickers = useMemo(
    () => (watchlistQuery.data ?? []).map((item) => item.ticker),
    [watchlistQuery.data],
  );
  const watchMarket = useQuotes(watchTickers);

  const toBase = useMemo(
    () => (amount: number, currency: string) => convert(amount, currency, base),
    [convert, base],
  );

  const result = useMemo(() => {
    const breakdown = spending.hasData
      ? spending.breakdown(spending.thisMonth, spending.lastMonth)
      : [];
    const watchQuotes: Record<string, { price: number | null; asOf: string | null }> = {};
    for (const [ticker, quote] of Object.entries(watchMarket.quotes)) {
      watchQuotes[ticker] = {
        price: quote.source === "live" || quote.source === "cache" ? quote.price : null,
        asOf: quote.asOf,
      };
    }

    return buildHouseholdContext({
      base,
      householdName: household?.name ?? null,
      members: members.map((member) => ({
        id: member.id,
        display_name: member.display_name,
        full_name: member.full_name,
        role: member.role,
      })),
      accounts: (accountsQuery.data ?? []).map((account) => ({
        id: account.id,
        nickname: account.nickname,
        institution: account.institution,
        account_type: account.account_type,
        currency: account.currency,
        current_balance: Number(account.current_balance),
        balance_source: account.balance_source,
        is_active: account.is_active,
        country: account.country,
        last_balance_update: account.last_balance_update,
        owner_profile_id: account.owner_profile_id,
      })),

      assets: (assetsQuery.data ?? []).map((asset) => ({
        id: asset.id,
        name: asset.name,
        asset_class: asset.asset_class,
        currency: asset.currency,
        current_value: Number(asset.current_value),
        ownership_pct: Number(asset.ownership_pct),
        is_liquid: asset.is_liquid,
        last_valued_at: asset.last_valued_at,
        valuation_method: asset.valuation_method,
        country: asset.country,
        owner_profile_id: asset.owner_profile_id,
      })),
      liabilities: (liabilitiesQuery.data ?? []).map((liability) => ({
        id: liability.id,
        name: liability.name,
        liability_type: liability.liability_type,
        currency: liability.currency,
        outstanding_balance: Number(liability.outstanding_balance),
        interest_rate: liability.interest_rate === null ? null : Number(liability.interest_rate),
        monthly_payment:
          liability.monthly_payment === null ? null : Number(liability.monthly_payment),
        end_date: liability.end_date,
        owner_profile_id: liability.owner_profile_id,
      })),
      income: (incomeQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        income_type: row.income_type,
        gross_amount: Number(row.gross_amount),
        net_amount: row.net_amount === null ? null : Number(row.net_amount),
        currency: row.currency,
        frequency: row.frequency,
        owner_profile_id: row.owner_profile_id,
      })),
      expenses: (expensesQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        amount: Number(row.amount),
        currency: row.currency,
        frequency: row.frequency,
        confidence: row.confidence,
        owner_profile_id: row.owner_profile_id,
      })),
      goals: (goalsQuery.data ?? []).map((goal) => ({
        id: goal.id,
        title: goal.title,
        goal_category: goal.goal_category,
        target_amount: Number(goal.target_amount),
        funded_amount: Number(goal.funded_amount),
        currency: goal.currency,
        target_date: goal.target_date,
        priority: goal.priority,
        status: goal.status,
        country: goal.country,
      })),
      watchlist: (watchlistQuery.data ?? []).map((item) => ({
        id: item.id,
        ticker: item.ticker,
        name: item.name,
        security_type: item.security_type,
        conviction: item.conviction,
        target_price: item.target_price === null ? null : Number(item.target_price),
        thesis: item.thesis,
        falsification: item.falsification,
      })),
      positions: portfolio.positions,
      watchQuotes,
      spending: spending.hasData
        ? {
            essentialMonthly: spending.essentialBaseline,
            lifestyleMonthly: spending.lifestyleBaseline,
            totalMonthly: spending.spendBaseline,
            incomeMonthly: spending.incomeBaseline,
            monthsOfData: spending.completeMonthCount,
            topCategories: breakdown.slice(0, 8).map((category) => ({
              name: category.name,
              monthly: category.current,
              essential: category.essential,
            })),
            movers: breakdown
              .filter((category) => category.change !== null && Math.abs(category.change) > 25)
              .slice(0, 6)
              .map((category) => ({
                name: category.name,
                current: category.current,
                previous: category.previous,
                changePct:
                  category.previous > 0
                    ? ((category.current - category.previous) / category.previous) * 100
                    : 100,
              })),
          }
        : null,
      allowances: (allowancesQuery.data ?? []).map((row) => ({
        profile_id: row.profile_id,
        tax_year: row.tax_year,
        isa_used: Number(row.isa_used),
        jisa_used: Number(row.jisa_used),
        lisa_used: Number(row.lisa_used),
        pension_used: Number(row.pension_used),
        employer_match_secured: row.employer_match_secured,
      })),
      marketDataAvailable: portfolio.market.configured === true,
      marketDataMessage: portfolio.market.message,
      toBase,
    });
  }, [
    base,
    household?.name,
    members,
    accountsQuery.data,
    assetsQuery.data,
    liabilitiesQuery.data,
    incomeQuery.data,
    expensesQuery.data,
    goalsQuery.data,
    watchlistQuery.data,
    allowancesQuery.data,
    portfolio.positions,
    portfolio.market.configured,
    portfolio.market.message,
    watchMarket.quotes,
    spending,
    toBase,
  ]);

  const concentration = useMemo(() => concentrationRows(result.policyInput), [result.policyInput]);

  const loading =
    accountsQuery.isLoading ||
    assetsQuery.isLoading ||
    liabilitiesQuery.isLoading ||
    goalsQuery.isLoading ||
    portfolio.loading;

  return {
    ...result,
    concentration,
    portfolio,
    watchMarket,
    positions: portfolio.positions as Position[],
    loading,
    base,
  };
}

export type HouseholdPosition = ReturnType<typeof useHouseholdPosition>;
