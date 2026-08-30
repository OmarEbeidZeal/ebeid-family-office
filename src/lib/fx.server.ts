/**
 * Exchange rates, refreshed from open.er-api.com.
 *
 * One row per pair per calendar day: the 06:00 run creates it, the 18:00 run
 * corrects it, and a manual refresh from Settings does the same thing. Nothing
 * here estimates a rate — a pair the provider does not return is simply not
 * written, and conversions fall back to the native currency.
 */
export const FX_QUOTES = ["USD", "EGP", "JOD", "EUR", "AED", "SAR", "GBP"] as const;

export type FxRefreshResult = { updated: number; as_of: string };

export async function refreshFxRatesNow(): Promise<FxRefreshResult> {
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
  const today = asOf.slice(0, 10);
  const rows = FX_QUOTES.filter((quote) => payload.rates?.[quote] != null).map((quote) => ({
    base_ccy: "GBP",
    quote_ccy: quote,
    rate: payload.rates![quote]!,
    as_of: asOf,
  }));

  for (const row of rows) {
    const { data: existing } = await supabaseAdmin
      .from("fx_rates")
      .select("id")
      .eq("base_ccy", row.base_ccy)
      .eq("quote_ccy", row.quote_ccy)
      .gte("as_of", `${today}T00:00:00Z`)
      .lte("as_of", `${today}T23:59:59Z`)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("fx_rates")
        .update({ rate: row.rate, as_of: row.as_of })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("fx_rates").insert(row);
    }
  }

  return { updated: rows.length, as_of: asOf };
}
