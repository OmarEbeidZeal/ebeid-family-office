import { describe, expect, it } from "vitest";

import { openingPosition, type TradeLike } from "./broker";

const buy = (trade_date: string, quantity: number): TradeLike => ({
  side: "buy",
  trade_date,
  quantity,
});
const sell = (trade_date: string, quantity: number): TradeLike => ({
  side: "sell",
  trade_date,
  quantity,
});

describe("openingPosition", () => {
  it("finds nothing when every sale is covered by an earlier purchase", () => {
    const result = openingPosition([buy("2026-01-04", 10), sell("2026-03-02", 4)], null);
    expect(result).toEqual({ quantity: 0, asOf: null });
  });

  it("counts shares sold that the trades never bought", () => {
    const result = openingPosition([sell("2026-02-11", 6.5)], null);
    expect(result.quantity).toBe(6.5);
    expect(result.asOf).toBe("2026-02-11");
  });

  it("counts only the uncovered part of an oversized sale", () => {
    const result = openingPosition([buy("2026-01-04", 2), sell("2026-02-11", 6.5)], null);
    expect(result.quantity).toBe(4.5);
  });

  it("reads a dividend as evidence of shares no purchase explains", () => {
    const result = openingPosition([], { asOf: "2025-12-19", shares: 1.1522 });
    expect(result.quantity).toBe(1.1522);
    expect(result.asOf).toBe("2025-12-19");
  });

  it("does not count the same missing shares twice when the sale follows the dividend", () => {
    // The ISWD case: a dividend on 1.15 shares, then the whole position sold.
    const result = openingPosition([sell("2026-02-02", 1.1522)], {
      asOf: "2025-12-19",
      shares: 1.1522,
    });
    expect(result.quantity).toBeCloseTo(1.1522, 6);
  });

  it("applies same-day evidence after that day's purchases", () => {
    // A dividend is paid on the position at its ex-date, which a purchase
    // settled the same day has already moved past.
    const result = openingPosition([buy("2026-01-15", 5)], { asOf: "2026-01-15", shares: 3 });
    expect(result.quantity).toBe(0);
  });

  it("clears the shortfall once the earlier export supplies the purchase", () => {
    const withoutHistory = openingPosition([sell("2026-02-11", 6.5)], {
      asOf: "2026-01-20",
      shares: 6.5,
    });
    expect(withoutHistory.quantity).toBe(6.5);

    const withHistory = openingPosition(
      [buy("2025-08-01", 6.5), sell("2026-02-11", 6.5)],
      { asOf: "2026-01-20", shares: 6.5 },
    );
    expect(withHistory).toEqual({ quantity: 0, asOf: null });
  });

  it("accumulates across several uncovered sales", () => {
    const result = openingPosition(
      [sell("2026-01-05", 2), buy("2026-01-06", 1), sell("2026-01-07", 3)],
      null,
    );
    expect(result.quantity).toBe(4);
    expect(result.asOf).toBe("2026-01-05");
  });

  it("reads trades in date order however they arrive", () => {
    const result = openingPosition([sell("2026-03-02", 4), buy("2026-01-04", 10)], null);
    expect(result.quantity).toBe(0);
  });

  it("tolerates the rounding a fractional-share broker prints", () => {
    const result = openingPosition(
      [buy("2026-01-04", 3.6658626), sell("2026-05-01", 3.6658627)],
      null,
    );
    expect(result.quantity).toBe(0);
  });
});
