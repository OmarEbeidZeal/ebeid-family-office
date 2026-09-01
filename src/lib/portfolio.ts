/**
 * Turning holdings plus quotes into positions.
 *
 * Pure and shared: the portfolio page renders these rows, and the advisor
 * reasons from the identical numbers. A position with no live price is carried
 * through as unpriced — it is never valued at cost and passed off as market.
 */
import { balanceKnown } from "@/lib/balances";
import type { QuoteResult } from "@/lib/market/shared";
import type { Sleeve } from "@/lib/policy";


export type HoldingLike = {
  id: string;
  owner_profile_id?: string | null;
  account_id: string | null;
  ticker: string;
  name: string | null;
  security_type: string;
  quantity: number;
  avg_cost: number | null;
  currency: string;
  sleeve: string;
  thesis?: string | null;
  falsification?: string | null;
  target_price?: number | null;
  /** Null where a sale's purchase price is in no file the household holds. */
  realised_pnl?: number | null;
  /**
   * Shares the household held before the earliest imported export begins. Their
   * cost is not in any file, which is why a position can be real, priced, and
   * still have no honest return to show.
   */
  opening_quantity?: number | null;
  discovered_from?: string | null;
};


export type SecurityProfileLike = {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  industry: string | null;
  market_cap: number | null;
};

export type Position = {
  id: string;
  holding: HoldingLike;
  ticker: string;
  name: string | null;
  sleeve: Sleeve;
  securityType: string;
  /** Currency the price is quoted in once GBp pence have been normalised. */
  priceCurrency: string;
  quantity: number;
  avgCost: number | null;
  price: number | null;
  previousClose: number | null;
  asOf: string | null;
  quoteSource: QuoteResult["source"];
  quoteError: string | null;
  priced: boolean;
  /**
   * Whether the cost of these shares is actually known. False splits into two
   * cases the UI words differently: a holding entered by hand with no cost, and
   * a holding whose purchase predates every export imported so far.
   */
  basisKnown: boolean;
  /** Shares whose cost is missing because the export starts after they were bought. */
  openingQuantity: number;
  marketValueNative: number | null;
  marketValueBase: number | null;
  costNative: number | null;
  costBase: number;
  unrealisedNative: number | null;
  unrealisedBase: number | null;
  unrealisedPct: number | null;

  dayChangeNative: number | null;
  dayChangeBase: number | null;
  dayChangePct: number | null;
  /** Share of the priced portfolio, so the column sums to 100%. */
  portfolioWeightPct: number | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  hasThesis: boolean;
  targetPrice: number | null;
  distanceToTargetPct: number | null;
};

export type ToBase = (amount: number, currency: string) => number;

/** Finnhub quotes London listings in pence. Normalise so the maths stays honest. */
export function normalisePrice(price: number, currency: string | null | undefined) {
  if (currency === "GBp" || currency === "GBX") return { price: price / 100, currency: "GBP" };
  return { price, currency: currency ?? "" };
}

export function buildPositions(input: {
  holdings: HoldingLike[];
  quotes: Record<string, QuoteResult | undefined>;
  profiles: Record<string, SecurityProfileLike | undefined>;
  toBase: ToBase;
}): Position[] {
  const { holdings, quotes, profiles, toBase } = input;

  const rows = holdings.map((holding): Position => {
    const key = holding.ticker.toUpperCase();
    const quote = quotes[key];
    const profile = profiles[key];

    const declaredCurrency = holding.currency;
    const quoted = quote?.price != null ? normalisePrice(quote.price, profile?.currency) : null;
    const priceCurrency = quoted?.currency || profile?.currency || declaredCurrency;
    const price = quoted?.price ?? null;
    const previousClose =
      quote?.previousClose != null
        ? normalisePrice(quote.previousClose, profile?.currency).price
        : null;

    const quantity = Number(holding.quantity) || 0;
    const avgCost = holding.avg_cost === null ? null : Number(holding.avg_cost);
    const costNative = avgCost === null ? null : avgCost * quantity;
    const costBase = costNative === null ? 0 : toBase(costNative, declaredCurrency);

    const priced = price !== null && (quote?.source === "live" || quote?.source === "cache");
    const marketValueNative = price === null ? null : price * quantity;
    const marketValueBase =
      marketValueNative === null ? null : toBase(marketValueNative, priceCurrency);

    const unrealisedNative =
      marketValueNative === null || costNative === null ? null : marketValueNative - costNative;
    const unrealisedBase =
      marketValueBase === null || costNative === null ? null : marketValueBase - costBase;
    const unrealisedPct =
      unrealisedNative === null || !costNative ? null : (unrealisedNative / costNative) * 100;

    const dayChangeNative =
      price === null || previousClose === null ? null : (price - previousClose) * quantity;
    const dayChangeBase = dayChangeNative === null ? null : toBase(dayChangeNative, priceCurrency);
    const dayChangePct =
      price === null || !previousClose ? null : ((price - previousClose) / previousClose) * 100;

    const targetPrice = holding.target_price == null ? null : Number(holding.target_price);
    const distanceToTargetPct = targetPrice && price ? ((targetPrice - price) / price) * 100 : null;

    return {
      id: holding.id,
      holding,
      ticker: holding.ticker,
      name: holding.name ?? profile?.name ?? null,
      sleeve: (holding.sleeve as Sleeve) ?? "core",
      securityType: holding.security_type,
      priceCurrency,
      quantity,
      avgCost,
      price,
      previousClose,
      asOf: quote?.asOf ?? null,
      quoteSource: quote?.source ?? "none",
      quoteError: quote?.error ?? null,
      priced,
      basisKnown: avgCost !== null,
      openingQuantity: Number(holding.opening_quantity ?? 0) || 0,

      marketValueNative,
      marketValueBase,
      costNative,
      costBase,
      unrealisedNative,
      unrealisedBase,
      unrealisedPct,
      dayChangeNative,
      dayChangeBase,
      dayChangePct,
      portfolioWeightPct: null,
      industry: profile?.industry ?? null,
      country: profile?.country ?? null,
      exchange: profile?.exchange ?? null,
      hasThesis: !!holding.thesis?.trim() && !!holding.falsification?.trim(),
      targetPrice,
      distanceToTargetPct,
    };
  });

  const pricedTotal = rows.reduce(
    (sum, row) => sum + (row.priced ? (row.marketValueBase ?? 0) : 0),
    0,
  );
  for (const row of rows) {
    row.portfolioWeightPct =
      row.priced && pricedTotal > 0 ? ((row.marketValueBase ?? 0) / pricedTotal) * 100 : null;
  }
  return rows;
}

export type PortfolioTotals = {
  marketValueBase: number;
  costBase: number;
  unrealisedBase: number;
  unrealisedPct: number | null;
  dayChangeBase: number;
  dayChangePct: number | null;
  realisedBase: number;
  pricedCount: number;
  unpricedCount: number;
  /** Priced positions left out of the return because their cost is unknown. */
  unknownBasisCount: number;
  /** What those positions are worth, so their absence is quantified, not hidden. */
  unknownBasisValueBase: number;
  /** Holdings whose realised profit cannot be computed from the trades held. */
  unknownRealisedCount: number;
};

export function portfolioTotals(positions: Position[], toBase: ToBase): PortfolioTotals {
  const priced = positions.filter((p) => p.priced);
  const marketValueBase = priced.reduce((sum, p) => sum + (p.marketValueBase ?? 0), 0);

  // A position whose cost is unknown is worth what it is worth, but it has no
  // return. Counting it at a cost of zero would report the whole holding as
  // profit, which is the one thing this must never do — so the return is taken
  // across the positions that can answer for themselves, and the rest are
  // reported as excluded.
  const costed = priced.filter((p) => p.basisKnown);
  const costBase = costed.reduce((sum, p) => sum + p.costBase, 0);
  const costedValueBase = costed.reduce((sum, p) => sum + (p.marketValueBase ?? 0), 0);
  const unknownBasis = priced.filter((p) => !p.basisKnown);

  const dayChangeBase = priced.reduce((sum, p) => sum + (p.dayChangeBase ?? 0), 0);

  const realised = positions.filter(
    (p) => p.holding.realised_pnl !== null && p.holding.realised_pnl !== undefined,
  );
  const realisedBase = realised.reduce(
    (sum, p) => sum + toBase(Number(p.holding.realised_pnl), p.holding.currency),
    0,
  );

  const previousValue = marketValueBase - dayChangeBase;
  return {
    marketValueBase,
    costBase,
    unrealisedBase: costedValueBase - costBase,
    unrealisedPct: costBase > 0 ? ((costedValueBase - costBase) / costBase) * 100 : null,
    dayChangeBase,
    dayChangePct: previousValue > 0 ? (dayChangeBase / previousValue) * 100 : null,
    realisedBase,
    pricedCount: priced.length,
    unpricedCount: positions.length - priced.length,
    unknownBasisCount: unknownBasis.length,
    unknownBasisValueBase: unknownBasis.reduce((sum, p) => sum + (p.marketValueBase ?? 0), 0),
    unknownRealisedCount: positions.length - realised.length,
  };
}


export function sleeveTotals(positions: Position[]): Record<Sleeve, number> {
  const totals: Record<Sleeve, number> = {
    core: 0,
    bond: 0,
    thematic: 0,
    satellite: 0,
    crypto: 0,
  };
  for (const position of positions) {
    if (!position.priced) continue;
    totals[position.sleeve] = (totals[position.sleeve] ?? 0) + (position.marketValueBase ?? 0);
  }
  return totals;
}

export type ExposureSlice = { name: string; value: number; classified: boolean };

export function exposureBy(
  positions: Position[],
  pick: (position: Position) => string | null,
  unknownLabel: string,
): ExposureSlice[] {
  const map = new Map<string, { value: number; classified: boolean }>();
  for (const position of positions) {
    if (!position.priced) continue;
    const raw = pick(position);
    const key = raw && raw.trim() ? raw.trim() : unknownLabel;
    const existing = map.get(key) ?? { value: 0, classified: !!raw };
    existing.value += position.marketValueBase ?? 0;
    map.set(key, existing);
  }
  return Array.from(map.entries())
    .map(([name, entry]) => ({ name, value: entry.value, classified: entry.classified }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);
}

export type AccountReconciliation = {
  accountId: string;
  pricedValueBase: number;
  recordedBalanceBase: number;
  differenceBase: number;
  differencePct: number | null;
  pricedValueNative: number | null;
  accountCurrency: string;
  unpricedInAccount: number;
};

/**
 * Recorded account balances stay authoritative for net worth, so a gap between
 * a priced holdings total and its account balance is worth surfacing rather
 * than silently reconciling.
 */
export function reconcileAccounts(
  positions: Position[],
  accounts: {
    id: string;
    currency: string;
    current_balance: number;
    balance_source?: string | null;
  }[],
  toBase: ToBase,
): AccountReconciliation[] {
  const byAccount = new Map<string, Position[]>();
  for (const position of positions) {
    const accountId = position.holding.account_id;
    if (!accountId) continue;
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), position]);
  }

  const results: AccountReconciliation[] = [];
  for (const [accountId, rows] of byAccount) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) continue;
    // Nothing to reconcile against a balance nobody has stated — the gap would
    // just be the priced value, reported as a discrepancy.
    if (!balanceKnown(account)) continue;
    const priced = rows.filter((r) => r.priced);

    if (!priced.length) continue;
    const pricedValueBase = priced.reduce((sum, r) => sum + (r.marketValueBase ?? 0), 0);
    const recordedBalanceBase = toBase(Number(account.current_balance), account.currency);
    const differenceBase = pricedValueBase - recordedBalanceBase;
    // Value in the account's own currency, for the one-click balance update.
    const pricedValueNative = priced.reduce((sum, r) => {
      const native =
        r.priceCurrency === account.currency
          ? (r.marketValueNative ?? 0)
          : toBase(r.marketValueNative ?? 0, r.priceCurrency) / (toBase(1, account.currency) || 1);
      return sum + native;
    }, 0);
    results.push({
      accountId,
      pricedValueBase,
      recordedBalanceBase,
      differenceBase,
      differencePct: recordedBalanceBase > 0 ? (differenceBase / recordedBalanceBase) * 100 : null,
      pricedValueNative,
      accountCurrency: account.currency,
      unpricedInAccount: rows.length - priced.length,
    });
  }
  return results.sort((a, b) => Math.abs(b.differenceBase) - Math.abs(a.differenceBase));
}
