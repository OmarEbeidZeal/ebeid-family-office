/**
 * What a broker's activity ledger carries, as distinct from a bank statement.
 *
 * A bank statement is a list of money movements. A broker export is two things
 * at once: the cash side (deposits, dividends, the money paid for shares) and
 * the securities side (what was bought, at what price, in which currency).
 * Filing the securities side as spending is how a £1,300 purchase of Microsoft
 * ends up in a household's monthly outgoings, so the two are separated here and
 * written to different places — cash to `transactions`, trades to `trades`.
 *
 * Shared by the reader, the importer and the import screen, so it holds no
 * server-only code.
 */

export type BrokerKey = "trading212";

export const BROKER_LABELS: Record<BrokerKey, string> = {
  trading212: "Trading 212",
};

/** One executed order, in the instrument's own currency. */
export type BrokerTrade = {
  /** The broker's own order reference — the exact answer to "have we got this?" */
  externalRef: string | null;
  /** The symbol to price against, e.g. `VUSA.L` for a London listing. */
  ticker: string;
  /** The symbol exactly as the broker printed it. */
  brokerTicker: string;
  isin: string | null;
  name: string | null;
  securityType: "stock" | "etf";
  side: "buy" | "sell";
  tradeDate: string;
  quantity: number;
  /** Per share, in `currency` — pence normalised to pounds. */
  price: number;
  currency: string;
  /** Commission and FX charges, converted into `currency`. */
  fees: number;
  /** The cash leg, in the account's currency. */
  cashAmount: number;
  /** The broker's own realised figure on a sale, in the account's currency. */
  result: number | null;
};

/**
 * A position the ledger touches but never opens — sold, or paid a dividend on,
 * before its first purchase appears. The export starts after the account did,
 * so this holding's cost basis is not in the file and must not be implied.
 *
 * A shortfall is a statement about one file, not about the account: the earlier
 * export that holds the missing purchase may arrive next week. The importer
 * therefore re-tests every shortfall against the whole trade history it holds,
 * and clears the ones later filled in.
 */
export type PartialPosition = {
  ticker: string;
  brokerTicker: string;
  /** Shares the ledger disposes of, or reports held, beyond what it buys. */
  shortfall: number;
  /** The first date the ledger showed those shares already existing. */
  firstSeen: string;
  /**
   * A dividend naming a position the file's own purchases do not explain. It
   * is the only evidence a holding exists at all when the ledger never trades
   * it, so it is carried to the importer and kept against the holding.
   */
  heldEvidence: { asOf: string; shares: number } | null;
};


export type BrokerLedger = {
  broker: BrokerKey;
  /** The currency the broker settles in — every cash figure is in this. */
  accountCurrency: string;
  trades: BrokerTrade[];
  partial: PartialPosition[];
  /** Actions the reader did not recognise, by name, so nothing is invented. */
  unknownActions: string[];
};

export function brokerLabel(broker: string | null | undefined): string | null {
  if (!broker) return null;
  return BROKER_LABELS[broker as BrokerKey] ?? null;
}

/** Quantities read better trimmed: 3.6658626400 → 3.6659, 12.0000 → 12. */
export function formatShares(quantity: number): string {
  return String(Number(quantity.toFixed(4)));
}

/* ------------------------------------------------- the opening position */

export type TradeLike = {
  side: "buy" | "sell";
  trade_date: string;
  quantity: number;
};

export type HeldEvidence = { asOf: string; shares: number } | null;

/**
 * How many shares must have existed before the recorded trades begin.
 *
 * Two things reveal them. A sale larger than everything bought so far: those
 * shares came from somewhere. And a dividend naming a position bigger than the
 * trades explain — the only trace of a holding an export never trades at all.
 *
 * Deliberately computed against the household's whole trade history rather than
 * one file, so the answer corrects itself: import the earlier export holding the
 * missing purchase and the shortfall resolves to nothing, cost basis included.
 * Evidence on the same day is applied after that day's trades, because a
 * dividend is paid on the position at its ex-date, which same-day buying has
 * already moved past.
 */
export function openingPosition(
  trades: TradeLike[],
  evidence: HeldEvidence,
): { quantity: number; asOf: string | null } {
  type Event =
    | { date: string; order: number; kind: "trade"; trade: TradeLike }
    | { date: string; order: number; kind: "evidence"; shares: number };

  const events: Event[] = trades
    .slice()
    .sort((left, right) => left.trade_date.localeCompare(right.trade_date))
    .map((trade, index) => ({ date: trade.trade_date, order: index, kind: "trade", trade }));

  if (evidence && evidence.shares > 0) {
    events.push({
      date: evidence.asOf,
      order: Number.MAX_SAFE_INTEGER,
      kind: "evidence",
      shares: evidence.shares,
    });
  }

  events.sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order);

  let running = 0;
  let deficit = 0;
  let asOf: string | null = null;

  const short = (amount: number, date: string) => {
    deficit += amount;
    running += amount;
    if (!asOf) asOf = date;
  };

  for (const event of events) {
    if (event.kind === "evidence") {
      if (event.shares > running + 1e-6) short(event.shares - running, event.date);
      continue;
    }
    const { trade } = event;
    if (trade.side === "buy") {
      running += Number(trade.quantity);
      continue;
    }
    const quantity = Number(trade.quantity);
    if (quantity > running + 1e-6) short(quantity - running, trade.trade_date);
    running -= quantity;
  }

  return { quantity: Number(deficit.toFixed(6)), asOf: deficit > 0 ? asOf : null };
}

