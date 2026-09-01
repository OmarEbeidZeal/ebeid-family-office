import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { refileStatement, unfileStatement } from "./repair.server";

const HOUSEHOLD = "house-1";

/**
 * A household part-way through the mess these repairs exist for: one account
 * pooling a credit-card export and a broker export, and a second account that
 * the broker export should have landed on.
 */
function household() {
  return fakeSupabase({
    accounts: [
      {
        id: "pooled",
        household_id: HOUSEHOLD,
        nickname: "Imported account",
        currency: "GBP",
        account_type: "investment",
        balance_source: "statement",
        balance_statement_id: "flex",
        current_balance: -370.03,
        last_balance_update: "2026-08-31T23:59:59Z",
      },
      {
        id: "broker",
        household_id: HOUSEHOLD,
        nickname: "Trading 212",
        currency: "GBP",
        account_type: "investment",
        balance_source: "statement",
        balance_statement_id: null,
        current_balance: 0,
      },
    ],
    statements: [
      {
        id: "flex",
        household_id: HOUSEHOLD,
        account_id: "pooled",
        file_name: "monzo.csv",
        status: "parsed",
        currency: "GBP",
        closing_balance: -370.03,
        period_end: "2026-08-31",
        detected_institution: null,
        proposal_id: "anonymous",
        file_hash: "abc",
        transaction_count: 3,
      },
      {
        id: "orders",
        household_id: HOUSEHOLD,
        account_id: "pooled",
        file_name: "trading212.csv",
        status: "parsed",
        currency: "GBP",
        closing_balance: 120,
        period_end: "2026-08-21",
        proposal_id: "anonymous",
        transaction_count: 1,
      },
    ],
    transactions: [
      { id: "t1", household_id: HOUSEHOLD, account_id: "pooled", statement_id: "flex", booked_date: "2026-08-01", import_fingerprint: "f1#1", amount: -20 },
      { id: "t2", household_id: HOUSEHOLD, account_id: "pooled", statement_id: "flex", booked_date: "2026-08-02", import_fingerprint: "f2#1", amount: -30 },
      { id: "t3", household_id: HOUSEHOLD, account_id: "pooled", statement_id: "flex", booked_date: "2026-08-03", import_fingerprint: "f3#1", amount: 50 },
      { id: "t4", household_id: HOUSEHOLD, account_id: "pooled", statement_id: "orders", booked_date: "2026-08-04", import_fingerprint: "f4#1", amount: -100 },
    ],
    holdings: [
      {
        id: "h-import",
        household_id: HOUSEHOLD,
        account_id: "pooled",
        ticker: "LUNR",
        discovered_from: "statement",
        opening_quantity: 4,
        opening_cost: null,
        position_evidence: { as_of: "2025-10-01", shares: 4 },
      },
      {
        id: "h-manual",
        household_id: HOUSEHOLD,
        account_id: "pooled",
        ticker: "VWRP",
        discovered_from: "manual",
        opening_quantity: 10,
        opening_cost: null,
        position_evidence: { as_of: "2025-10-01", shares: 10 },
      },
    ],
    trades: [
      { id: "tr1", household_id: HOUSEHOLD, holding_id: "h-import", account_id: "pooled", statement_id: "orders", side: "buy", trade_date: "2026-01-02", quantity: 2, price: 9 },
      { id: "tr2", household_id: HOUSEHOLD, holding_id: "h-manual", account_id: "pooled", statement_id: "orders", side: "buy", trade_date: "2026-01-03", quantity: 1, price: 100 },
      { id: "tr3", household_id: HOUSEHOLD, holding_id: "h-manual", account_id: "pooled", statement_id: null, side: "buy", trade_date: "2025-05-05", quantity: 3, price: 90 },
    ],
  });
}

describe("starting a file over", () => {
  it("removes only what that file imported", async () => {
    const db = household();
    const result = await unfileStatement(db as never, {
      householdId: HOUSEHOLD,
      statementId: "flex",
    });

    expect(result.removed).toBe(3);
    expect(result.accountNickname).toBe("Imported account");
    expect(db.tables["transactions"]!.map((row) => row["id"])).toEqual(["t4"]);
  });

  it("sends the file back to the queue with nothing assumed about it", async () => {
    const db = household();
    await unfileStatement(db as never, { householdId: HOUSEHOLD, statementId: "flex" });

    const statement = db.tables["statements"]!.find((row) => row["id"] === "flex")!;
    expect(statement["status"]).toBe("queued");
    expect(statement["account_id"]).toBeNull();
    expect(statement["proposal_id"]).toBeNull();
    // The fingerprint is what stops a file being imported twice; clearing it is
    // what lets the same file be read again.
    expect(statement["file_hash"]).toBeNull();
    expect(statement["transaction_count"]).toBeNull();
    expect(statement["closing_balance"]).toBeNull();
  });

  it("takes the balance with the file, and finds the next best one", async () => {
    const db = household();
    await unfileStatement(db as never, { householdId: HOUSEHOLD, statementId: "flex" });

    const account = db.tables["accounts"]!.find((row) => row["id"] === "pooled")!;
    // The broker export is the only statement left on the account, so its
    // closing balance is the honest figure now.
    expect(account["balance_statement_id"]).toBe("orders");
    expect(account["current_balance"]).toBe(120);
  });

  it("marks the balance unknown when no statement is left to supply one", async () => {
    const db = household();
    await unfileStatement(db as never, { householdId: HOUSEHOLD, statementId: "flex" });
    await unfileStatement(db as never, { householdId: HOUSEHOLD, statementId: "orders" });

    const account = db.tables["accounts"]!.find((row) => row["id"] === "pooled")!;
    expect(account["balance_source"]).toBe("unknown");
    expect(account["balance_statement_id"]).toBeNull();
    expect(account["current_balance"]).toBe(0);
  });

  it("takes back the orders the file wrote, and the positions only it knew about", async () => {
    const db = household();
    const result = await unfileStatement(db as never, {
      householdId: HOUSEHOLD,
      statementId: "orders",
    });

    expect(result.trades).toBe(2);
    expect(result.holdingsRemoved).toBe(1);
    expect(db.tables["trades"]!.map((row) => row["id"])).toEqual(["tr3"]);

    // The position discovered in the file goes with the file.
    expect(db.tables["holdings"]!.some((row) => row["id"] === "h-import")).toBe(false);
    // The hand-entered one stays, still holding the trade that did not come
    // from this file.
    expect(db.tables["holdings"]!.some((row) => row["id"] === "h-manual")).toBe(true);
  });

  it("leaves a hand-entered position's own figures alone", async () => {
    const db = household();
    // Remove the trade that came from elsewhere, so the manual holding is left
    // with nothing after the file is undone.
    db.tables["trades"] = db.tables["trades"]!.filter((row) => row["id"] !== "tr3");

    await unfileStatement(db as never, { householdId: HOUSEHOLD, statementId: "orders" });

    const manual = db.tables["holdings"]!.find((row) => row["id"] === "h-manual")!;
    expect(manual["opening_quantity"]).toBe(0);
    expect(manual["position_evidence"]).toBeNull();
  });

  it("refuses a statement from another household", async () => {
    const db = household();
    await expect(
      unfileStatement(db as never, { householdId: "someone-else", statementId: "flex" }),
    ).rejects.toThrow(/not part of this household/);
  });
});

describe("moving a file to another account", () => {
  it("takes its orders and its positions with it", async () => {
    const db = household();
    const result = await refileStatement(db as never, {
      householdId: HOUSEHOLD,
      statementId: "orders",
      accountId: "broker",
    });

    expect(result.transactions).toBe(1);
    const moved = db.tables["trades"]!.filter((row) => row["account_id"] === "broker");
    expect(moved.map((row) => row["id"])).toEqual(["tr1", "tr2"]);

    // Every trade of the imported holding moved, so the holding moves too.
    const imported = db.tables["holdings"]!.find((row) => row["id"] === "h-import")!;
    expect(imported["account_id"]).toBe("broker");
    // The manual holding still has a trade on the old account, so it stays put
    // rather than being split across two.
    const manual = db.tables["holdings"]!.find((row) => row["id"] === "h-manual")!;
    expect(manual["account_id"]).toBe("pooled");
  });

  it("moves the transactions the file imported", async () => {
    const db = household();
    await refileStatement(db as never, {
      householdId: HOUSEHOLD,
      statementId: "orders",
      accountId: "broker",
    });

    const moved = db.tables["transactions"]!.find((row) => row["id"] === "t4")!;
    expect(moved["account_id"]).toBe("broker");
    expect(db.tables["statements"]!.find((row) => row["id"] === "orders")!["account_id"]).toBe(
      "broker",
    );
  });
});
