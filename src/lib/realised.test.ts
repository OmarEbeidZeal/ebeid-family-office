import { describe, expect, it } from "vitest";
import {
  realisedDisposals,
  summariseRealised,
  wrapperOf,
  type RealisedAccount,
  type RealisedHolding,
  type RealisedTrade,
} from "@/lib/realised";

/** GBP is base; a flat 0.8 keeps the arithmetic checkable by hand. */
const toBase = (amount: number, currency: string) =>
  currency === "GBP" ? amount : amount * 0.8;

const ACCOUNTS: RealisedAccount[] = [
  { id: "acc-isa", account_type: "isa", nickname: "Stocks & Shares ISA", owner_profile_id: "p1" },
  { id: "acc-gia", account_type: "gia", nickname: "Trading 212 Invest", owner_profile_id: "p1" },
  { id: "acc-sipp", account_type: "sipp", nickname: "SIPP", owner_profile_id: "p1" },
];

const holding = (over: Partial<RealisedHolding> = {}): RealisedHolding => ({
  id: "h1",
  ticker: "VWRP",
  name: null,
  account_id: "acc-gia",
  owner_profile_id: "p1",
  currency: "GBP",
  opening_quantity: 0,
  opening_cost: 0,
  ...over,
});

const trade = (over: Partial<RealisedTrade> = {}): RealisedTrade => ({
  holding_id: "h1",
  account_id: null,
  side: "buy",
  trade_date: "2026-05-01",
  quantity: 10,
  price: 100,
  fees: 0,
  currency: "GBP",
  ...over,
});

describe("wrapperOf", () => {
  it("keeps the tax treatments apart and admits when it does not know", () => {
    expect(wrapperOf("isa")).toBe("isa");
    expect(wrapperOf("sipp")).toBe("sipp");
    expect(wrapperOf("gia")).toBe("taxable");
    expect(wrapperOf(null)).toBe("unknown");
    expect(wrapperOf("mortgage")).toBe("unknown");
  });
});

describe("realisedDisposals", () => {
  it("replays trades at average cost, net of fees on both legs", () => {
    const disposals = realisedDisposals({
      holdings: [holding()],
      accounts: ACCOUNTS,
      toBase,
      trades: [
        trade({ side: "buy", quantity: 10, price: 100, fees: 5, trade_date: "2026-05-01" }),
        trade({ side: "buy", quantity: 10, price: 120, fees: 5, trade_date: "2026-06-01" }),
        trade({ side: "sell", quantity: 5, price: 150, fees: 2, trade_date: "2026-07-01" }),
      ],
    });
    expect(disposals).toHaveLength(1);
    const [sale] = disposals;
    // Cost 2,210 over 20 shares = 110.50 average; 5 sold = 552.50 of basis.
    expect(sale?.costBase).toBeCloseTo(552.5, 6);
    expect(sale?.proceedsBase).toBeCloseTo(748, 6);
    expect(sale?.gainBase).toBeCloseTo(195.5, 6);
    expect(sale?.wrapper).toBe("taxable");
    expect(sale?.basisKnown).toBe(true);
  });

  it("orders trades by date whatever order they arrive in", () => {
    const disposals = realisedDisposals({
      holdings: [holding()],
      accounts: ACCOUNTS,
      toBase,
      trades: [
        trade({ side: "sell", quantity: 5, price: 150, trade_date: "2026-07-01" }),
        trade({ side: "buy", quantity: 10, price: 100, trade_date: "2026-05-01" }),
      ],
    });
    expect(disposals[0]?.costBase).toBeCloseTo(500, 6);
    expect(disposals[0]?.gainBase).toBeCloseTo(250, 6);
  });

  it("reports the gain as unknown where the opening shares have no cost on file", () => {
    const disposals = realisedDisposals({
      holdings: [holding({ opening_quantity: 100, opening_cost: null })],
      accounts: ACCOUNTS,
      toBase,
      trades: [trade({ side: "sell", quantity: 10, price: 150, trade_date: "2026-07-01" })],
    });
    expect(disposals[0]?.costBase).toBeNull();
    expect(disposals[0]?.gainBase).toBeNull();
    expect(disposals[0]?.basisKnown).toBe(false);
    expect(disposals[0]?.proceedsBase).toBeCloseTo(1_500, 6);
  });

  it("converts a foreign-currency disposal into base on both legs", () => {
    const disposals = realisedDisposals({
      holdings: [holding({ currency: "USD" })],
      accounts: ACCOUNTS,
      toBase,
      trades: [
        trade({ side: "buy", quantity: 10, price: 100, currency: "USD", trade_date: "2026-05-01" }),
        trade({ side: "sell", quantity: 10, price: 150, currency: "USD", trade_date: "2026-07-01" }),
      ],
    });
    expect(disposals[0]?.proceedsBase).toBeCloseTo(1_200, 6);
    expect(disposals[0]?.costBase).toBeCloseTo(800, 6);
    expect(disposals[0]?.gainBase).toBeCloseTo(400, 6);
  });

  it("takes the wrapper from the trade's own account when it differs from the holding's", () => {
    const disposals = realisedDisposals({
      holdings: [holding({ account_id: "acc-gia" })],
      accounts: ACCOUNTS,
      toBase,
      trades: [
        trade({ side: "buy", quantity: 10, price: 100, trade_date: "2026-05-01" }),
        trade({
          side: "sell",
          quantity: 10,
          price: 120,
          trade_date: "2026-07-01",
          account_id: "acc-isa",
        }),
      ],
    });
    expect(disposals[0]?.wrapper).toBe("isa");
    expect(disposals[0]?.accountLabel).toBe("Stocks & Shares ISA");
  });

  it("stamps each disposal with the UK tax year it fell in", () => {
    const disposals = realisedDisposals({
      holdings: [holding()],
      accounts: ACCOUNTS,
      toBase,
      trades: [
        trade({ side: "buy", quantity: 20, price: 100, trade_date: "2026-01-01" }),
        trade({ side: "sell", quantity: 5, price: 120, trade_date: "2026-04-05" }),
        trade({ side: "sell", quantity: 5, price: 120, trade_date: "2026-04-06" }),
      ],
    });
    const years = disposals.map((row) => row.taxYear).sort();
    expect(years).toEqual(["2025/26", "2026/27"]);
  });

  it("ignores a holding with no trades at all", () => {
    expect(
      realisedDisposals({ holdings: [holding()], accounts: ACCOUNTS, toBase, trades: [] }),
    ).toEqual([]);
  });
});

describe("summariseRealised", () => {
  const now = new Date("2026-09-01T12:00:00Z");

  const disposalsFor = (trades: RealisedTrade[], holdings = [holding()]) =>
    realisedDisposals({ holdings, accounts: ACCOUNTS, toBase, trades });

  it("says the exempt amount is untouched when nothing taxable was sold", () => {
    const summary = summariseRealised({ disposals: [], base: "GBP", now });
    expect(summary.taxYear).toBe("2026/27");
    expect(summary.cgt.status).toBe("not_applicable");
    expect(summary.cgt.headroomBase).toBe(3_000);
    expect(summary.cgt.headline).toMatch(/untouched/);
  });

  it("counts a taxable gain against the £3,000 exempt amount", () => {
    const disposals = disposalsFor([
      trade({ side: "buy", quantity: 100, price: 100, trade_date: "2026-05-01" }),
      trade({ side: "sell", quantity: 20, price: 150, trade_date: "2026-07-01" }),
    ]);
    const summary = summariseRealised({ disposals, base: "GBP", now });
    expect(summary.cgt.gainsBase).toBeCloseTo(1_000, 6);
    expect(summary.cgt.netBase).toBeCloseTo(1_000, 6);
    expect(summary.cgt.headroomBase).toBeCloseTo(2_000, 6);
    expect(summary.cgt.taxableBase).toBe(0);
    expect(summary.cgt.status).toBe("ok");
  });

  it("flags a net gain past the exemption with the taxable excess", () => {
    const disposals = disposalsFor([
      trade({ side: "buy", quantity: 100, price: 100, trade_date: "2026-05-01" }),
      trade({ side: "sell", quantity: 100, price: 145, trade_date: "2026-07-01" }),
    ]);
    const summary = summariseRealised({ disposals, base: "GBP", now });
    expect(summary.cgt.netBase).toBeCloseTo(4_500, 6);
    expect(summary.cgt.taxableBase).toBeCloseTo(1_500, 6);
    expect(summary.cgt.headroomBase).toBe(0);
    expect(summary.cgt.status).toBe("watch");
    expect(summary.cgt.headline).toMatch(/18% or 24%/);
  });

  it("nets a loss against a gain in the same wrapper and same year", () => {
    const disposals = [
      ...disposalsFor([
        trade({ side: "buy", quantity: 100, price: 100, trade_date: "2026-05-01" }),
        trade({ side: "sell", quantity: 100, price: 120, trade_date: "2026-07-01" }),
      ]),
      ...disposalsFor(
        [
          trade({ holding_id: "h2", side: "buy", quantity: 100, price: 100, trade_date: "2026-05-01" }),
          trade({ holding_id: "h2", side: "sell", quantity: 100, price: 95, trade_date: "2026-08-01" }),
        ],
        [holding({ id: "h2", ticker: "LUNR" })],
      ),
    ];
    const summary = summariseRealised({ disposals, base: "GBP", now });
    expect(summary.cgt.gainsBase).toBeCloseTo(2_000, 6);
    expect(summary.cgt.lossesBase).toBeCloseTo(500, 6);
    expect(summary.cgt.netBase).toBeCloseTo(1_500, 6);
  });

  it("keeps an ISA loss out of the capital gains position entirely", () => {
    const disposals = realisedDisposals({
      holdings: [holding({ account_id: "acc-isa" })],
      accounts: ACCOUNTS,
      toBase,
      trades: [
        trade({ side: "buy", quantity: 100, price: 100, trade_date: "2026-05-01" }),
        trade({ side: "sell", quantity: 100, price: 60, trade_date: "2026-07-01" }),
      ],
    });
    const summary = summariseRealised({ disposals, base: "GBP", now });
    expect(summary.cgt.status).toBe("not_applicable");
    expect(summary.cgt.lossesBase).toBe(0);
    expect(summary.shelteredNetBase).toBeCloseTo(-4_000, 6);
    expect(summary.shelteredDisposals).toBe(1);
    expect(summary.thisYear.map((row) => row.wrapper)).toEqual(["isa"]);
    expect(summary.thisYear[0]?.note).toMatch(/carries no tax benefit/);
  });

  it("reports the whole position as unknown while any taxable disposal lacks a basis", () => {
    const disposals = realisedDisposals({
      holdings: [holding({ opening_quantity: 50, opening_cost: null })],
      accounts: ACCOUNTS,
      toBase,
      trades: [trade({ side: "sell", quantity: 10, price: 150, trade_date: "2026-07-01" })],
    });
    const summary = summariseRealised({ disposals, base: "GBP", now });
    expect(summary.cgt.status).toBe("unknown");
    expect(summary.cgt.unknownBasisCount).toBe(1);
    expect(summary.cgt.headline).toMatch(/no purchase price on file/);
  });

  it("separates this tax year from every year that came before", () => {
    const disposals = disposalsFor([
      trade({ side: "buy", quantity: 100, price: 100, trade_date: "2025-05-01" }),
      trade({ side: "sell", quantity: 40, price: 120, trade_date: "2025-07-01" }),
      trade({ side: "sell", quantity: 40, price: 130, trade_date: "2026-07-01" }),
    ]);
    const summary = summariseRealised({ disposals, base: "GBP", now });
    expect(summary.disposalCount).toBe(1);
    expect(summary.thisYear[0]?.disposals).toBe(1);
    expect(summary.allTime[0]?.disposals).toBe(2);
    expect(summary.cgt.gainsBase).toBeCloseTo(1_200, 6);
  });

  it("names a disposal that is not linked to any account rather than guessing its treatment", () => {
    const disposals = realisedDisposals({
      holdings: [holding({ account_id: null })],
      accounts: ACCOUNTS,
      toBase,
      trades: [
        trade({ side: "buy", quantity: 10, price: 100, trade_date: "2026-05-01" }),
        trade({ side: "sell", quantity: 10, price: 150, trade_date: "2026-07-01" }),
      ],
    });
    const summary = summariseRealised({ disposals, base: "GBP", now });
    expect(disposals[0]?.wrapper).toBe("unknown");
    expect(summary.cgt.status).toBe("not_applicable");
    expect(summary.thisYear[0]?.note).toMatch(/not linked to an account/);
  });
});
