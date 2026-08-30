/**
 * Finnhub implementation of `PriceProvider`.
 *
 * Free tier is 60 calls a minute, so requests are chunked and throttled here
 * rather than at the call sites. Failures are returned as plain-English
 * messages — this file never invents a price.
 */
import type {
  PriceProvider,
  ProviderMetrics,
  ProviderNewsItem,
  ProviderProfile,
  QuoteOutcome,
} from "./shared";

const BASE_URL = "https://finnhub.io/api/v1";
/** Upstream calls issued in parallel. Keeps a portfolio refresh inside the free tier. */
const CONCURRENCY = 5;

type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type FinnhubProfile = {
  name?: string;
  exchange?: string;
  currency?: string;
  country?: string;
  finnhubIndustry?: string;
  logo?: string;
  marketCapitalization?: number;
  weburl?: string;
  ipo?: string;
};

type FinnhubMetrics = { metric?: Record<string, number | string | null> };

type FinnhubNews = {
  headline?: string;
  source?: string;
  url?: string;
  summary?: string;
  datetime?: number;
};

class FinnhubError extends Error {}

function describeStatus(status: number, ticker?: string): string {
  const subject = ticker ? `for ${ticker}` : "from the market-data provider";
  switch (status) {
    case 401:
    case 403:
      return `The Finnhub key was rejected (${status}). Check the FINNHUB_API_KEY secret.`;
    case 429:
      return "Finnhub rate limit reached (60 calls a minute on the free tier). Prices will refresh shortly.";
    case 404:
      return `Finnhub has no data ${subject}.`;
    default:
      return `Finnhub returned ${status} ${subject}.`;
  }
}

function num(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

export function createFinnhubProvider(apiKey: string): PriceProvider {
  async function call<T>(path: string, params: Record<string, string>, ticker?: string): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("token", apiKey);

    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: "application/json" } });
    } catch {
      throw new FinnhubError(
        "The market-data provider could not be reached. Check the connection and retry.",
      );
    }
    if (!response.ok) throw new FinnhubError(describeStatus(response.status, ticker));
    return (await response.json()) as T;
  }

  async function inBatches<T>(items: string[], worker: (item: string) => Promise<T>): Promise<T[]> {
    const results: T[] = [];
    for (let index = 0; index < items.length; index += CONCURRENCY) {
      const chunk = items.slice(index, index + CONCURRENCY);
      results.push(...(await Promise.all(chunk.map(worker))));
    }
    return results;
  }

  return {
    id: "finnhub",
    label: "Finnhub",

    async quotes(tickers: string[]): Promise<QuoteOutcome[]> {
      const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()))).filter(Boolean);

      return inBatches(unique, async (ticker): Promise<QuoteOutcome> => {
        try {
          const payload = await call<FinnhubQuote>("/quote", { symbol: ticker }, ticker);
          const price = num(payload.c);
          if (price === null || price <= 0) {
            return {
              ticker,
              quote: null,
              error: `No price returned for ${ticker}. Check the symbol matches the exchange listing.`,
            };
          }
          const stamped = num(payload.t);
          return {
            ticker,
            quote: {
              ticker,
              price,
              previousClose: num(payload.pc),
              change: num(payload.d),
              changePct: num(payload.dp),
              currency: null, // /quote omits currency; the profile carries it
              asOf: stamped ? new Date(stamped * 1000).toISOString() : new Date().toISOString(),
            },
            error: null,
          };
        } catch (error) {
          return {
            ticker,
            quote: null,
            error: error instanceof Error ? error.message : `Could not price ${ticker}.`,
          };
        }
      });
    },

    async profile(ticker: string): Promise<ProviderProfile | null> {
      const payload = await call<FinnhubProfile>("/stock/profile2", { symbol: ticker }, ticker);
      if (!payload || !payload.name) return null;
      const capMillions = num(payload.marketCapitalization);
      return {
        ticker,
        name: payload.name ?? null,
        exchange: payload.exchange ?? null,
        currency: payload.currency ?? null,
        country: payload.country ?? null,
        industry: payload.finnhubIndustry ?? null,
        logo: payload.logo ?? null,
        marketCap: capMillions === null ? null : capMillions * 1_000_000,
        website: payload.weburl ?? null,
        ipo: payload.ipo ?? null,
      };
    },

    async metrics(ticker: string): Promise<ProviderMetrics | null> {
      const payload = await call<FinnhubMetrics>(
        "/stock/metric",
        { symbol: ticker, metric: "all" },
        ticker,
      );
      const metric = payload.metric;
      if (!metric) return null;
      return {
        ticker,
        week52High: num(metric["52WeekHigh"]),
        week52Low: num(metric["52WeekLow"]),
        beta: num(metric["beta"]),
        priceToSales: num(metric["psTTM"]),
        priceToEarnings: num(metric["peTTM"]),
        grossMarginPct: num(metric["grossMarginTTM"]),
        netMarginPct: num(metric["netProfitMarginTTM"]),
        dividendYieldPct: num(metric["currentDividendYieldTTM"]),
        revenueGrowthPct: num(metric["revenueGrowthTTMYoy"]),
      };
    },

    async news(ticker: string, days = 14): Promise<ProviderNewsItem[]> {
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const payload = await call<FinnhubNews[]>(
        "/company-news",
        {
          symbol: ticker,
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
        },
        ticker,
      );
      if (!Array.isArray(payload)) return [];
      return payload
        .filter((item) => item.headline)
        .slice(0, 8)
        .map((item) => ({
          headline: item.headline!,
          source: item.source ?? null,
          url: item.url ?? null,
          summary: item.summary?.slice(0, 400) ?? null,
          publishedAt: item.datetime
            ? new Date(item.datetime * 1000).toISOString()
            : new Date().toISOString(),
        }));
    },
  };
}
