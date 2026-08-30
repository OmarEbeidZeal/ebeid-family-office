/**
 * Market data, cached.
 *
 * Every quote the app shows comes through here. The rules are strict on
 * purpose: serve from `price_snapshots` while a snapshot is under a minute old,
 * batch anything else into one throttled provider call, and never dress an old
 * price up as a live one — a stale price is returned labelled `stale` with the
 * timestamp it was taken, so the UI can say so.
 */
import type { Json } from "@/integrations/supabase/types";
import { resolvePriceProvider } from "./provider.server";
import {
  NEWS_CACHE_HOURS,
  PROFILE_CACHE_HOURS,
  QUOTE_CACHE_SECONDS,
  type ProviderMetrics,
  type ProviderNewsItem,
  type ProviderProfile,
  type QuoteResult,
  type QuotesResponse,
  type SecurityDetail,
} from "./shared";

export type SecurityProfileRow = {
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  industry: string | null;
  market_cap: number | null;
};

type SnapshotRow = {
  ticker: string;
  price: number;
  currency: string;
  previous_close: number | null;
  change_pct: number | null;
  as_of: string;
  created_at: string;
};

/** Profiles refreshed per request, so one portfolio load cannot exhaust the tier. */
const PROFILE_REFRESH_BUDGET = 8;

export function normaliseTickers(tickers: string[]): string[] {
  return Array.from(
    new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)),
  ).slice(0, 60);
}

const ageSeconds = (iso: string, now: number) => (now - new Date(iso).getTime()) / 1000;

function snapshotToQuote(
  row: SnapshotRow,
  source: "cache" | "stale",
  error: string | null,
): QuoteResult {
  return {
    ticker: row.ticker,
    price: Number(row.price),
    currency: row.currency || null,
    previousClose: row.previous_close === null ? null : Number(row.previous_close),
    change: row.previous_close === null ? null : Number(row.price) - Number(row.previous_close),
    changePct: row.change_pct === null ? null : Number(row.change_pct),
    asOf: row.as_of,
    source,
    error,
  };
}

async function latestSnapshots(tickers: string[]): Promise<Map<string, SnapshotRow>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("price_snapshots")
    .select("ticker, price, currency, previous_close, change_pct, as_of, created_at")
    .in("ticker", tickers)
    .order("created_at", { ascending: false })
    .limit(tickers.length * 5);

  const map = new Map<string, SnapshotRow>();
  for (const row of (data ?? []) as SnapshotRow[]) {
    if (!map.has(row.ticker)) map.set(row.ticker, row);
  }
  return map;
}

async function readProfiles(tickers: string[]): Promise<
  Map<
    string,
    SecurityProfileRow & {
      profile_as_of: string | null;
      metrics_as_of: string | null;
      news_as_of: string | null;
      metrics: unknown;
      news: unknown;
    }
  >
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("security_profiles")
    .select(
      "ticker, name, exchange, currency, country, industry, market_cap, profile_as_of, metrics_as_of, news_as_of, metrics, news",
    )
    .in("ticker", tickers);
  const map = new Map<string, never>() as Map<
    string,
    SecurityProfileRow & {
      profile_as_of: string | null;
      metrics_as_of: string | null;
      news_as_of: string | null;
      metrics: unknown;
      news: unknown;
    }
  >;
  for (const row of data ?? []) map.set(row.ticker, row as never);
  return map;
}

async function writeProfile(ticker: string, profile: ProviderProfile) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("security_profiles").upsert(
    {
      ticker,
      name: profile.name,
      exchange: profile.exchange,
      currency: profile.currency,
      country: profile.country,
      industry: profile.industry,
      logo: profile.logo,
      market_cap: profile.marketCap,
      profile: profile as unknown as Json,
      profile_as_of: new Date().toISOString(),
    },
    { onConflict: "ticker" },
  );
}

export type LoadQuotesResult = QuotesResponse & { profiles: SecurityProfileRow[] };

export async function loadQuotes(
  tickers: string[],
  options?: { includeProfiles?: boolean },
): Promise<LoadQuotesResult> {
  const wanted = normaliseTickers(tickers);
  const fetchedAt = new Date().toISOString();
  const resolution = resolvePriceProvider();

  if (!wanted.length) {
    return {
      configured: resolution.configured,
      provider: resolution.provider?.id ?? null,
      providerLabel: resolution.provider?.label ?? null,
      message: resolution.configured ? null : resolution.message,
      fetchedAt,
      quotes: [],
      profiles: [],
    };
  }

  const now = Date.now();
  const snapshots = await latestSnapshots(wanted);
  const quotes: QuoteResult[] = [];
  const needsFetch: string[] = [];

  for (const ticker of wanted) {
    const snapshot = snapshots.get(ticker);
    if (snapshot && ageSeconds(snapshot.created_at, now) < QUOTE_CACHE_SECONDS) {
      quotes.push(snapshotToQuote(snapshot, "cache", null));
    } else {
      needsFetch.push(ticker);
    }
  }

  if (needsFetch.length && !resolution.configured) {
    for (const ticker of needsFetch) {
      const snapshot = snapshots.get(ticker);
      quotes.push(
        snapshot
          ? snapshotToQuote(snapshot, "stale", resolution.message)
          : {
              ticker,
              price: null,
              currency: null,
              previousClose: null,
              change: null,
              changePct: null,
              asOf: null,
              source: "none",
              error: resolution.message,
            },
      );
    }
  } else if (needsFetch.length && resolution.provider) {
    const outcomes = await resolution.provider.quotes(needsFetch);
    const inserts: Record<string, unknown>[] = [];
    const profileCurrencies = options?.includeProfiles ? await readProfiles(needsFetch) : null;

    for (const outcome of outcomes) {
      if (outcome.quote) {
        const currency =
          outcome.quote.currency ?? profileCurrencies?.get(outcome.ticker)?.currency ?? null;
        quotes.push({
          ticker: outcome.ticker,
          price: outcome.quote.price,
          currency,
          previousClose: outcome.quote.previousClose,
          change: outcome.quote.change,
          changePct: outcome.quote.changePct,
          asOf: outcome.quote.asOf,
          source: "live",
          error: null,
        });
        inserts.push({
          ticker: outcome.ticker,
          price: outcome.quote.price,
          previous_close: outcome.quote.previousClose,
          change_pct: outcome.quote.changePct,
          as_of: outcome.quote.asOf,
          ...(currency ? { currency } : {}),
        });
      } else {
        const snapshot = snapshots.get(outcome.ticker);
        quotes.push(
          snapshot
            ? snapshotToQuote(snapshot, "stale", outcome.error)
            : {
                ticker: outcome.ticker,
                price: null,
                currency: null,
                previousClose: null,
                change: null,
                changePct: null,
                asOf: null,
                source: "none",
                error: outcome.error,
              },
        );
      }
    }

    if (inserts.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("price_snapshots").insert(inserts as never);
    }
  }

  let profiles: SecurityProfileRow[] = [];
  if (options?.includeProfiles) {
    profiles = await loadProfiles(wanted, resolution.provider !== null);
  }

  const failures = quotes.filter((quote) => quote.source === "none" || quote.source === "stale");
  const message = !resolution.configured
    ? resolution.message
    : failures.length === quotes.length && quotes.length > 0
      ? (failures[0]?.error ?? "Market data is unavailable right now.")
      : null;

  return {
    configured: resolution.configured,
    provider: resolution.provider?.id ?? null,
    providerLabel: resolution.provider?.label ?? null,
    message,
    fetchedAt,
    quotes: quotes.sort((a, b) => wanted.indexOf(a.ticker) - wanted.indexOf(b.ticker)),
    profiles,
  };
}

/** Company profiles: cached for a week, refreshed a few at a time. */
export async function loadProfiles(
  tickers: string[],
  canFetch: boolean,
): Promise<SecurityProfileRow[]> {
  const wanted = normaliseTickers(tickers);
  if (!wanted.length) return [];
  const cached = await readProfiles(wanted);
  const now = Date.now();

  const stale = wanted.filter((ticker) => {
    const row = cached.get(ticker);
    if (!row?.profile_as_of) return true;
    return (now - new Date(row.profile_as_of).getTime()) / 3_600_000 > PROFILE_CACHE_HOURS;
  });

  if (canFetch && stale.length) {
    const resolution = resolvePriceProvider();
    if (resolution.provider) {
      for (const ticker of stale.slice(0, PROFILE_REFRESH_BUDGET)) {
        try {
          const profile = await resolution.provider.profile(ticker);
          if (profile) {
            await writeProfile(ticker, profile);
            cached.set(ticker, {
              ticker,
              name: profile.name,
              exchange: profile.exchange,
              currency: profile.currency,
              country: profile.country,
              industry: profile.industry,
              market_cap: profile.marketCap,
              profile_as_of: new Date().toISOString(),
              metrics_as_of: cached.get(ticker)?.metrics_as_of ?? null,
              news_as_of: cached.get(ticker)?.news_as_of ?? null,
              metrics: cached.get(ticker)?.metrics ?? null,
              news: cached.get(ticker)?.news ?? null,
            });
          }
        } catch {
          // A profile lookup failing is not worth failing the page over; the
          // holding simply shows as unclassified.
        }
      }
    }
  }

  return wanted
    .map((ticker) => cached.get(ticker))
    .filter((row): row is NonNullable<typeof row> => !!row)
    .map((row) => ({
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      currency: row.currency,
      country: row.country,
      industry: row.industry,
      market_cap: row.market_cap,
    }));
}

export async function loadSecurityDetail(ticker: string): Promise<SecurityDetail> {
  const key = ticker.trim().toUpperCase();
  const resolution = resolvePriceProvider();
  const cached = (await readProfiles([key])).get(key);
  const now = Date.now();

  const hoursSince = (iso: string | null | undefined) =>
    iso ? (now - new Date(iso).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;

  let profile: ProviderProfile | null = cached
    ? {
        ticker: key,
        name: cached.name,
        exchange: cached.exchange,
        currency: cached.currency,
        country: cached.country,
        industry: cached.industry,
        logo: null,
        marketCap: cached.market_cap,
        website: null,
        ipo: null,
      }
    : null;
  let metrics = (cached?.metrics as ProviderMetrics | null) ?? null;
  let news = (cached?.news as ProviderNewsItem[] | null) ?? [];
  let profileAsOf = cached?.profile_as_of ?? null;
  let metricsAsOf = cached?.metrics_as_of ?? null;
  let newsAsOf = cached?.news_as_of ?? null;
  let message: string | null = resolution.configured ? null : resolution.message;

  if (resolution.provider) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { ticker: key };
    let dirty = false;

    if (hoursSince(profileAsOf) > PROFILE_CACHE_HOURS) {
      try {
        const fresh = await resolution.provider.profile(key);
        if (fresh) {
          profile = fresh;
          profileAsOf = new Date().toISOString();
          Object.assign(patch, {
            name: fresh.name,
            exchange: fresh.exchange,
            currency: fresh.currency,
            country: fresh.country,
            industry: fresh.industry,
            logo: fresh.logo,
            market_cap: fresh.marketCap,
            profile: fresh,
            profile_as_of: profileAsOf,
          });
          dirty = true;
        }
      } catch (error) {
        message = error instanceof Error ? error.message : "Company profile unavailable.";
      }
    }

    if (hoursSince(metricsAsOf) > PROFILE_CACHE_HOURS) {
      try {
        const fresh = await resolution.provider.metrics(key);
        if (fresh) {
          metrics = fresh;
          metricsAsOf = new Date().toISOString();
          Object.assign(patch, { metrics: fresh, metrics_as_of: metricsAsOf });
          dirty = true;
        }
      } catch (error) {
        message ??= error instanceof Error ? error.message : "Fundamentals unavailable.";
      }
    }

    if (hoursSince(newsAsOf) > NEWS_CACHE_HOURS) {
      try {
        const fresh = await resolution.provider.news(key);
        news = fresh;
        newsAsOf = new Date().toISOString();
        Object.assign(patch, { news: fresh, news_as_of: newsAsOf });
        dirty = true;
      } catch (error) {
        message ??= error instanceof Error ? error.message : "News unavailable.";
      }
    }

    if (dirty) {
      await supabaseAdmin
        .from("security_profiles")
        .upsert(patch as never, { onConflict: "ticker" });
    }
  }

  return {
    ticker: key,
    profile,
    metrics,
    news: Array.isArray(news) ? news : [],
    profileAsOf,
    metricsAsOf,
    newsAsOf,
    configured: resolution.configured,
    message,
  };
}

export type ProviderTestResult = {
  configured: boolean;
  ok: boolean;
  message: string;
  provider: string | null;
  sample: { ticker: string; price: number; asOf: string } | null;
};

/** Settings → Market data: proves the key works against a real symbol. */
export async function testProvider(): Promise<ProviderTestResult> {
  const resolution = resolvePriceProvider();
  if (!resolution.provider) {
    return {
      configured: false,
      ok: false,
      message: resolution.message,
      provider: null,
      sample: null,
    };
  }
  const [outcome] = await resolution.provider.quotes(["AAPL"]);
  if (!outcome?.quote) {
    return {
      configured: true,
      ok: false,
      message: outcome?.error ?? "The provider returned no price for the test symbol.",
      provider: resolution.provider.id,
      sample: null,
    };
  }
  return {
    configured: true,
    ok: true,
    message: `${resolution.provider.label} responded with a live price for AAPL.`,
    provider: resolution.provider.id,
    sample: {
      ticker: outcome.quote.ticker,
      price: outcome.quote.price,
      asOf: outcome.quote.asOf,
    },
  };
}
