import { describe, expect, it } from "vitest";
import { deriveBalances, type BalanceRow } from "./running-balance";

const rows: BalanceRow[] = [
  { booked_date: "2026-02-01", amount: 42, direction: "debit", balance_after: 1958 },
  { booked_date: "2026-02-03", amount: 200, direction: "credit", balance_after: 2158 },
  { booked_date: "2026-02-09", amount: 58.4, direction: "debit", balance_after: 2099.6 },
];

describe("deriveBalances", () => {
  it("reads the closing figure off the last line and works the opening back out", () => {
    const derived = deriveBalances(rows);

    expect(derived.closing).toBe(2099.6);
    expect(derived.closingDate).toBe("2026-02-09");
    expect(derived.opening).toBe(2000);
    expect(derived.derived).toEqual(["opening", "closing"]);
  });

  it("never overrules a figure the statement states", () => {
    const derived = deriveBalances(rows, { opening: 2000.5, closing: 2100.1 });

    expect(derived.opening).toBe(2000.5);
    expect(derived.closing).toBe(2100.1);
    expect(derived.derived).toEqual([]);
    // Still worth knowing which line the period ends on.
    expect(derived.closingDate).toBe("2026-02-09");
  });

  it("says nothing when the statement printed no running balance", () => {
    const derived = deriveBalances([
      { booked_date: "2026-02-01", amount: 42, direction: "debit", balance_after: null },
      { booked_date: "2026-02-03", amount: 200, direction: "credit" },
    ]);

    expect(derived.opening).toBeNull();
    expect(derived.closing).toBeNull();
    expect(derived.closingDate).toBeNull();
  });

  it("takes the last line of the day, not the first, when a day holds several", () => {
    const derived = deriveBalances([
      { booked_date: "2026-02-09", amount: 10, direction: "debit", balance_after: 990 },
      { booked_date: "2026-02-09", amount: 15, direction: "debit", balance_after: 975 },
    ]);

    expect(derived.closing).toBe(975);
  });

  it("sorts a file that arrived newest-first before reading its ends", () => {
    const derived = deriveBalances([...rows].reverse());

    expect(derived.closing).toBe(2099.6);
    expect(derived.opening).toBe(2000);
  });

  it("carries an overdrawn balance through as a negative figure", () => {
    const derived = deriveBalances([
      { booked_date: "2026-02-01", amount: 120, direction: "debit", balance_after: -45.5 },
    ]);

    expect(derived.closing).toBe(-45.5);
    expect(derived.opening).toBe(74.5);
  });

  it("derives only the end the file left open", () => {
    const derived = deriveBalances(rows, { opening: 2000, closing: null });

    expect(derived.derived).toEqual(["closing"]);
    expect(derived.closing).toBe(2099.6);
  });
});
