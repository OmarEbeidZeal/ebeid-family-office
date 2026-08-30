import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SecurityDetail } from "@/lib/market/shared";
import type { LoadQuotesResult, ProviderTestResult } from "@/lib/market/service.server";

const tickersInput = z.object({
  tickers: z.array(z.string().min(1).max(24)).max(60),
  includeProfiles: z.boolean().optional(),
});

const tickerInput = z.object({ ticker: z.string().min(1).max(24) });

/** Cached quotes for a batch of tickers. Never one request per row. */
export const getQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tickersInput.parse(data))
  .handler(async ({ data }): Promise<LoadQuotesResult> => {
    const { loadQuotes } = await import("@/lib/market/service.server");
    return loadQuotes(data.tickers, { includeProfiles: data.includeProfiles ?? true });
  });

/** Company profile, fundamentals and recent headlines for one security. */
export const getSecurityDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => tickerInput.parse(data))
  .handler(async ({ data }): Promise<SecurityDetail> => {
    const { loadSecurityDetail } = await import("@/lib/market/service.server");
    return loadSecurityDetail(data.ticker);
  });

/** Settings → Market data: check the configured key against a live symbol. */
export const testMarketData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ProviderTestResult> => {
    const { testProvider } = await import("@/lib/market/service.server");
    return testProvider();
  });
