/**
 * Trading 212's activity export, read by code alone.
 *
 * The file is a ledger of actions rather than a list of money movements: a row
 * says "Market buy", names an instrument, and prints the price in the
 * instrument's currency while settling the cash in the account's. Read as a
 * bank statement it produces nonsense — eighteen large "payments" to nobody and
 * an empty portfolio. Read properly it produces both halves: the cash side,
 * which belongs on the account, and the trades, which are the household's cost
 * basis.
 *
 * Three things in the file need care.
 *
 * London listings are priced in pence: 4,386 GBX is £43.86, and a holding
 * carrying a price a hundred times too large would misstate the portfolio by
 * two orders of magnitude. Pence are normalised to pounds here, once.
 *
 * The exchange rate column changes direction by row type — a trade prints
 * instrument-per-pound, a dividend prints pound-per-instrument. Rather than
 * guess, the rate implied by the row's own arithmetic is used and the printed
 * rate becomes a cross-check.
 *
 * An export covering a date range rather than the account's whole life sells
 * shares it never shows being bought. That is not an error to swallow: the
 * position's cost basis is genuinely absent, and the holding must say so.
 */
import { EMPTY_IDENTITY, type ExtractionResult } from "../statement-extract.server";
import type { RawTransaction } from "../statement-parse.server";
import { StatementFailure } from "./failure";
import { formatShares, type BrokerLedger, type BrokerTrade, type PartialPosition } from "./broker";
import { normaliseHeader } from "./providers";

const HEADER_SEARCH_ROWS = 25;

/* ----------------------------------------------------------------- cells */

function num(value: string | undefined): number | null {
  const cleaned = (value ?? "").replace(/[\s,]/g, "").replace(/^\+/, "");
  if (!cleaned || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

function isoDate(value: string | undefined): string | null {
  const raw = text(value);
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (direct) return direct[1]!;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Pence listings, kept apart from pounds before anything upper-cases them:
 * "GBp" and "GBP" differ by one letter's case and by a factor of a hundred.
 */
function normalisePence(price: number | null, rawCurrency: string): {
  price: number | null;
  currency: string;
  converted: boolean;
} {
  const code = rawCurrency.trim();
  const pence = code === "GBX" || code === "GBx" || code === "GBp";
  if (!pence) return { price, currency: code.toUpperCase(), converted: false };
  return {
    price: price === null ? null : price / 100,
    currency: "GBP",
    converted: price !== null,
  };
}

/* --------------------------------------------------------------- columns */

type Columns = {
  action: number;
  time: number;
  isin: number;
  ticker: number;
  name: number;
  reference: number;
  shares: number;
  price: number;
  priceCurrency: number;
  rate: number;
  result: number;
  total: number;
  totalCurrency: number;
  withholding: number;
  withholdingCurrency: number;
  /** Every commission, duty or charge column, each settled in the account's currency. */
  fees: number[];
};

/** "Currency (Total)" labels another column's currency; "Total" holds a figure. */
function isCurrencyLabel(raw: string): boolean {
  return /^\s*currency\s*\(/i.test(raw);
}

function findColumn(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const exact = headers.indexOf(name);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const prefixed = headers.findIndex((header) => header.startsWith(name));
    if (prefixed >= 0) return prefixed;
  }
  return -1;
}

/** The currency column that labels the column at `index`, if the file has one. */
function pairedCurrency(raw: string[], headers: string[], index: number): number {
  if (index < 0) return -1;
  const label = normaliseHeader(`currency(${raw[index] ?? ""})`);
  const found = headers.indexOf(label);
  if (found >= 0) return found;
  // Some exports print the currency immediately to the right without repeating
  // the column's name inside the brackets.
  const next = index + 1;
  return isCurrencyLabel(raw[next] ?? "") ? next : -1;
}

function readColumns(raw: string[]): Columns {
  const headers = raw.map(normaliseHeader);
  const total = findColumn(headers, "total", "totalamount");
  const price = findColumn(headers, "priceshare", "price");
  const withholding = findColumn(headers, "withholdingtax");

  const fees: number[] = [];
  headers.forEach((header, index) => {
    if (isCurrencyLabel(raw[index] ?? "")) return;
    if (index === withholding) return;
    if (!/(fee|tax|duty|charge|commission)/.test(header)) return;
    fees.push(index);
  });

  return {
    action: findColumn(headers, "action"),
    time: findColumn(headers, "timeutc", "time", "date"),
    isin: findColumn(headers, "isin"),
    ticker: findColumn(headers, "ticker", "symbol"),
    name: findColumn(headers, "name", "instrument"),
    reference: findColumn(headers, "id", "orderid"),
    shares: findColumn(headers, "noofshares", "shares", "quantity"),
    price,
    priceCurrency: pairedCurrency(raw, headers, price),
    rate: findColumn(headers, "exchangerate"),
    result: findColumn(headers, "result"),
    total,
    totalCurrency: pairedCurrency(raw, headers, total),
    withholding,
    withholdingCurrency: pairedCurrency(raw, headers, withholding),
    fees,
  };
}

/* --------------------------------------------------------------- actions */

type Kind =
  | "buy"
  | "sell"
  | "deposit"
  | "withdrawal"
  | "dividend"
  | "interest"
  | "charge"
  | "spending"
  | "unknown";

function classify(action: string): Kind {
  const value = action.toLowerCase();
  if (/\bsell\b/.test(value)) return "sell";
  if (/\bbuy\b/.test(value)) return "buy";
  if (/^deposit|^card credit|^funds in/.test(value)) return "deposit";
  if (/^withdraw|^funds out/.test(value)) return "withdrawal";
  if (/^dividend|^div\b/.test(value)) return "dividend";
  if (/interest/.test(value)) return "interest";
  if (/^spending|^card debit/.test(value)) return "spending";
  if (/fee|charge|tax|conversion/.test(value)) return "charge";
  return "unknown";
}

/** Cash that never leaves the household: funding the account, and buying shares. */
const INTERNAL: Kind[] = ["buy", "sell", "deposit", "withdrawal"];

const CREDIT: Kind[] = ["sell", "deposit", "dividend", "interest"];

/* ---------------------------------------------------------------- symbols */

const ETF_WORDS = /\b(etf|ucits|index|msci|s&p|ftse|acc|dist|core|tracker|bond)\b/i;

/**
 * The symbol the price provider needs. Trading 212 prints the London ticker
 * bare — `VUSA`, not `VUSA.L` — which returns no quote at all, so a listing
 * settled in sterling is given its exchange suffix.
 */
export function resolveBrokerSymbol(
  brokerTicker: string,
  currency: string,
): { ticker: string; exchange: string | null } {
  const bare = brokerTicker.trim().toUpperCase();
  if (!bare) return { ticker: bare, exchange: null };
  if (bare.includes(".")) return { ticker: bare, exchange: null };
  if (currency === "GBP") return { ticker: `${bare}.L`, exchange: "LSE" };
  return { ticker: bare, exchange: null };
}

function securityType(isin: string | null, name: string | null): "stock" | "etf" {
  if (isin && /^(IE|LU)/.test(isin)) return "etf";
  if (name && ETF_WORDS.test(name)) return "etf";
  return "stock";
}

/* ------------------------------------------------------------- the reader */

type Parsed = {
  kind: Kind;
  date: string;
  action: string;
  total: number;
  reference: string | null;
  trade: BrokerTrade | null;
  /** For a dividend: the position it was paid on, and the shares it names. */
  position: { ticker: string; brokerTicker: string; shares: number } | null;
  description: string;
  merchant: string | null;
};

export function looksLikeTrading212(rows: string[][]): boolean {
  return headerRowIndex(rows) >= 0;
}

function headerRowIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let index = 0; index < limit; index += 1) {
    const headers = (rows[index] ?? []).map(normaliseHeader);
    if (headers.includes("action") && headers.some((header) => header.startsWith("noofshares"))) {
      return index;
    }
  }
  return -1;
}

/**
 * Which Trading 212 wrapper this export came from.
 *
 * The wrapper matters more than any other field on the file: an ISA's gains are
 * outside capital gains tax and its contributions count against the £20,000
 * allowance, while an Invest account's do neither. Trading 212's export does not
 * print it in the rows, so the file's own name is read — and when the name says
 * nothing, the account type is left for the household to state rather than
 * guessed at, because guessing "general investment account" at an ISA would put
 * every disposal into a CGT calculation it does not belong in.
 */
export function trading212Wrapper(fileName: string | null | undefined): "isa" | "gia" | null {
  const name = (fileName ?? "").toLowerCase();
  if (/\bisa\b/.test(name) || name.includes("stocksandshares")) return "isa";
  if (/\binvest\b/.test(name)) return "gia";
  return null;
}

export function parseTrading212(rows: string[][], fileName: string | null = null): ExtractionResult {
  const headerIndex = headerRowIndex(rows);
  if (headerIndex < 0) {
    throw new StatementFailure(
      "This does not read as a Trading 212 activity export. In the app, choose History, then Export, and keep every column the export offers.",
    );
  }

  const raw = rows[headerIndex]!;
  const columns = readColumns(raw);
  if (columns.action < 0 || columns.time < 0 || columns.total < 0) {
    throw new StatementFailure(
      "This Trading 212 export is missing the Action, Time or Total column, so its rows cannot be read. Export it again with every column selected.",
    );
  }

  const body = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => text(cell).length > 0));

  const accountCurrency = modal(body, columns.totalCurrency) ?? "GBP";
  const notes: string[] = [];
  const unknownActions = new Set<string>();
  const rateDoubts: string[] = [];
  let convertedPence = false;
  let skippedRows = 0;

  const parsedRows: Parsed[] = [];

  for (const row of body) {
    const action = text(row[columns.action]);
    const date = isoDate(row[columns.time]);
    const total = num(row[columns.total]);
    if (!action || !date) {
      skippedRows += 1;
      continue;
    }

    const kind = classify(action);
    if (kind === "unknown") {
      unknownActions.add(action);
      skippedRows += 1;
      continue;
    }
    if (total === null) {
      skippedRows += 1;
      continue;
    }

    const cash = Math.abs(total);
    const reference = text(row[columns.reference]) || null;
    const brokerTicker = text(row[columns.ticker]).toUpperCase();
    const isin = text(row[columns.isin]).toUpperCase() || null;
    const name = text(row[columns.name]) || null;
    const shares = num(row[columns.shares]);

    const quoted = normalisePence(num(row[columns.price]), text(row[columns.priceCurrency]));
    const price = quoted.price;
    const priceCurrency = quoted.currency || accountCurrency;
    if (quoted.converted) convertedPence = true;

    const fees = columns.fees.reduce((sum, index) => sum + (num(row[index]) ?? 0), 0);

    /* ------------------------------------------------------------ trades */
    if (kind === "buy" || kind === "sell") {
      if (!brokerTicker || shares === null || shares <= 0 || price === null || price <= 0) {
        skippedRows += 1;
        continue;
      }

      const side = kind === "buy" ? "buy" : "sell";
      const valueNative = shares * price;
      // The cash before charges is what the instrument's value converts into,
      // so the rate the row actually used falls straight out of its own figures.
      const cashBeforeFees = side === "buy" ? cash - fees : cash + fees;
      const implied = cashBeforeFees > 0 ? valueNative / cashBeforeFees : null;
      const rate = reconcileRate(implied, num(row[columns.rate]), priceCurrency === accountCurrency);
      if (rate.doubtful) rateDoubts.push(brokerTicker);

      const resolved = resolveBrokerSymbol(brokerTicker, priceCurrency);
      const result = num(row[columns.result]);

      parsedRows.push({
        kind,
        date,
        action,
        total: cash,
        reference,
        position: null,
        merchant: name,
        description: `${side === "buy" ? "Bought" : "Sold"} ${formatShares(shares)} ${brokerTicker} at ${price.toFixed(price < 10 ? 4 : 2)} ${priceCurrency}`,
        trade: {
          externalRef: reference,
          ticker: resolved.ticker,
          brokerTicker,
          isin,
          name,
          securityType: securityType(isin, name),
          side,
          tradeDate: date,
          quantity: shares,
          price,
          currency: priceCurrency,
          fees: Number((fees * rate.value).toFixed(6)),
          cashAmount: cash,
          result: side === "sell" ? result : null,
        },
      });
      continue;
    }

    /* --------------------------------------------------------- cash rows */
    let description = action;
    let merchant: string | null = null;
    let position: Parsed["position"] = null;

    if (kind === "dividend") {
      const label = name ?? brokerTicker;
      description = label
        ? `Dividend — ${label}${brokerTicker && name ? ` (${brokerTicker})` : ""}`
        : "Dividend";
      const withheld = num(row[columns.withholding]);
      const withheldCurrency = text(row[columns.withholdingCurrency]).toUpperCase();
      if (withheld !== null && Math.abs(withheld) >= 0.005) {
        description += ` · ${Math.abs(withheld).toFixed(2)} ${withheldCurrency || accountCurrency} withheld`;
      }
      merchant = label || null;
      if (brokerTicker && shares !== null && shares > 0) {
        position = {
          ticker: resolveBrokerSymbol(brokerTicker, priceCurrency).ticker,
          brokerTicker,
          shares,
        };
      }

    } else if (kind === "deposit") {
      description = "Deposit";
    } else if (kind === "withdrawal") {
      description = "Withdrawal";
    }

    parsedRows.push({
      kind,
      date,
      action,
      total: cash,
      reference,
      trade: null,
      position,
      description,
      merchant,
    });
  }

  if (!parsedRows.length) {
    throw new StatementFailure(
      "No rows in this Trading 212 export could be read. Export the full activity history from History → Export, with every column selected.",
    );
  }

  /* --------------------------------------------------------- cash and order */
  parsedRows.sort((left, right) => left.date.localeCompare(right.date));

  const transactions: RawTransaction[] = parsedRows.map((row) => ({
    booked_date: row.date,
    description: row.description.slice(0, 300),
    raw_description: row.action,
    merchant: row.merchant,
    amount: Number(row.total.toFixed(2)),
    direction: CREDIT.includes(row.kind) ? "credit" : "debit",
    balance_after: null,
    currency: accountCurrency,
    bank_reference: row.reference,
    // Funding the account, and turning that cash into shares, are movements
    // inside the household's own money rather than spending.
    internal: INTERNAL.includes(row.kind),
  }));

  const trades = parsedRows
    .map((row) => row.trade)
    .filter((trade): trade is BrokerTrade => trade !== null);

  const partial = findPartialPositions(parsedRows);

  /* -------------------------------------------------------------- notes */
  const buys = trades.filter((trade) => trade.side === "buy").length;
  const sells = trades.length - buys;
  notes.push(
    `Read as a Trading 212 activity ledger — ${plural(buys, "purchase")}, ${plural(sells, "sale")} and ${plural(transactions.length, "cash movement")}.`,
  );
  if (convertedPence) {
    notes.push("London prices quoted in pence were converted to pounds.");
  }
  if (rateDoubts.length) {
    const names = Array.from(new Set(rateDoubts)).slice(0, 4).join(", ");
    notes.push(
      `The exchange rate printed against ${names} does not reconcile with the row's own total, so the rate the row implies was used instead.`,
    );
  }
  if (unknownActions.size) {
    notes.push(
      `${unknownActions.size === 1 ? "One row type was" : `${unknownActions.size} row types were`} not recognised and left out: ${Array.from(unknownActions).slice(0, 5).join(", ")}.`,
    );
  }
  for (const position of partial) {
    notes.push(
      `${position.brokerTicker}: this export accounts for ${formatShares(position.shortfall)} shares it never shows being bought, so it begins after that position was opened and its cost basis is not in the file.`,
    );
  }

  if (!trading212Wrapper(fileName)) {
    notes.push(
      "This export does not say whether it came from the Stocks and Shares ISA or the Invest account. Set the account type when you confirm it — an ISA's gains are outside capital gains tax and an Invest account's are not.",
    );
  }

  const ledger: BrokerLedger = {
    broker: "trading212",
    accountCurrency,
    trades,
    partial,
    unknownActions: Array.from(unknownActions),
  };

  return {
    transactions,
    skippedRows,
    notes,
    format: "csv",
    exactBalances: false,
    accountDetectable: false,
    broker: ledger,
    meta: {
      period_start: parsedRows[0]!.date,
      period_end: parsedRows[parsedRows.length - 1]!.date,
      // A broker ledger states no balance: the cash figure depends on history
      // the export may not cover, and the securities are valued at market.
      opening_balance: null,
      closing_balance: null,
      currency: accountCurrency,
      identity: {
        ...EMPTY_IDENTITY,
        institution: "Trading 212",
        // Named by the file where the file names it. Where it does not, the
        // general investment account is offered and the note below asks for the
        // wrapper, because an ISA filed as a GIA would put every disposal into a
        // capital gains calculation it does not belong in.
        account_type: trading212Wrapper(fileName) ?? "investment",
        country: "GB",
      },
    },
  };
}

/* --------------------------------------------------------------- helpers */

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function modal(rows: string[][], index: number): string | null {
  if (index < 0) return null;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const cell = text(row[index]).toUpperCase();
    if (!/^[A-Z]{3}$/.test(cell)) continue;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The row's own arithmetic against the rate it prints. Trading 212 prints the
 * rate one way up on a trade and the other way up on a dividend, so agreement
 * within a percent either way is treated as confirmation, and anything else is
 * reported rather than silently trusted.
 */
function reconcileRate(
  implied: number | null,
  stated: number | null,
  sameCurrency: boolean,
): { value: number; doubtful: boolean } {
  if (sameCurrency) return { value: 1, doubtful: false };
  if (implied === null || !Number.isFinite(implied) || implied <= 0) {
    if (stated && stated > 0) return { value: stated, doubtful: true };
    return { value: 1, doubtful: true };
  }
  if (!stated || stated <= 0) return { value: implied, doubtful: false };

  const candidates = [stated, 1 / stated];
  const closest = candidates.reduce((best, candidate) =>
    Math.abs(candidate - implied) < Math.abs(best - implied) ? candidate : best,
  );
  return { value: implied, doubtful: Math.abs(closest - implied) / implied > 0.01 };
}

/**
 * Positions the ledger disposes of, or pays a dividend on, before it ever buys
 * them: their cost basis is genuinely missing rather than merely unread.
 */
function findPartialPositions(rows: Parsed[]): PartialPosition[] {
  const held = new Map<string, number>();
  const found = new Map<string, PartialPosition>();

  const record = (
    ticker: string,
    brokerTicker: string,
    date: string,
    short: number,
    evidence: { asOf: string; shares: number } | null,
  ) => {
    const existing = found.get(ticker);
    if (existing) {
      // The same missing shares can show up twice — once in a dividend, once in
      // the sale that follows — so the largest shortfall is the count, not the
      // sum of every sighting of it.
      existing.shortfall = Math.max(existing.shortfall, Number(short.toFixed(6)));
      if (evidence && (!existing.heldEvidence || evidence.shares > existing.heldEvidence.shares)) {
        existing.heldEvidence = evidence;
      }
      return;
    }

    found.set(ticker, {
      ticker,
      brokerTicker,
      shortfall: Number(short.toFixed(6)),
      firstSeen: date,
      heldEvidence: evidence,
    });
  };

  for (const row of rows) {
    const trade = row.trade;
    if (trade) {
      const running = held.get(trade.ticker) ?? 0;
      if (trade.side === "buy") {
        held.set(trade.ticker, running + trade.quantity);
        continue;
      }
      const short = trade.quantity - running;
      if (short > 1e-6) {
        record(trade.ticker, trade.brokerTicker, row.date, short, null);
        held.set(trade.ticker, 0);
      } else {
        held.set(trade.ticker, running - trade.quantity);
      }
      continue;
    }

    // A dividend names the position it was paid on, which is the other way a
    // ledger reveals shares it never shows arriving. Once counted, those shares
    // are known to be held, so the sale that follows is not reported twice.
    const position = row.position;
    if (!position) continue;
    const running = held.get(position.ticker) ?? 0;
    const short = position.shares - running;
    if (short > 1e-6) {
      record(position.ticker, position.brokerTicker, row.date, short, {
        asOf: row.date,
        shares: Number(position.shares.toFixed(6)),
      });
      held.set(position.ticker, position.shares);
    }
  }



  return Array.from(found.values()).sort((left, right) => left.ticker.localeCompare(right.ticker));
}
