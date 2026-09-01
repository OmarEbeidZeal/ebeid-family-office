import { describe, expect, it } from "vitest";

import { inferYearFromPeriod, resolveStatementDate } from "./statement-dates.server";
import { splitDescriptionAndType } from "./uk-tx-types";

/**
 * NatWest's annual statement: every row prints `26 Aug`, and the year appears
 * once, in the header. Anything that assumes "this year" files a year of
 * spending into the wrong months and the totals still balance.
 */
describe("inferYearFromPeriod", () => {
  const period = { start: "2024-09-01", end: "2025-08-31" };

  it("takes the year of the period end when the row falls on or before it", () => {
    expect(inferYearFromPeriod(26, 8, period)).toBe("2025-08-26");
    expect(inferYearFromPeriod(31, 8, period)).toBe("2025-08-31");
  });

  it("rolls back a year when the row would land after the statement ended", () => {
    expect(inferYearFromPeriod(1, 9, period)).toBe("2024-09-01");
    expect(inferYearFromPeriod(25, 12, period)).toBe("2024-12-25");
  });

  it("works from the start date when the header states no end", () => {
    expect(inferYearFromPeriod(3, 2, { start: "2025-02-01", end: null })).toBe("2025-02-03");
  });

  it("refuses to guess when the statement states no period at all", () => {
    expect(inferYearFromPeriod(26, 8, { start: null, end: null })).toBeNull();
  });

  it("keeps 29 February in the year that actually has one", () => {
    expect(inferYearFromPeriod(29, 2, { start: "2024-01-01", end: "2024-12-31" })).toBe(
      "2024-02-29",
    );
  });
});

describe("resolveStatementDate", () => {
  const period = { start: "2024-09-01", end: "2025-08-31" };

  it("reads a printed full date as printed", () => {
    expect(resolveStatementDate("2025-03-14", period)).toEqual({
      date: "2025-03-14",
      inferred: false,
      reason: "printed",
    });
  });

  it.each(["26 Aug", "26-Aug", "Aug 26", "26/08"])("infers the year for %s", (printed) => {
    expect(resolveStatementDate(printed, period)).toEqual({
      date: "2025-08-26",
      inferred: true,
      reason: "inferred",
    });
  });

  it("drops a row that still falls outside the period once dated", () => {
    const resolved = resolveStatementDate("26 Aug", { start: "2025-01-01", end: "2025-06-30" });
    expect(resolved.date).toBeNull();
    expect(resolved.reason).toBe("outside_period");
  });

  it("reports an unreadable date rather than substituting today", () => {
    expect(resolveStatementDate("n/a", period).reason).toBe("unreadable");
    expect(resolveStatementDate("", period).reason).toBe("unreadable");
  });
});

describe("splitDescriptionAndType", () => {
  it("lifts a type that ran onto the end of the merchant", () => {
    expect(splitDescriptionAndType("TESCO STORES 3241Debit Card Transaction")).toEqual({
      description: "TESCO STORES 3241",
      type: "Debit Card Transaction",
    });
  });

  it("prefers the longest matching type", () => {
    expect(splitDescriptionAndType("SKY UK LTDDirect Debit").type).toBe("Direct Debit");
    expect(splitDescriptionAndType("AMAZON UKDebit Card Transaction").type).toBe(
      "Debit Card Transaction",
    );
  });

  it("keeps a row that is nothing but its type", () => {
    expect(splitDescriptionAndType("No Description Available")).toEqual({
      description: "No Description Available",
      type: "No Description Available",
    });
  });

  it("leaves an ordinary description alone", () => {
    expect(splitDescriptionAndType("PRET A MANGER LONDON")).toEqual({
      description: "PRET A MANGER LONDON",
      type: null,
    });
  });

  it("groups every visit to one merchant under the same payee", () => {
    const rows = [
      "TESCO STORES 3241Debit Card Transaction",
      "TESCO STORES 3241Point of Sale",
      "TESCO STORES 3241 Debit Card Transaction",
    ];
    const merchants = new Set(rows.map((row) => splitDescriptionAndType(row).description));
    expect(merchants.size).toBe(1);
  });
});
