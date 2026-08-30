import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { MarketDataBanner } from "@/components/portfolio/MarketDataBanner";
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { ConcentrationPanel } from "@/components/portfolio/ConcentrationPanel";
import { SleevePanel } from "@/components/portfolio/SleevePanel";
import { ExposurePanel } from "@/components/portfolio/ExposurePanel";
import { WatchlistPanel } from "@/components/portfolio/WatchlistPanel";
import { WatchlistSheet } from "@/components/portfolio/WatchlistSheet";
import { HoldingSheet } from "@/components/portfolio/HoldingSheet";
import { TradeSheet } from "@/components/portfolio/TradeSheet";
import { TradesPanel } from "@/components/portfolio/TradesPanel";
import { SecurityDetailSheet } from "@/components/portfolio/SecurityDetailSheet";
import { ReconciliationPanel } from "@/components/portfolio/ReconciliationPanel";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useScope } from "@/hooks/useScope";
import { useHouseholdContext } from "@/hooks/useHouseholdContext";
import {
  useAccounts,
  useHoldings,
  useTrades,
  useWatchlist,
  type HoldingRow,
  type TradeRow,
  type WatchlistRow,
} from "@/hooks/useFinancials";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import {
  exposureBy,
  portfolioTotals,
  reconcileAccounts,
  sleeveTotals,
  type Position,
} from "@/lib/portfolio";
import { allocationRows, concentrationRows, POLICY_VERSION } from "@/lib/policy";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · Ebeid Family Office" },
      {
        name: "description",
        content:
          "Live holdings, sleeve allocation, concentration against the household investment policy, and a thesis-backed watchlist.",
      },
      { property: "og:title", content: "Portfolio · Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Live holdings, sleeve allocation, concentration against the household investment policy, and a thesis-backed watchlist.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { household } = useAuth();
  const { base } = useCurrency();
  const { scope, matches } = useScope();

  const holdings = useHoldings();
  const trades = useTrades();
  const watchlist = useWatchlist();
  const accounts = useAccounts();
  const context = useHouseholdContext();

  const [holdingSheet, setHoldingSheet] = useState<{ open: boolean; holding: HoldingRow | null }>({
    open: false,
    holding: null,
  });
  const [tradeSheet, setTradeSheet] = useState<{
    open: boolean;
    trade: TradeRow | null;
    holdingId?: string;
  }>({ open: false, trade: null });
  const [watchSheet, setWatchSheet] = useState<{ open: boolean; item: WatchlistRow | null }>({
    open: false,
    item: null,
  });
  const [detailTicker, setDetailTicker] = useState<string | null>(null);

  const deleteHolding = useDeleteRow("holdings", "holdings", "Holding");
  const deleteTrade = useDeleteRow("trades", "trades", "Trade");
  const deleteWatch = useDeleteRow("watchlist", "watchlist", "Watchlist idea");

  /** Rows respect the Me / Haya / Household toggle; policy always measures the household. */
  const visiblePositions = useMemo(
    () =>
      context.positions.filter((position) => matches(position.holding.owner_profile_id ?? null)),
    [context.positions, matches],
  );

  const toBase = useMemo(
    () => (amount: number, currency: string) => context.toBase(amount, currency),
    [context],
  );

  const totals = useMemo(
    () => portfolioTotals(visiblePositions, toBase),
    [visiblePositions, toBase],
  );

  const sleeves = useMemo(() => sleeveTotals(context.positions), [context.positions]);
  const allocation = useMemo(
    () => allocationRows(sleeves, context.investableTotal),
    [sleeves, context.investableTotal],
  );
  const concentration = useMemo(
    () => concentrationRows(context.policyInput),
    [context.policyInput],
  );

  const sectors = useMemo(
    () => exposureBy(visiblePositions, (position) => position.industry, "Unclassified"),
    [visiblePositions],
  );
  const regions = useMemo(
    () => exposureBy(visiblePositions, (position) => position.country, "Unknown region"),
    [visiblePositions],
  );

  const reconciliation = useMemo(
    () =>
      reconcileAccounts(
        context.positions,
        (accounts.data ?? []).map((account) => ({
          id: account.id,
          currency: account.currency,
          current_balance: Number(account.current_balance),
        })),
        toBase,
      ),
    [context.positions, accounts.data, toBase],
  );

  const tradesForHoldings = useMemo(() => {
    const ids = new Set(visiblePositions.map((position) => position.id));
    return (trades.data ?? []).filter((trade) => ids.has(trade.holding_id));
  }, [trades.data, visiblePositions]);

  const tradeCountByHolding = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trade of trades.data ?? [])
      counts.set(trade.holding_id, (counts.get(trade.holding_id) ?? 0) + 1);
    return counts;
  }, [trades.data]);

  const visibleWatchlist = watchlist.data ?? [];
  const loading = holdings.isLoading || context.loading;
  const netWorthShare =
    context.netWorth.netWorth > 0 && totals.marketValueBase > 0
      ? (totals.marketValueBase / context.netWorth.netWorth) * 100
      : null;

  const onSelect = (position: Position) => setDetailTicker(position.ticker);

  return (
    <AppShell
      title="Portfolio"
      description={`Holdings, policy limits and ideas${scope !== "household" ? " for the selected view" : ""}. Investment policy ${POLICY_VERSION}.`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTradeSheet({ open: true, trade: null })}
            disabled={!holdings.data?.length}
          >
            Record trade
          </Button>
          <Button size="sm" onClick={() => setHoldingSheet({ open: true, holding: null })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add holding
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <MarketDataBanner
          configured={context.market.configured}
          message={context.market.message}
          fetchedAt={context.market.fetchedAt}
          refreshing={context.market.isFetching}
          onRefresh={() => void context.market.refetch()}
          unpricedCount={totals.unpricedCount}
        />

        <PortfolioSummary
          totals={totals}
          base={base}
          loading={loading}
          netWorthShare={netWorthShare}
        />

        <section>
          <SectionHeader
            title="Holdings"
            description={
              visiblePositions.length
                ? "Native currency on top, base-currency conversion beneath. Weights are a share of the priced portfolio."
                : "Positions priced from live market data."
            }
          />
          {!loading && visiblePositions.length === 0 ? (
            <EmptyState
              title={holdings.data?.length ? "No holdings in this view" : "No holdings recorded"}
              body={
                holdings.data?.length
                  ? "Switch the perspective toggle back to Household to see every position, or add a holding owned by this person."
                  : "Add each position you hold — ticker, quantity and the account it sits in. Prices, exposure and every policy limit follow from there. Nothing is estimated on your behalf."
              }
              action={
                <Button size="sm" onClick={() => setHoldingSheet({ open: true, holding: null })}>
                  Add the first holding
                </Button>
              }
            />
          ) : (
            <HoldingsTable
              positions={visiblePositions}
              base={base}
              loading={loading}
              onSelect={onSelect}
              onEdit={(position) =>
                setHoldingSheet({ open: true, holding: position.holding as HoldingRow })
              }
              onDelete={(position) => deleteHolding.mutate(position.id)}
              onTrade={(position) =>
                setTradeSheet({ open: true, trade: null, holdingId: position.id })
              }
            />
          )}
        </section>

        <ReconciliationPanel rows={reconciliation} accounts={accounts.data ?? []} base={base} />

        <ConcentrationPanel rows={concentration} loading={loading} />

        <div className="grid gap-4 lg:grid-cols-2">
          <SleevePanel
            rows={allocation}
            base={base}
            investableTotal={context.investableTotal}
            unpricedCount={totals.unpricedCount}
            holdingCount={totals.pricedCount + totals.unpricedCount}
            loading={loading}
          />

          <TradesPanel
            trades={tradesForHoldings}
            holdings={holdings.data ?? []}
            loading={trades.isLoading}
            onAdd={() => setTradeSheet({ open: true, trade: null })}
            onEdit={(trade) => setTradeSheet({ open: true, trade })}
            onDelete={(trade) => deleteTrade.mutate(trade.id)}
          />
        </div>

        <ExposurePanel sectors={sectors} regions={regions} base={base} loading={loading} />

        <WatchlistPanel
          items={visibleWatchlist}
          quotes={context.market.quotes}
          loading={watchlist.isLoading}
          onAdd={() => setWatchSheet({ open: true, item: null })}
          onEdit={(item) => setWatchSheet({ open: true, item })}
          onDelete={(item) => deleteWatch.mutate(item.id)}
          onOpenTicker={(ticker) => setDetailTicker(ticker)}
        />

        <p className="pb-2 text-xs leading-relaxed text-muted-foreground">
          Prices come from the configured market-data provider and are stamped with the time they
          were fetched. {household?.name ?? "The household"} records balances separately on each
          account, which remain the figures net worth is built from.
        </p>
      </div>

      <HoldingSheet
        open={holdingSheet.open}
        onOpenChange={(open) => setHoldingSheet((current) => ({ ...current, open }))}
        holding={holdingSheet.holding}
        hasTrades={
          !!holdingSheet.holding && (tradeCountByHolding.get(holdingSheet.holding.id) ?? 0) > 0
        }
      />

      <TradeSheet
        open={tradeSheet.open}
        onOpenChange={(open) => setTradeSheet((current) => ({ ...current, open }))}
        holdings={holdings.data ?? []}
        trade={tradeSheet.trade}
        defaultHoldingId={tradeSheet.holdingId}
      />

      <WatchlistSheet
        open={watchSheet.open}
        onOpenChange={(open) => setWatchSheet((current) => ({ ...current, open }))}
        item={watchSheet.item}
      />

      <SecurityDetailSheet
        ticker={detailTicker}
        onOpenChange={(open) => !open && setDetailTicker(null)}
      />
    </AppShell>
  );
}
