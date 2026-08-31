import { describe, expect, it } from "vitest";
import { accountCoverage, coverageGaps, monthLabel, monthsCovered } from "./coverage";

const TODAY = new Date("2026-09-15T00:00:00Z");

const statement = (
  accountId: string | null,
  periodStart: string | null,
  periodEnd: string | null,
  status = "imported",
) => ({ accountId, status, periodStart, periodEnd });

describe("monthsCovered", () => {
  it("spans every month a period touches, inclusive of both ends", () => {
    expect(monthsCovered("2026-01-28", "2026-03-02")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("returns nothing for a period that is missing, reversed or unreadable", () => {
    expect(monthsCovered(null, "2026-03-02")).toEqual([]);
    expect(monthsCovered("2026-03-02", null)).toEqual([]);
    expect(monthsCovered("2026-03-02", "2026-01-28")).toEqual([]);
    expect(monthsCovered("not a date", "2026-01-28")).toEqual([]);
  });
});

describe("accountCoverage", () => {
  it("counts the files behind an account and the months they span", () => {
    const coverage = accountCoverage(
      [
        statement("acc-1", "2026-06-01", "2026-06-30"),
        statement("acc-1", "2026-07-01", "2026-07-31"),
        statement("acc-1", "2026-08-01", "2026-08-31"),
      ],
      TODAY,
    );

    expect(coverage.get("acc-1")).toEqual({
      accountId: "acc-1",
      statements: 3,
      earliest: "2026-06",
      latest: "2026-08",
      missing: 0,
    });
  });

  it("counts months inside the range with nothing behind them", () => {
    const coverage = accountCoverage(
      [
        statement("acc-1", "2026-05-01", "2026-05-31"),
        // June and July never imported.
        statement("acc-1", "2026-08-01", "2026-08-31"),
      ],
      TODAY,
    );

    expect(coverage.get("acc-1")?.missing).toBe(2);
    expect(coverage.get("acc-1")?.statements).toBe(2);
  });

  it("counts whole months since the last statement, but never the month in progress", () => {
    // Latest file ends in June; July and August are complete and missing,
    // September is still running so it cannot have a statement yet.
    const coverage = accountCoverage([statement("acc-1", "2026-06-01", "2026-06-30")], TODAY);
    expect(coverage.get("acc-1")?.missing).toBe(2);
  });

  it("ignores files that are queued, failed or waiting on an account", () => {
    const coverage = accountCoverage(
      [
        statement("acc-1", "2026-08-01", "2026-08-31"),
        statement("acc-1", "2026-07-01", "2026-07-31", "queued"),
        statement("acc-1", "2026-06-01", "2026-06-30", "failed"),
        statement("acc-1", "2026-05-01", "2026-05-31", "awaiting_account"),
        statement(null, "2026-08-01", "2026-08-31"),
      ],
      TODAY,
    );

    expect(coverage.get("acc-1")?.statements).toBe(1);
    expect(coverage.get("acc-1")?.earliest).toBe("2026-08");
  });

  it("keeps a file that carried no period as a count without a range", () => {
    const coverage = accountCoverage([statement("acc-1", null, null)], TODAY);
    expect(coverage.get("acc-1")).toEqual({
      accountId: "acc-1",
      statements: 1,
      earliest: null,
      latest: null,
      missing: 0,
    });
  });

  it("keeps accounts apart and leaves untouched accounts absent", () => {
    const coverage = accountCoverage(
      [
        statement("acc-1", "2026-08-01", "2026-08-31"),
        statement("acc-2", "2026-01-01", "2026-08-31"),
      ],
      TODAY,
    );

    expect(coverage.get("acc-1")?.statements).toBe(1);
    expect(coverage.get("acc-2")?.earliest).toBe("2026-01");
    expect(coverage.has("acc-3")).toBe(false);
  });

  it("agrees with the gap list the import page shows", () => {
    const rows = [
      statement("acc-1", "2026-05-01", "2026-05-31"),
      statement("acc-1", "2026-08-01", "2026-08-31"),
    ];
    const gap = coverageGaps(rows, TODAY).find((row) => row.accountId === "acc-1");
    expect(accountCoverage(rows, TODAY).get("acc-1")?.missing).toBe(gap?.months.length);
  });
});

describe("monthLabel", () => {
  it("reads a month key as a person would say it", () => {
    expect(monthLabel("2026-08")).toBe("Aug 2026");
  });
});
