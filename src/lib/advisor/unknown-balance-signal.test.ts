import { describe, expect, it } from "vitest";
import type { HouseholdContext } from "@/lib/household-context";
import { SIGNAL_INTERNALS } from "./signals";

function context(liquidity: Record<string, unknown>): HouseholdContext {
  return { liquidity } as unknown as HouseholdContext;
}

describe("unknown cash balances", () => {
  it("reports how many balances are unknown instead of judging the reserve", () => {
    const signals = SIGNAL_INTERNALS.fromLiquidity(
      context({
        gbp_cash: 1200,
        essential_monthly: 4000,
        months_covered: 0.3,
        target_months: 12,
        cash_balances_unknown: 2,
      }),
      "GBP",
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.id).toBe("cash-balances-unknown");
    expect(signals[0]!.summary).toContain("2 account balances are unknown");
    expect(signals[0]!.summary).toContain("not being called short");
  });

  it("uses the singular for one unknown account", () => {
    const [signal] = SIGNAL_INTERNALS.fromLiquidity(
      context({
        gbp_cash: 0,
        essential_monthly: 4000,
        months_covered: 0,
        target_months: 12,
        cash_balances_unknown: 1,
      }),
      "GBP",
    );
    expect(signal!.summary).toContain("1 account balance is unknown");
  });

  it("never raises cash drag while a balance is unknown", () => {
    const signals = SIGNAL_INTERNALS.fromLiquidity(
      context({
        gbp_cash: 500_000,
        essential_monthly: 4000,
        months_covered: 125,
        target_months: 12,
        cash_balances_unknown: 1,
      }),
      "GBP",
    );
    expect(signals.map((s) => s.id)).not.toContain("cash-drag");
  });

  it("still reports cash drag once every balance is known", () => {
    const signals = SIGNAL_INTERNALS.fromLiquidity(
      context({
        gbp_cash: 500_000,
        essential_monthly: 4000,
        months_covered: 125,
        target_months: 12,
        cash_balances_unknown: 0,
      }),
      "GBP",
    );
    expect(signals.map((s) => s.id)).toContain("cash-drag");
  });

  it("says nothing when the figures are simply not there yet", () => {
    expect(
      SIGNAL_INTERNALS.fromLiquidity(
        context({
          gbp_cash: 0,
          essential_monthly: null,
          months_covered: null,
          target_months: 12,
          cash_balances_unknown: 0,
        }),
        "GBP",
      ),
    ).toEqual([]);
  });
});
