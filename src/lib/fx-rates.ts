/**
 * Turning stored `fx_rates` rows into a converter.
 *
 * Pure, and shared by the screens, the advisor and the scheduled jobs, so a
 * figure converted on the dashboard is the same figure the briefing reasons
 * about. An unknown pair converts to itself rather than being estimated.
 */
export type FxRateRow = { base_ccy: string; quote_ccy: string; rate: number | string };

export type ToBase = (amount: number, currency: string) => number;

/** Newest-first rows in, `{ GBP: 1, USD: 1.27, … }` out. */
export function ratesFromRows(rows: FxRateRow[]): Record<string, number> {
  const map: Record<string, number> = { GBP: 1 };
  for (const row of rows) {
    if (row.base_ccy !== "GBP") continue;
    if (map[row.quote_ccy] === undefined) map[row.quote_ccy] = Number(row.rate);
  }
  return map;
}

export function makeConverter(rows: FxRateRow[], base: string): ToBase {
  const map = ratesFromRows(rows);
  return (amount: number, currency: string) => {
    if (currency === base) return amount;
    const from = map[currency];
    const to = map[base];
    if (!from || !to) return amount;
    return (amount / from) * to;
  };
}
