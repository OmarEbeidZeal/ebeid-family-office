/**
 * Market-data contracts.
 *
 * Everything the app knows about a price passes through these types. They are
 * deliberately provider-agnostic: `PriceProvider` is the only surface the rest
 * of the system talks to, so swapping Finnhub for Polygon or Alpha Vantage is a
 * single new file plus one line in `provider.server.ts`.
 *
 * Type-only module — safe to import from client code.
 */

export type ProviderQuote = {
  ticker: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string | null;
  /** ISO timestamp the provider stamped on the price. */
  asOf: string;
};

export type ProviderProfile = {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  industry: string | null;
  logo: string | null;
  /** Absolute, in the listing currency. */
  marketCap: number | null;
  website: string | null;
  ipo: string | null;
};

export type ProviderMetrics = {
  ticker: string;
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  priceToSales: number | null;
  priceToEarnings: number | null;
  grossMarginPct: number | null;
  netMarginPct: number | null;
  dividendYieldPct: number | null;
  revenueGrowthPct: number | null;
};

export type ProviderNewsItem = {
  headline: string;
  source: string | null;
  url: string | null;
  summary: string | null;
  publishedAt: string;
};

export type QuoteOutcome = {
  ticker: string;
  quote: ProviderQuote | null;
  /** Plain-English reason there is no price. Never a fabricated fallback. */
  error: string | null;
};

export interface PriceProvider {
  readonly id: string;
  readonly label: string;
  /** One call per ticker upstream, but always batched and throttled by the provider. */
  quotes(tickers: string[]): Promise<QuoteOutcome[]>;
  profile(ticker: string): Promise<ProviderProfile | null>;
  metrics(ticker: string): Promise<ProviderMetrics | null>;
  news(ticker: string, days?: number): Promise<ProviderNewsItem[]>;
}

/**
 * Where a displayed price came from.
 * - `live`   — fetched from the provider just now
 * - `cache`  — a snapshot under the cache window, effectively the same price
 * - `stale`  — the provider failed; this is the last price we ever saw, and the
 *              UI must label it as old rather than pass it off as current
 * - `none`   — no price at all
 */
export type QuoteSource = "live" | "cache" | "stale" | "none";

export type QuoteResult = {
  ticker: string;
  price: number | null;
  currency: string | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  asOf: string | null;
  source: QuoteSource;
  error: string | null;
};

export type QuotesResponse = {
  /** False when no market-data key is configured for the workspace. */
  configured: boolean;
  provider: string | null;
  providerLabel: string | null;
  /** Set when the whole request could not be served — shown verbatim in the UI. */
  message: string | null;
  fetchedAt: string;
  quotes: QuoteResult[];
};

export type SecurityDetail = {
  ticker: string;
  profile: ProviderProfile | null;
  metrics: ProviderMetrics | null;
  news: ProviderNewsItem[];
  profileAsOf: string | null;
  metricsAsOf: string | null;
  newsAsOf: string | null;
  configured: boolean;
  message: string | null;
};

/** Seconds a cached quote is treated as current. Finnhub's free tier is 60 calls/minute. */
export const QUOTE_CACHE_SECONDS = 60;
/** Company profile and fundamentals barely move; a week is plenty. */
export const PROFILE_CACHE_HOURS = 24 * 7;
export const NEWS_CACHE_HOURS = 6;

export function quoteIsUsable(quote: QuoteResult | null | undefined): quote is QuoteResult {
  return !!quote && quote.price !== null && (quote.source === "live" || quote.source === "cache");
}
