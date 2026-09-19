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
    reserveCash: 0,
    essentialSpend: 4000,
    reserveMonths: 6,
    liquidCash: 0,
    softCurrencyShare: 0,
    netWorth: 0,
    concentration: [],
    goals: [],
  } as never;

  it("says the reserve is unmeasurable while a cash balance is unknown", () => {
    const rules = evaluatePolicy({ ...(input as object), cashBalancesUnknown: 2 } as never);
    const reserve = rules.find((rule) => /reserve/i.test(rule.title ?? rule.headline ?? ""));

    expect(reserve?.status).toBe("unknown");
    expect(reserve?.headline).toContain("2");
    expect(reserve?.headline).not.toMatch(/short by/i);
  });

  it("calls a genuine shortfall short once every balance is known", () => {
    const rules = evaluatePolicy({ ...(input as object), cashBalancesUnknown: 0 } as never);
    const reserve = rules.find((rule) => /reserve/i.test(rule.title ?? rule.headline ?? ""));

    expect(reserve?.status).not.toBe("unknown");
  });
});
