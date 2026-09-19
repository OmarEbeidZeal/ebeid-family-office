/**
 * A Trading 212 CSV export: what each row does to cash, which rows are trades,
 * and which wrapper the file came from.
 *
 * Production stored all 44 rows of this export as money going out — deposits
 * and dividends included — with no trades and no holdings behind them.
 */
import { describe, expect, it } from "vitest";
import { looksLikeTrading212, parseTrading212, trading212Wrapper } from "./trading212.server";

const HEADER = [
  "Action",
  "Time",
  "ISIN",
  "Ticker",
  "Name",
  "No. of shares",
  "Price / share",
  "Currency (Price / share)",
  "Exchange rate",
  "Total",
  "Currency (Total)",
  "Currency conversion fee",
  "ID",
];

const ROWS: string[][] = [
  HEADER,
  ["Deposit", "2024-04-06 09:00:00", "", "", "", "", "", "", "", "1000.00", "GBP", "", "dep-1"],
  [
    "Market buy",
    "2024-04-08 10:15:00",
    "IE00BFY0GT14",
    "ISWD",
    "iShares Core MSCI World",
    "532.0419",
    "1.62",
    "GBP",
    "1.0",
    "861.91",
    "GBP",
    "0.15",
    "ord-1",
  ],
  [
    "Dividend (Ordinary)",
    "2024-07-01 08:00:00",
    "IE00BFY0GT14",
    "ISWD",
    "iShares Core MSCI World",
    "532.0419",
    "0.01",
    "GBP",
    "1.0",
    "5.32",
    "GBP",
    "",
    "div-1",
  ],
  ["Withdrawal", "2024-08-01 08:00:00", "", "", "", "", "", "", "", "100.00", "GBP", "", "wd-1"],
];

describe("a Trading 212 CSV export", () => {
  it("is recognised by its own columns", () => {
    expect(looksLikeTrading212(ROWS)).toBe(true);
  });

  it("sends money the way each row actually sends it", () => {
    const result = parseTrading212(ROWS);
    const by = (ref: string) => result.transactions.find((row) => row.external_ref === ref)!;

    expect(by("dep-1").direction).toBe("credit");
    expect(by("dep-1").internal).toBe(true);
    expect(by("wd-1").direction).toBe("debit");
    expect(by("wd-1").internal).toBe(true);
    expect(by("ord-1").direction).toBe("debit");
    expect(by("ord-1").internal).toBe(true);

    // A dividend is income, not an internal cash move.
    expect(by("div-1").direction).toBe("credit");
    expect(by("div-1").internal).toBe(false);
    expect(by("div-1").category_hint).toBe("Dividends");
  });

  it("records the order as a trade, with the quantity exactly as printed", () => {
    const result = parseTrading212(ROWS);
    const trades = result.broker?.trades ?? [];

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      side: "buy",
      symbol: "ISWD",
      quantity: 532.0419,
      price: 1.62,
      currency: "GBP",
      external_ref: "ord-1",
    });
    expect(trades[0]!.fees).toBeCloseTo(0.15, 2);
  });

  it("holds the signed sum of the trades per ticker", () => {
    const withSale = [
      ...ROWS,
      [
        "Market sell",
        "2024-09-01 10:00:00",
        "IE00BFY0GT14",
        "ISWD",
        "iShares Core MSCI World",
        "32.0419",
        "1.70",
        "GBP",
        "1.0",
        "54.47",
        "GBP",
        "",
        "ord-2",
      ],
    ];
    const result = parseTrading212(withSale);
    const holding = (result.broker?.holdings ?? []).find((row) => row.symbol === "ISWD")!;

    expect(holding.quantity).toBeCloseTo(500, 4);
  });

  it("takes the wrapper from the file name, and asks when the name is silent", () => {
    expect(trading212Wrapper("Trading212_ISA_from_2024-04-06.csv")).toBe("isa");
    expect(trading212Wrapper("trading212 invest 2024.csv")).toBe("gia");
    expect(trading212Wrapper("from_2024-04-06_to_2025-04-05.csv")).toBeNull();

    // An ISA export is never filed as a general investment account.
    expect(parseTrading212(ROWS, "T212 ISA export.csv").meta.identity?.account_type).toBe("isa");

    const unnamed = parseTrading212(ROWS, "from_2024-04-06_to_2025-04-05.csv");
    expect(unnamed.meta.identity?.institution).toBe("Trading 212");
    expect(unnamed.meta.identity?.account_identifier).toBeNull();
    expect(unnamed.notes.join(" ")).toMatch(/ISA|Invest/);
  });
});
