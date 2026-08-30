/**
 * The one place the market-data provider is chosen. Swapping Finnhub for
 * Polygon or Alpha Vantage means adding a sibling of `finnhub.server.ts` and
 * changing this file — nothing else in the app knows the provider's name.
 */
import type { PriceProvider } from "./shared";
import { createFinnhubProvider } from "./finnhub.server";

export type ProviderResolution =
  | { provider: PriceProvider; configured: true; message: null }
  | { provider: null; configured: false; message: string };

const MISSING_KEY_MESSAGE =
  "Market data is unavailable — no Finnhub key is configured. Add FINNHUB_API_KEY in Project Settings → Secrets (a free key from finnhub.io is enough) and prices will start updating.";

/** Reads the key at call time: env vars are injected per request, not at import. */
export function resolvePriceProvider(): ProviderResolution {
  const apiKey = process.env["FINNHUB_API_KEY"];
  if (!apiKey) return { provider: null, configured: false, message: MISSING_KEY_MESSAGE };
  return { provider: createFinnhubProvider(apiKey), configured: true, message: null };
}
