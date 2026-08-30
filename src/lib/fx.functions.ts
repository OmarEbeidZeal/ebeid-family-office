/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QUOTES = ["USD", "EGP", "JOD", "EUR", "AED", "SAR", "GBP"];

/** Fetches live GBP-based FX rates and upserts today's row for each pair. */
export const refreshFxRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const response = await fetch("https://open.er-api.com/v6/latest/GBP");
    if (!response.ok) {
      throw new Error(`Rate provider returned ${response.status}`);
    }
    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    if (payload.result !== "success" || !payload.rates) {
      throw new Error("Rate provider returned an unexpected response.");
    }

    const asOf = new Date().toISOString();
    const rows = QUOTES.filter((q) => payload.rates?.[q] != null).map((quote) => ({
      base_ccy: "GBP",
      quote_ccy: quote,
      rate: payload.rates![quote],
      as_of: asOf,
    }));

    for (const row of rows) {
      const today = asOf.slice(0, 10);
      const { data: existing } = await supabaseAdmin
        .from("fx_rates")
        .select("id")
        .eq("base_ccy", row.base_ccy)
        .eq("quote_ccy", row.quote_ccy)
        .gte("as_of", `${today}T00:00:00Z`)
        .lte("as_of", `${today}T23:59:59Z`)
        .maybeSingle();

      if (existing) {
        await (supabaseAdmin as any)
          .from("fx_rates")
          .update({ rate: row.rate, as_of: row.as_of })
          .eq("id", existing.id);
      } else {
        await (supabaseAdmin as any).from("fx_rates").insert(row);
      }
    }

    return { updated: rows.length, as_of: asOf };
  });
