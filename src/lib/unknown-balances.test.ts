/**
 * An unknown balance is unknown. It is not zero.
 *
 * Production held nineteen net-worth snapshots of £0.00 and a standing "cash
 * reserve is short" warning, both produced by accounts discovered from files
 * that never printed a balance.
 */
import { describe, expect, it } from "vitest";
import { balanceKnown } from "./balances";
import { computeNetWorth } from "./networth";
import { evaluatePolicy } from "./policy";

const account = (over: Record<string, unknown> = {}) => ({
  id: "acc-1",
  household_id: "h",
  nickname: "Monzo Current",
  institution: "Monzo",
  account_type: "current",
  currency: "GBP",
  current_balance: null as number | null,
  is_active: true,
  ...over,
});

const toBase = (value: number) => value;

describe("a balance nobody has stated", () => {
  it("is not treated as a figure", () => {
    expect(balanceKnown({ current_balance: null })).toBe(false);
    expect(balanceKnown({ current_balance: undefined })).toBe(false);
    expect(balanceKnown({ current_balance: 0 })).toBe(true);
  });

  it("leaves the household with nothing to snapshot", () => {
    const computed = computeNetWorth({
      accounts: [account()] as never,
      assets: [],
      liabilities: [],
      income: [],
      expenses: [],
      toBase,
      base: "GBP",
    });

    // The nightly job writes nothing when this is false — no more £0 snapshots.
    expect(computed.hasData).toBe(false);
    expect(computed.counts.balancesUnstated).toBe(1);
    expect(computed.counts.accounts).toBe(1);
  });

  it("counts as data as soon as one figure is known", () => {
    const computed = computeNetWorth({
      accounts: [account(), account({ id: "acc-2", current_balance: 3293.65 })] as never,
      assets: [],
      liabilities: [],
      income: [],
      expenses: [],
      toBase,
      base: "GBP",
    });

    expect(computed.hasData).toBe(true);
    expect(computed.counts.balancesUnstated).toBe(1);
  });
});

describe("the cash reserve rule", () => {
  const input = {
    base: "GBP",
    netWorth: 0,
    investableTotal: 0,
    privateStakeValue: 0,
    gbpCash: 0,
    essentialMonthly: 4000,
    essentialSource: "observed",
    monthlySurplus: null,
    sleeveValues: {} as never,
    equityPoolBase: 0,
    positions: [],
    unpricedCount: 0,
    softCurrencyValue: 0,
    highRateDebts: [],
    goals: [],
    allowances: [],
    daysToTaxYearEnd: 90,
  } as never;

  const reserveOf = (cashBalancesUnknown: number) =>
    evaluatePolicy({ ...(input as object), cashBalancesUnknown } as never).find(
      (finding) => finding.id === "liquidity-reserve",
    )!;

  it("says the reserve is unmeasurable while a cash balance is unknown", () => {
    const reserve = reserveOf(2);

    expect(reserve.status).toBe("unknown");
    expect(reserve.headline).toContain("2 account balances are unknown");
    expect(reserve.headline).not.toMatch(/covers/);
  });

  it("measures the reserve once every balance is known", () => {
    const reserve = reserveOf(0);

    // Nil cash against £4,000 of essential spending is a real breach, not a gap
    // in the data — and it only reads that way when nothing is unknown.
    expect(reserve.status).toBe("breach");
    expect(reserve.value).toBe(0);
  });
});
