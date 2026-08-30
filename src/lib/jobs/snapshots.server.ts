/**
 * The nightly net-worth snapshot.
 *
 * The trend chart is only honest if it is sampled on a schedule rather than on
 * the days somebody happened to sign in. This writes one row per household per
 * UTC day from current balances, asset values and liabilities — the identical
 * arithmetic the dashboard renders — and re-running it on the same date
 * corrects that day's row instead of adding a second one.
 *
 * A household with nothing recorded is skipped. An empty balance sheet is not
 * a zero net worth, and a fabricated zero would poison the trend for good.
 */
import type { Json } from "@/integrations/supabase/types";
import { computeNetWorth } from "@/lib/networth";
import { buildPositions } from "@/lib/portfolio";
import { makeConverter } from "@/lib/fx-rates";
import { loadQuotes, type SecurityProfileRow } from "@/lib/market/service.server";
import type { QuoteResult } from "@/lib/market/shared";
import type { HoldingLike } from "@/lib/portfolio";
import type { JobOutcome } from "./runs.server";

const round = (value: number) => Number(value.toFixed(2));

type Scoped = { household_id: string };

function forHousehold<T extends Scoped>(rows: T[], householdId: string): T[] {
  return rows.filter((row) => row.household_id === householdId);
}

export async function runDailySnapshots(now = new Date()): Promise<JobOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const asOf = now.toISOString().slice(0, 10);

  const [households, accounts, assets, liabilities, income, expenses, holdings, fx] =
    await Promise.all([
      supabaseAdmin
        .from("households")
        .select("id, name, base_currency")
        .then(({ data, error }) => {
          if (error) throw new Error(`Could not read households: ${error.message}`);
          return data ?? [];
        }),
      supabaseAdmin
        .from("accounts")
        .select("household_id, account_type, currency, current_balance, is_active")
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from("assets")
        .select("household_id, asset_class, currency, current_value, ownership_pct, is_liquid")
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from("liabilities")
        .select("household_id, currency, outstanding_balance, monthly_payment")
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from("income_streams")
        .select("household_id, currency, gross_amount, net_amount, frequency")
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from("forecast_expenses")
        .select("household_id, currency, amount, frequency, confidence")
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from("holdings")
        .select(
          "id, household_id, account_id, ticker, name, security_type, sleeve, quantity, avg_cost, currency",
        )
        .then(({ data }) => data ?? []),
      supabaseAdmin
        .from("fx_rates")
        .select("base_ccy, quote_ccy, rate, as_of")
        .order("as_of", { ascending: false })
        .limit(200)
        .then(({ data }) => data ?? []),
    ]);

  if (!households.length) {
    return { status: "skipped", message: "There are no households to snapshot." };
  }

  // One batched quote call for every held ticker across every household, so a
  // nightly run costs a single trip to the provider rather than one per row.
  const tickers = Array.from(new Set(holdings.map((row) => row.ticker.toUpperCase())));
  let quotes: Record<string, QuoteResult> = {};
  let profiles: Record<string, SecurityProfileRow> = {};
  let marketNote: string | null = null;

  if (tickers.length) {
    try {
      const result = await loadQuotes(tickers, { includeProfiles: true });
      quotes = Object.fromEntries(
        result.quotes.map((quote) => [quote.ticker.toUpperCase(), quote]),
      );
      profiles = Object.fromEntries(result.profiles.map((row) => [row.ticker.toUpperCase(), row]));
      marketNote = result.message;
    } catch (error) {
      marketNote =
        error instanceof Error ? error.message : "Live prices were unavailable for this run.";
    }
  }

  const rows: Record<string, unknown>[] = [];
  const skipped: string[] = [];

  for (const household of households) {
    const base = household.base_currency || "GBP";
    const toBase = makeConverter(fx, base);

    const computed = computeNetWorth({
      accounts: forHousehold(accounts, household.id),
      assets: forHousehold(assets, household.id),
      liabilities: forHousehold(liabilities, household.id),
      income: forHousehold(income, household.id),
      expenses: forHousehold(expenses, household.id),
      toBase,
      base,
    });

    if (!computed.hasData) {
      skipped.push(household.name);
      continue;
    }

    const positions = buildPositions({
      holdings: forHousehold(holdings, household.id) as unknown as HoldingLike[],
      quotes,
      profiles,
      toBase,
    });
    const priced = positions.filter((position) => position.priced);

    rows.push({
      household_id: household.id,
      as_of: asOf,
      total_assets: round(computed.totalAssets),
      total_liabilities: round(computed.totalLiabilities),
      net_worth: round(computed.netWorth),
      liquid_net_worth: round(computed.liquidNetWorth),
      base_currency: base,
      breakdown: {
        by_class: computed.allocationByClass,
        by_currency: computed.allocationByCurrency,
        portfolio: positions.length
          ? {
              priced_value_base: round(
                priced.reduce((sum, position) => sum + (position.marketValueBase ?? 0), 0),
              ),
              priced_holdings: priced.length,
              unpriced_holdings: positions.length - priced.length,
              note: marketNote,
            }
          : null,
        source: "scheduled",
      } as unknown as Json,
    });
  }

  if (!rows.length) {
    return {
      status: "skipped",
      message:
        "Nothing was recorded: no household has an account, asset or liability to value yet.",
      detail: { as_of: asOf } as Json,
    };
  }

  const { error } = await supabaseAdmin
    .from("net_worth_snapshots")
    .upsert(rows as never, { onConflict: "household_id,as_of" });
  if (error) throw new Error(`The snapshot could not be written: ${error.message}`);

  return {
    status: skipped.length ? "partial" : "ok",
    households: rows.length,
    message: skipped.length
      ? `Snapshot written for ${rows.length} household${rows.length === 1 ? "" : "s"}; ${skipped.length} skipped for having nothing recorded.`
      : `Snapshot written for ${rows.length} household${rows.length === 1 ? "" : "s"} at ${asOf}.`,
    detail: { as_of: asOf, priced_tickers: tickers.length, market_note: marketNote } as Json,
  };
}
