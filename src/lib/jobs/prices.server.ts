/**
 * Closing prices.
 *
 * Cached quotes only exist for the minutes somebody was looking at the app.
 * This runs after the US close and writes one `price_snapshots` row per held
 * and watchlisted ticker, so the portfolio has a genuine closing series rather
 * than a scatter of whatever happened to be fetched during a visit.
 *
 * Nothing is invented: a ticker the provider will not price is reported as a
 * failure, not carried forward at yesterday's number.
 */
import type { Json } from "@/integrations/supabase/types";
import { loadQuotes } from "@/lib/market/service.server";
import type { JobOutcome } from "./runs.server";

/** Well inside Finnhub's free 60-calls-a-minute ceiling. */
const CHUNK = 25;

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

export async function runMarketClose(): Promise<JobOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [holdings, watchlist] = await Promise.all([
    supabaseAdmin
      .from("holdings")
      .select("ticker")
      .then(({ data }) => data ?? []),
    supabaseAdmin
      .from("watchlist")
      .select("ticker")
      .then(({ data }) => data ?? []),
  ]);

  const tickers = Array.from(
    new Set(
      [...holdings, ...watchlist]
        .map((row) => row.ticker?.trim().toUpperCase())
        .filter((ticker): ticker is string => !!ticker),
    ),
  );

  if (!tickers.length) {
    return {
      status: "skipped",
      message: "No holdings or watchlist tickers to price yet.",
    };
  }

  let live = 0;
  let configured = true;
  let message: string | null = null;
  const unpriced: string[] = [];

  for (const chunk of chunked(tickers, CHUNK)) {
    // maxAgeSeconds: 0 bypasses the screen cache. A closing series built from
    // whatever happened to be cached during the afternoon is not a closing
    // series, so every ticker is asked for fresh.
    const result = await loadQuotes(chunk, { includeProfiles: false, maxAgeSeconds: 0 });
    if (!result.configured) configured = false;
    if (result.message && !message) message = result.message;
    for (const quote of result.quotes) {
      if (quote.source === "live") live += 1;
      else unpriced.push(quote.ticker);
    }
  }

  if (!configured) {
    return {
      status: "skipped",
      message: message ?? "Market data is not configured, so no closing prices were stored.",
      detail: { tickers: tickers.length } as Json,
    };
  }

  return {
    status: unpriced.length ? "partial" : "ok",
    message: unpriced.length
      ? `${live} of ${tickers.length} tickers priced. No price for ${unpriced.slice(0, 6).join(", ")}${unpriced.length > 6 ? "…" : ""}.`
      : `Closing prices stored for ${live} ticker${live === 1 ? "" : "s"}.`,
    detail: { tickers: tickers.length, priced: live, unpriced } as Json,
  };
}
