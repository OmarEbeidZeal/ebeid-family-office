import { describe, expect, it } from "vitest";
import {
  detectBalanceConflicts,
  detectPositionConflict,
  detectSnapshotConflict,
  positionAt,
  type StatementFigure,
} from "./conflicts";

const trade = (side: "buy" | "sell", trade_date: string, quantity: number) => ({
  side,
  trade_date,
  quantity,
});

describe("positionAt", () => {
  it("counts only the orders on or before the date", () => {
    const trades = [
      trade("buy", "2025-01-10", 10),
      trade("sell", "2025-02-14", 4),
      trade("buy", "2025-06-01", 6),
    ];
    expect(positionAt(trades, "2025-01-31")).toBe(10);
    expect(positionAt(trades, "2025-03-01")).toBe(6);
    expect(positionAt(trades, "2025-12-31")).toBe(12);
  });

  it("counts an order made on the date itself", () => {
    expect(positionAt([trade("buy", "2025-03-04", 2.5)], "2025-03-04")).toBe(2.5);
  });
});

describe("detectPositionConflict", () => {
  const base = {
    ticker: "LUNR",
    asOf: "2025-06-30",
    institution: "Trading 212",
    statedSource: "trading212-statement.pdf",
    derivedSource: "trading212-activity.csv",
  };

  it("names both figures and both documents when the orders outrun the snapshot", () => {
    const conflict = detectPositionConflict({
      ...base,
      statedShares: 12.3659,
      derivedShares: 15,
      derivedSharesEarlier: 15,
    });
    expect(conflict).not.toBeNull();
    expect(conflict!.kind).toBe("position");
    expect(conflict!.message).toContain("12.3659");
    expect(conflict!.message).toContain("15");
    expect(conflict!.message).toContain("trading212-statement.pdf");
    expect(conflict!.message).toContain("trading212-activity.csv");
    expect(conflict!.sources).toEqual([
      "trading212-statement.pdf",
      "trading212-activity.csv",
    ]);
  });

  it("stays quiet when the snapshot is the larger figure — that is an opening position", () => {
    expect(
      detectPositionConflict({ ...base, statedShares: 20, derivedShares: 12 }),
    ).toBeNull();
  });

  it("tolerates the rounding a broker prints", () => {
    expect(
      detectPositionConflict({
        ...base,
        statedShares: 3.6659,
        derivedShares: 3.66586264,
        derivedSharesEarlier: 3.66586264,
      }),
    ).toBeNull();
  });

  it("stays quiet when shares were bought between the ex-date and the payment", () => {
    expect(
      detectPositionConflict({
        ...base,
        statedShares: 10,
        derivedShares: 18,
        derivedSharesEarlier: 10,
      }),
    ).toBeNull();
  });

  it("still fires when the gap predates the dividend window", () => {
    const conflict = detectPositionConflict({
      ...base,
      statedShares: 10,
      derivedShares: 18,
      derivedSharesEarlier: 16,
    });
    expect(conflict).not.toBeNull();
  });

  it("falls back to plain wording when the earlier document has no name", () => {
    const conflict = detectPositionConflict({
      ...base,
      statedShares: 1,
      derivedShares: 4,
      statedSource: null,
      derivedSource: null,
    });
    expect(conflict!.message).toContain("this export");
    expect(conflict!.message).toContain("the orders already recorded");
  });
});

describe("detectSnapshotConflict", () => {
  const base = {
    ticker: "CRWV",
    asOf: "2025-05-31",
    institution: "Trading 212",
  };

  it("reports two exports that state different holdings on the same day", () => {
    const conflict = detectSnapshotConflict({
      ...base,
      held: { shares: 40, source: "t212-may.csv" },
      incoming: { shares: 55, source: "t212-may-statement.pdf" },
    });
    expect(conflict).not.toBeNull();
    expect(conflict!.message).toContain("t212-may.csv");
    expect(conflict!.message).toContain("t212-may-statement.pdf");
    expect(conflict!.message).toContain("40");
    expect(conflict!.message).toContain("55");
  });

  it("stays quiet when the same file is read again", () => {
    expect(
      detectSnapshotConflict({
        ...base,
        held: { shares: 40, source: "t212-may.csv" },
        incoming: { shares: 55, source: "t212-may.csv" },
      }),
    ).toBeNull();
  });

  it("stays quiet when both exports agree", () => {
    expect(
      detectSnapshotConflict({
        ...base,
        held: { shares: 40, source: "a.csv" },
        incoming: { shares: 40.0001, source: "b.csv" },
      }),
    ).toBeNull();
  });
});

describe("detectBalanceConflicts", () => {
  const held: StatementFigure = {
    id: "held",
    fileName: "june-statement.pdf",
    periodStart: "2025-06-01",
    periodEnd: "2025-06-30",
    openingBalance: 1000,
    closingBalance: 2500,
    currency: "GBP",
  };

  it("reports two documents closing the same day on different figures", () => {
    const conflicts = detectBalanceConflicts(
      {
        id: "incoming",
        fileName: "june-export.csv",
        periodStart: "2025-06-01",
        periodEnd: "2025-06-30",
        openingBalance: 1000,
        closingBalance: 2410.55,
        currency: "GBP",
      },
      [held],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe("balance_same_date");
    expect(conflicts[0]!.message).toContain("2410.55 GBP");
    expect(conflicts[0]!.message).toContain("2500.00 GBP");
    expect(conflicts[0]!.sources).toEqual(["june-export.csv", "june-statement.pdf"]);
  });

  it("reports a seam where the next statement opens on a different figure", () => {
    const conflicts = detectBalanceConflicts(
      {
        id: "incoming",
        fileName: "july-statement.pdf",
        periodStart: "2025-07-01",
        periodEnd: "2025-07-31",
        openingBalance: 2380,
        closingBalance: 3000,
        currency: "GBP",
      },
      [held],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe("balance_seam");
    expect(conflicts[0]!.message).toContain("120.00 GBP");
  });

  it("accepts a seam that meets on the same day", () => {
    const conflicts = detectBalanceConflicts(
      {
        id: "incoming",
        fileName: "july-statement.pdf",
        periodStart: "2025-06-30",
        periodEnd: "2025-07-31",
        openingBalance: 2500,
        closingBalance: 3000,
        currency: "GBP",
      },
      [held],
    );
    expect(conflicts).toEqual([]);
  });

  it("ignores statements in another currency", () => {
    const conflicts = detectBalanceConflicts(
      {
        id: "incoming",
        fileName: "june-usd.csv",
        periodStart: "2025-06-01",
        periodEnd: "2025-06-30",
        openingBalance: 1000,
        closingBalance: 990,
        currency: "USD",
      },
      [held],
    );
    expect(conflicts).toEqual([]);
  });

  it("ignores a missing balance rather than treating it as zero", () => {
    const conflicts = detectBalanceConflicts(
      {
        id: "incoming",
        fileName: "june-partial.csv",
        periodStart: "2025-06-01",
        periodEnd: "2025-06-30",
        openingBalance: null,
        closingBalance: null,
        currency: "GBP",
      },
      [held],
    );
    expect(conflicts).toEqual([]);
  });

  it("ignores a penny of rounding", () => {
    const conflicts = detectBalanceConflicts(
      {
        id: "incoming",
        fileName: "june-export.csv",
        periodStart: "2025-06-01",
        periodEnd: "2025-06-30",
        openingBalance: 1000,
        closingBalance: 2500.01,
        currency: "GBP",
      },
      [held],
    );
    expect(conflicts).toEqual([]);
  });

  it("never compares a statement with itself", () => {
    expect(detectBalanceConflicts({ ...held }, [held])).toEqual([]);
  });
});
