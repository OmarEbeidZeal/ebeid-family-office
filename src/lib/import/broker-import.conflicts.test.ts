/**
 * The broker importer against a broker that contradicts itself.
 *
 * These run the real importer over an in-memory database, because the point is
 * not that the detector works — that is tested next door — but that a
 * disagreement survives the import instead of being silently resolved.
 */
import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { importBrokerLedger } from "./broker-import.server";
import type { BrokerLedger, BrokerTrade, PartialPosition } from "./broker";

const ACCOUNT = "acc-t212";
const HOUSEHOLD = "hh-1";

function trade(overrides: Partial<BrokerTrade> = {}): BrokerTrade {
  return {
    externalRef: `ref-${Math.random().toString(36).slice(2, 10)}`,
    ticker: "LUNR",
    brokerTicker: "LUNR",
    isin: null,
    name: "Intuitive Machines",
    securityType: "stock",
    side: "buy",
    tradeDate: "2025-06-02",
    quantity: 2,
    price: 10,
    currency: "USD",
    fees: 0,
    cashAmount: -20,
    result: null,
    ...overrides,
  };
}

function partial(overrides: Partial<PartialPosition> = {}): PartialPosition {
  return {
    ticker: "LUNR",
    brokerTicker: "LUNR",
    shortfall: 0,
    firstSeen: "2025-06-30",
    heldEvidence: null,
    ...overrides,
  };
}

function ledger(overrides: Partial<BrokerLedger> = {}): BrokerLedger {
  return {
    broker: "trading212",
    accountCurrency: "GBP",
    trades: [],
    partial: [],
    unknownActions: [],
    ...overrides,
  };
}

function seed(options: {
  evidence?: Record<string, unknown> | null;
  trades?: Array<{ date: string; quantity: number; side?: "buy" | "sell" }>;
} = {}) {
  return fakeSupabase({
    accounts: [{ id: ACCOUNT, household_id: HOUSEHOLD, owner_profile_id: "p-omar" }],
    holdings: [
      {
        id: "hold-lunr",
        household_id: HOUSEHOLD,
        account_id: ACCOUNT,
        ticker: "LUNR",
        name: "Intuitive Machines",
        exchange: null,
        security_type: "stock",
        currency: "USD",
        opened_at: "2025-01-10",
        opening_quantity: 0,
        opening_cost: null,
        position_evidence: options.evidence ?? null,
        discovered_from: "statement",
      },
    ],
    trades: (options.trades ?? []).map((row, index) => ({
      id: `t-${index}`,
      household_id: HOUSEHOLD,
      holding_id: "hold-lunr",
      account_id: ACCOUNT,
      side: row.side ?? "buy",
      trade_date: row.date,
      quantity: row.quantity,
      price: 9,
      fees: 0,
      currency: "USD",
    })),
  });
}

describe("importBrokerLedger — a broker that disagrees with itself", () => {
  it("holds a conflict when the orders outrun the snapshot", async () => {
    const supabase = seed({
      trades: [
        { date: "2025-01-10", quantity: 10 },
        { date: "2025-02-10", quantity: 8 },
      ],
    });

    const result = await importBrokerLedger(supabase as never, {
      householdId: HOUSEHOLD,
      accountId: ACCOUNT,
      fileName: "trading212-statement.pdf",
      ledger: ledger({
        partial: [partial({ heldEvidence: { asOf: "2025-06-30", shares: 12.3659 }, shortfall: 0 })],
      }),
    });

    expect(result.conflicts).toHaveLength(1);
    const [conflict] = result.conflicts;
    expect(conflict!.kind).toBe("position");
    expect(conflict!.message).toContain("Trading 212");
    expect(conflict!.message).toContain("12.3659");
    expect(conflict!.message).toContain("18");
    expect(conflict!.message).toContain("trading212-statement.pdf");
    // The disagreement is spoken, not buried.
    expect(result.notes.some((note) => note.includes("12.3659"))).toBe(true);
  });

  it("stays quiet when the snapshot is larger — those are shares bought earlier", async () => {
    const supabase = seed({ trades: [{ date: "2025-01-10", quantity: 4 }] });

    const result = await importBrokerLedger(supabase as never, {
      householdId: HOUSEHOLD,
      accountId: ACCOUNT,
      fileName: "trading212-statement.pdf",
      ledger: ledger({
        partial: [partial({ heldEvidence: { asOf: "2025-06-30", shares: 20 }, shortfall: 16 })],
      }),
    });

    expect(result.conflicts).toEqual([]);
  });

  it("stays quiet when the extra shares were bought inside the dividend window", async () => {
    const supabase = seed({
      trades: [
        { date: "2025-01-10", quantity: 10 },
        { date: "2025-06-24", quantity: 8 },
      ],
    });

    const result = await importBrokerLedger(supabase as never, {
      householdId: HOUSEHOLD,
      accountId: ACCOUNT,
      fileName: "trading212-statement.pdf",
      ledger: ledger({
        partial: [partial({ heldEvidence: { asOf: "2025-06-30", shares: 10 } })],
      }),
    });

    expect(result.conflicts).toEqual([]);
  });

  it("names both files when two exports state the same day differently", async () => {
    const supabase = seed({
      evidence: {
        as_of: "2025-06-30",
        shares: 40,
        source: "trading212",
        file: "trading212-activity.csv",
      },
    });

    const result = await importBrokerLedger(supabase as never, {
      householdId: HOUSEHOLD,
      accountId: ACCOUNT,
      fileName: "trading212-statement.pdf",
      ledger: ledger({
        partial: [partial({ heldEvidence: { asOf: "2025-06-30", shares: 55 } })],
      }),
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.message).toContain("trading212-activity.csv");
    expect(result.conflicts[0]!.message).toContain("trading212-statement.pdf");
    expect(result.conflicts[0]!.sources).toHaveLength(2);
  });

  it("keeps the file behind the evidence, so the next export can name it", async () => {
    const supabase = seed();

    await importBrokerLedger(supabase as never, {
      householdId: HOUSEHOLD,
      accountId: ACCOUNT,
      fileName: "trading212-activity.csv",
      ledger: ledger({
        trades: [trade()],
        partial: [partial({ heldEvidence: { asOf: "2025-06-30", shares: 9 }, shortfall: 7 })],
      }),
    });

    const holding = supabase.tables["holdings"]![0]!;
    expect(holding["position_evidence"]).toMatchObject({
      as_of: "2025-06-30",
      shares: 9,
      file: "trading212-activity.csv",
    });
  });

  it("ignores the same ticker held at another broker", async () => {
    const supabase = seed({ trades: [{ date: "2025-01-10", quantity: 30 }] });
    // The same holding, but those shares sit in a different account.
    supabase.tables["trades"]![0]!["account_id"] = "acc-elsewhere";

    const result = await importBrokerLedger(supabase as never, {
      householdId: HOUSEHOLD,
      accountId: ACCOUNT,
      fileName: "trading212-statement.pdf",
      ledger: ledger({
        partial: [partial({ heldEvidence: { asOf: "2025-06-30", shares: 12 }, shortfall: 12 })],
      }),
    });

    expect(result.conflicts).toEqual([]);
  });
});
