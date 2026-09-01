/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Writing the securities side of a broker export.
 *
 * The cash rows go where every other statement's rows go. What arrives here is
 * the other half: the orders. Each becomes a trade against a holding, and the
 * holding's quantity, average cost and realised profit fall out of those trades
 * in the database rather than being written from the file — one place decides
 * what a position is, whether the trade came from an import or from someone
 * typing it in.
 *
 * Two rules keep this honest.
 *
 * A re-import must not double a position. Trading 212 gives every order a
 * reference of its own, so the second reading of the same file recognises every
 * order it already holds and inserts nothing.
 *
 * A cost basis that is not in the file is never invented. Where an export sells
 * shares it never bought, the missing quantity is recorded against the holding
 * with a null cost, which the portfolio reads as unknown. That shortfall is
 * recomputed from the household's whole trade history on every import, so
 * uploading the earlier export later fills the gap and the position becomes
 * fully costed without anyone intervening.
 */
import {
  brokerLabel,
  formatShares,
  openingPosition,
  type BrokerLedger,
  type BrokerTrade,
  type PartialPosition,
  type TradeLike,
} from "./broker";

type Client = any;

export type BrokerImportResult = {
  tradesInserted: number;
  tradesHeld: number;
  holdingsTouched: number;
  notes: string[];
};

type HoldingRow = {
  id: string;
  ticker: string;
  account_id: string | null;
  name: string | null;
  exchange: string | null;
  security_type: string;
  currency: string;
  opened_at: string | null;
  opening_quantity: number | null;
  opening_cost: number | null;
  position_evidence: { as_of?: string; shares?: number } | null;
  discovered_from: string | null;
};

type ExistingTrade = {
  id: string;
  holding_id: string;
  external_ref: string | null;
  side: string;
  trade_date: string;
  quantity: number;
  price: number;
};

/**
 * A single name a broker prints in the file, and everything that name needs to
 * become a holding: the trades against it, and any evidence of shares held
 * before those trades begin.
 */
type Instrument = {
  ticker: string;
  brokerTicker: string;
  trades: BrokerTrade[];
  partial: PartialPosition | null;
};

/**
 * An ETF is the diversified core the policy describes; a single name is not,
 * whatever its size. Landing single names in the satellite sleeve is the
 * conservative reading — it counts them against the speculative cap and asks
 * the household to re-sleeve deliberately rather than quietly treating a
 * concentrated position as core.
 */
function sleeveFor(securityType: string): string {
  return securityType === "etf" ? "core" : "satellite";
}

function tradeKey(trade: { side: string; trade_date: string; quantity: number; price: number }) {
  return [
    trade.side,
    trade.trade_date,
    Number(trade.quantity).toFixed(6),
    Number(trade.price).toFixed(6),
  ].join("|");
}

function group(ledger: BrokerLedger): Instrument[] {
  const instruments = new Map<string, Instrument>();

  const ensure = (ticker: string, brokerTicker: string): Instrument => {
    const held = instruments.get(ticker);
    if (held) return held;
    const created: Instrument = { ticker, brokerTicker, trades: [], partial: null };
    instruments.set(ticker, created);
    return created;
  };

  for (const trade of ledger.trades) {
    ensure(trade.ticker, trade.brokerTicker).trades.push(trade);
  }
  for (const partial of ledger.partial) {
    ensure(partial.ticker, partial.brokerTicker).partial = partial;
  }

  return Array.from(instruments.values());
}

export async function importBrokerLedger(
  supabase: Client,
  input: {
    householdId: string;
    accountId: string;
    ledger: BrokerLedger;
  },
): Promise<BrokerImportResult> {
  const { householdId, accountId, ledger } = input;
  const instruments = group(ledger);
  const notes: string[] = [];

  if (!instruments.length) {
    return { tradesInserted: 0, tradesHeld: 0, holdingsTouched: 0, notes };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("owner_profile_id")
    .eq("id", accountId)
    .maybeSingle();
  const ownerProfileId = (account?.owner_profile_id as string | null) ?? null;

  /* ------------------------------------------------------------- holdings */
  const tickers = instruments.map((instrument) => instrument.ticker);
  const { data: heldRows } = await supabase
    .from("holdings")
    .select(
      "id, ticker, account_id, name, exchange, security_type, currency, opened_at, opening_quantity, opening_cost, position_evidence, discovered_from",
    )
    .eq("household_id", householdId)
    .in("ticker", tickers);

  const held = (heldRows ?? []) as HoldingRow[];
  const byTicker = new Map<string, HoldingRow>();
  for (const row of held) {
    const key = row.ticker.toUpperCase();
    const existing = byTicker.get(key);
    // A holding already filed against this account wins over the same ticker
    // held loose or in another account, so an import never splits a position.
    if (!existing || (existing.account_id !== accountId && row.account_id === accountId)) {
      byTicker.set(key, row);
    }
  }

  const holdingIdByTicker = new Map<string, string>();
  let holdingsTouched = 0;

  for (const instrument of instruments) {
    const key = instrument.ticker.toUpperCase();
    const buys = instrument.trades.filter((trade) => trade.side === "buy");
    const first = instrument.trades.reduce<BrokerTrade | null>(
      (earliest, trade) =>
        !earliest || trade.tradeDate < earliest.tradeDate ? trade : earliest,
      null,
    );
    const currency = (buys[0] ?? instrument.trades[0])?.currency ?? ledger.accountCurrency;
    const securityType = instrument.trades[0]?.securityType ?? "stock";
    const name = instrument.trades.find((trade) => trade.name)?.name ?? null;
    const exchange = instrument.ticker.endsWith(".L") ? "LSE" : null;

    const existing = byTicker.get(key);
    if (existing) {
      holdingIdByTicker.set(key, existing.id);
      const patch: Record<string, unknown> = {};
      if (!existing.name && name) patch["name"] = name;
      if (!existing.exchange && exchange) patch["exchange"] = exchange;
      if (!existing.account_id) patch["account_id"] = accountId;
      if (!existing.opened_at && first) patch["opened_at"] = first.tradeDate;

      if (Object.keys(patch).length) {
        await supabase.from("holdings").update(patch).eq("id", existing.id);
      }
      holdingsTouched += 1;
      continue;
    }

    const { data: created, error } = await supabase
      .from("holdings")
      .insert({
        household_id: householdId,
        account_id: accountId,
        owner_profile_id: ownerProfileId,
        ticker: instrument.ticker,
        exchange,
        name,
        security_type: securityType,
        currency,
        quantity: 0,
        avg_cost: null,
        realised_pnl: null,
        sleeve: sleeveFor(securityType),
        opened_at: first?.tradeDate ?? instrument.partial?.firstSeen ?? null,
        discovered_from: "statement",
        notes: `Discovered in a ${brokerLabel(ledger.broker) ?? "broker"} export.`,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    holdingIdByTicker.set(key, created.id as string);
    holdingsTouched += 1;
  }

  /* --------------------------------------------------------------- trades */
  const holdingIds = Array.from(holdingIdByTicker.values());
  const { data: existingTradeRows } = await supabase
    .from("trades")
    .select("id, holding_id, external_ref, side, trade_date, quantity, price")
    .in("holding_id", holdingIds);

  const existingTrades = (existingTradeRows ?? []) as ExistingTrade[];
  const knownRefs = new Set(
    existingTrades.map((trade) => trade.external_ref).filter((ref): ref is string => !!ref),
  );
  const knownShapes = new Set(
    existingTrades.map((trade) => `${trade.holding_id}|${tradeKey(trade)}`),
  );

  const payload: Array<Record<string, unknown>> = [];
  let tradesHeld = 0;

  for (const instrument of instruments) {
    const holdingId = holdingIdByTicker.get(instrument.ticker.toUpperCase())!;
    for (const trade of instrument.trades) {
      const shape = `${holdingId}|${tradeKey({
        side: trade.side,
        trade_date: trade.tradeDate,
        quantity: trade.quantity,
        price: trade.price,
      })}`;

      if ((trade.externalRef && knownRefs.has(trade.externalRef)) || knownShapes.has(shape)) {
        tradesHeld += 1;
        continue;
      }
      if (trade.externalRef) knownRefs.add(trade.externalRef);
      knownShapes.add(shape);

      payload.push({
        household_id: householdId,
        holding_id: holdingId,
        account_id: accountId,
        external_ref: trade.externalRef,
        side: trade.side,
        trade_date: trade.tradeDate,
        quantity: trade.quantity,
        price: trade.price,
        fees: trade.fees,
        currency: trade.currency,
        notes: null,
      });
    }
  }

  let tradesInserted = 0;
  for (let start = 0; start < payload.length; start += 200) {
    const batch = payload.slice(start, start + 200);
    const { data: inserted, error } = await supabase.from("trades").insert(batch).select("id");
    if (error) throw new Error(error.message);
    tradesInserted += (inserted ?? []).length;
  }

  /* ------------------------------------------- what the file cannot explain */
  const unknownBasis: string[] = [];
  const resolved: string[] = [];

  for (const instrument of instruments) {
    const holdingId = holdingIdByTicker.get(instrument.ticker.toUpperCase())!;
    const existing = byTicker.get(instrument.ticker.toUpperCase());

    const { data: tradeRows } = await supabase
      .from("trades")
      .select("side, trade_date, quantity")
      .eq("holding_id", holdingId)
      .order("trade_date", { ascending: true });

    const trades = ((tradeRows ?? []) as Array<{
      side: string;
      trade_date: string;
      quantity: number;
    }>).map<TradeLike>((row) => ({
      side: row.side === "sell" ? "sell" : "buy",
      trade_date: row.trade_date,
      quantity: Number(row.quantity),
    }));

    // Evidence already on the holding is kept: it came from a file that may not
    // be part of this import, and losing it would erase a position.
    const storedEvidence = existing?.position_evidence;
    const fileEvidence = instrument.partial?.heldEvidence ?? null;
    const evidence =
      fileEvidence &&
      (!storedEvidence?.shares || fileEvidence.shares >= Number(storedEvidence.shares))
        ? fileEvidence
        : storedEvidence?.shares && storedEvidence.as_of
          ? { asOf: String(storedEvidence.as_of), shares: Number(storedEvidence.shares) }
          : null;

    const opening = openingPosition(trades, evidence);
    const hadOpening = Number(existing?.opening_quantity ?? 0) > 0;

    await supabase
      .from("holdings")
      .update({
        opening_quantity: opening.quantity,
        // The cost of shares bought before the export starts is not in any file
        // the household has given us. Null is the only true answer.
        opening_cost: opening.quantity > 0 ? (existing?.opening_cost ?? null) : null,
        position_evidence: evidence
          ? { as_of: evidence.asOf, shares: evidence.shares, source: ledger.broker }
          : null,
      })
      .eq("id", holdingId);

    await supabase.rpc("recalc_holding", { target: holdingId });

    if (opening.quantity > 0) {
      unknownBasis.push(`${instrument.brokerTicker} (${formatShares(opening.quantity)} shares)`);
    } else if (hadOpening) {
      resolved.push(instrument.brokerTicker);
    }
  }

  /* ---------------------------------------------------------------- notes */
  const label = brokerLabel(ledger.broker) ?? "the broker";
  if (tradesInserted) {
    notes.push(
      `${tradesInserted === 1 ? "One order" : `${tradesInserted} orders`} from ${label} ${tradesInserted === 1 ? "was" : "were"} recorded against ${holdingsTouched === 1 ? "one holding" : `${holdingsTouched} holdings`}, and the cash side stays on the account.`,
    );
  } else if (tradesHeld) {
    notes.push(`Every order in this export was already recorded — nothing was doubled.`);
  }
  if (unknownBasis.length) {
    notes.push(
      `Cost basis unknown for ${unknownBasis.join(", ")} — this export begins after those shares were bought. Upload the earlier export and the gap closes on its own.`,
    );
  }
  if (resolved.length) {
    notes.push(
      `The missing purchases behind ${resolved.join(", ")} are now accounted for, so ${resolved.length === 1 ? "that position has" : "those positions have"} a full cost basis.`,
    );
  }

  return { tradesInserted, tradesHeld, holdingsTouched, notes };
}
