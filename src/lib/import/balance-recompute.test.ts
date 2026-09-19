import { describe, expect, it } from "vitest";
import { latestStatementBalance } from "./pipeline.server";

describe("latestStatementBalance", () => {
  it("takes the closing figure of the latest period, whatever order files arrived in", () => {
    const best = latestStatementBalance(
      [
        { id: "new", period_end: "2025-08-31", closing_balance: 3293.65, currency: "GBP" },
        { id: "old", period_end: "2024-08-31", closing_balance: 100.5, currency: "GBP" },
      ],
      "GBP",
    );
    expect(best).toEqual({ id: "new", periodEnd: "2025-08-31", closing: 3293.65 });
  });

  it("is unchanged by an older file imported afterwards", () => {
    const best = latestStatementBalance(
      [
        { id: "old", period_end: "2023-01-31", closing_balance: 12, currency: "GBP" },
        { id: "new", period_end: "2025-01-31", closing_balance: 450.01, currency: "GBP" },
      ],
      "GBP",
    );
    expect(best?.id).toBe("new");
  });

  it("ignores statements that printed no closing balance rather than reading them as zero", () => {
    const best = latestStatementBalance(
      [
        { id: "monzo", period_end: "2025-09-01", closing_balance: null, currency: "GBP" },
        { id: "natwest", period_end: "2025-08-31", closing_balance: 598.12, currency: "GBP" },
      ],
      "GBP",
    );
    expect(best).toEqual({ id: "natwest", periodEnd: "2025-08-31", closing: 598.12 });
  });

  it("returns null — unknown, not zero — when nothing prints a balance", () => {
    expect(
      latestStatementBalance(
        [{ id: "monzo", period_end: "2025-09-01", closing_balance: null, currency: "GBP" }],
        "GBP",
      ),
    ).toBeNull();
  });

  it("never takes a figure stated in another currency", () => {
    expect(
      latestStatementBalance(
        [{ id: "usd", period_end: "2025-09-01", closing_balance: 1391.48, currency: "USD" }],
        "GBP",
      ),
    ).toBeNull();
  });
});
