import { describe, expect, it } from "vitest";

import { looksLikeMonzo, parseMonzo } from "./monzo.server";

const HEADER = [
  "Transaction ID",
  "Date",
  "Time",
  "Type",
  "Name",
  "Emoji",
  "Category",
  "Amount",
  "Currency",
  "Local amount",
  "Local currency",
  "Notes and #tags",
  "Address",
  "Receipt",
  "Description",
  "Category split",
  "Money Out",
  "Money In",
];

type Row = {
  id: string;
  date: string;
  type: string;
  name?: string;
  category: string;
  amount: string;
  currency?: string;
  localAmount?: string;
  localCurrency?: string;
  notes?: string;
  description?: string;
};

function row(input: Row): string[] {
  const currency = input.currency ?? "GBP";
  const amount = Number(input.amount);
  return [
    input.id,
    input.date,
    "12:00:00",
    input.type,
    input.name ?? "",
    "",
    input.category,
    input.amount,
    currency,
    input.localAmount ?? input.amount,
    input.localCurrency ?? currency,
    input.notes ?? "",
    "",
    "",
    input.description ?? input.name ?? "",
    "",
    amount < 0 ? Math.abs(amount).toFixed(2) : "",
    amount > 0 ? amount.toFixed(2) : "",
  ];
}

const CURRENT = [
  HEADER,
  row({
    id: "tx_current_salary",
    date: "28/02/2026",
    type: "Faster payment",
    name: "Zeal Payroll",
    category: "Income",
    amount: "6200.00",
  }),
  row({
    id: "tx_current_shop",
    date: "01/03/2026",
    type: "Card payment",
    name: "Tesco",
    category: "Groceries",
    amount: "-42.10",
  }),
  row({
    id: "tx_current_abroad",
    date: "02/03/2026",
    type: "Card payment",
    name: "Hotel Amalfi",
    category: "Holidays",
    amount: "-85.00",
    localAmount: "-99.32",
    localCurrency: "EUR",
  }),
  row({
    id: "tx_current_repay",
    date: "05/03/2026",
    type: "Flex",
    category: "Transfers",
    amount: "-120.00",
    description: "Flex repayment",
  }),
  row({
    id: "tx_current_direct_debit",
    date: "06/03/2026",
    type: "Direct Debit",
    name: "Thames Water",
    category: "Bills",
    amount: "-38.00",
  }),
];

const FLEX = [
  HEADER,
  row({
    id: "tx_flex_purchase",
    date: "20/02/2026",
    type: "Card payment",
    name: "Apple",
    category: "Shopping",
    amount: "-499.00",
    notes: "Paid for by Flex",
  }),
  row({
    id: "tx_flex_repay",
    date: "05/03/2026",
    type: "Flex",
    category: "Transfers",
    amount: "120.00",
    description: "Flex repayment",
  }),
];

describe("looksLikeMonzo", () => {
  it("recognises the export by its own two columns", () => {
    expect(looksLikeMonzo(CURRENT)).toBe(true);
  });

  it("does not claim a file that only shares a Date column", () => {
    expect(looksLikeMonzo([["Date", "Description", "Amount"], ["01/03/2026", "Tesco", "-42.10"]])).toBe(
      false,
    );
  });
});

describe("parseMonzo — the current account", () => {
  const result = parseMonzo(CURRENT);

  it("reads it as the current account, not the credit line", () => {
    expect(result.meta.identity.account_type).toBe("current");
    expect(result.meta.identity.ledger ?? null).toBeNull();
    expect(result.meta.identity.institution).toBe("Monzo");
  });

  it("keeps every row and dates them day-first", () => {
    expect(result.transactions).toHaveLength(5);
    expect(result.skippedRows).toBe(0);
    expect(result.meta.period_start).toBe("2026-02-28");
    expect(result.meta.period_end).toBe("2026-03-06");
  });

  it("signs money out as a debit and money in as a credit", () => {
    const salary = result.transactions.find((t) => t.bank_reference === "tx_current_salary");
    const shop = result.transactions.find((t) => t.bank_reference === "tx_current_shop");
    expect(salary).toMatchObject({ direction: "credit", amount: 6200 });
    expect(shop).toMatchObject({ direction: "debit", amount: 42.1, merchant: "Tesco" });
  });

  it("keeps what was actually spent abroad", () => {
    const abroad = result.transactions.find((t) => t.bank_reference === "tx_current_abroad");
    expect(abroad).toMatchObject({
      amount: 85,
      currency: "GBP",
      original_amount: 99.32,
      original_currency: "EUR",
    });
    expect(abroad?.fx_rate).toBeCloseTo(1.168471, 5);
  });

  it("marks the repayment to the credit line as internal, not spending", () => {
    const repay = result.transactions.find((t) => t.bank_reference === "tx_current_repay");
    expect(repay?.internal).toBe(true);
    expect(repay?.direction).toBe("debit");
  });

  it("leaves ordinary card spending alone", () => {
    const shop = result.transactions.find((t) => t.bank_reference === "tx_current_shop");
    expect(shop?.internal).toBeFalsy();
  });

  it("files rows by the household's own Monzo category where it maps", () => {
    const byRef = (ref: string) => result.transactions.find((t) => t.bank_reference === ref);
    expect(byRef("tx_current_shop")?.category_hint).toBe("Groceries");
    expect(byRef("tx_current_abroad")?.category_hint).toBe("Travel");
    expect(byRef("tx_current_direct_debit")?.category_hint).toBe("Utilities");
    // "Income" has no unambiguous counterpart — a salary and a refund both land
    // there, so it is left to the rules and the categoriser.
    expect(byRef("tx_current_salary")?.category_hint ?? null).toBeNull();
  });

  it("states no balance it cannot prove", () => {
    expect(result.meta.opening_balance).toBeNull();
    expect(result.meta.closing_balance).toBeNull();
    expect(result.exactBalances).toBe(false);
  });
});

describe("parseMonzo — the Flex credit line", () => {
  const result = parseMonzo(FLEX);

  it("is told apart from the current account by its contents", () => {
    expect(result.meta.identity.ledger).toBe("flex");
    expect(result.meta.identity.account_type).toBe("credit_card");
  });

  it("recognises a Flex export with no note, by what it lacks", () => {
    const quiet = [
      HEADER,
      row({
        id: "tx_flex_quiet",
        date: "20/02/2026",
        type: "Card payment",
        name: "Apple",
        category: "Shopping",
        amount: "-499.00",
      }),
      row({
        id: "tx_flex_quiet_repay",
        date: "05/03/2026",
        type: "Flex",
        category: "Transfers",
        amount: "120.00",
      }),
    ];
    expect(parseMonzo(quiet).meta.identity.ledger).toBe("flex");
  });

  it("does not mistake a current account holding one Flex repayment for the credit line", () => {
    expect(parseMonzo(CURRENT).meta.identity.ledger ?? null).toBeNull();
  });

  it("treats money arriving from the current account as internal, not income", () => {
    const repay = result.transactions.find((t) => t.bank_reference === "tx_flex_repay");
    expect(repay).toMatchObject({ direction: "credit", internal: true });
  });

  it("derives the balance from a line that opens at nothing", () => {
    expect(result.meta.opening_balance).toBe(0);
    expect(result.meta.closing_balance).toBe(-379);
    expect(result.notes.join(" ")).toContain("opens at zero");
  });

  it("carries the household's own note on the row", () => {
    const purchase = result.transactions.find((t) => t.bank_reference === "tx_flex_purchase");
    expect(purchase?.notes).toBe("Paid for by Flex");
  });
});

describe("parseMonzo — Flex is financing, not a shop", () => {
  it("marks a drawdown onto the credit line as financing even when it names a merchant", () => {
    const drawdown = parseMonzo([
      HEADER,
      row({
        id: "tx_current_drawdown",
        date: "20/02/2026",
        type: "Flex",
        name: "Apple",
        category: "Shopping",
        amount: "499.00",
      }),
      row({
        id: "tx_current_shop",
        date: "21/02/2026",
        type: "Card payment",
        name: "Tesco",
        category: "Groceries",
        amount: "-42.10",
      }),
    ]);
    const byRef = (ref: string) =>
      drawdown.transactions.find((t) => t.bank_reference === ref);
    // The purchase itself already sits on the Flex ledger. Counting the money
    // arriving back in the current account as income would invent £499.
    expect(byRef("tx_current_drawdown")).toMatchObject({ direction: "credit", internal: true });
    expect(byRef("tx_current_shop")?.internal).toBeFalsy();
  });

  it("keeps a purchase that happens to sit on the Flex line as real spending", () => {
    const onFlex = parseMonzo([
      HEADER,
      row({
        id: "tx_flex_apple",
        date: "20/02/2026",
        type: "Flex",
        name: "Apple",
        category: "Shopping",
        amount: "-499.00",
      }),
      row({
        id: "tx_flex_instalment",
        date: "05/03/2026",
        type: "Flex",
        category: "Transfers",
        amount: "120.00",
      }),
      row({
        id: "tx_flex_named_repay",
        date: "05/04/2026",
        type: "Flex",
        name: "Monzo Flex",
        category: "Transfers",
        amount: "120.00",
      }),
    ]);
    const byRef = (ref: string) => onFlex.transactions.find((t) => t.bank_reference === ref);
    expect(byRef("tx_flex_apple")?.internal).toBeFalsy();
    expect(byRef("tx_flex_apple")?.merchant).toBe("Apple");
    expect(byRef("tx_flex_instalment")?.internal).toBe(true);
    expect(byRef("tx_flex_named_repay")?.internal).toBe(true);
  });

  it("says in the notes that the purchases on the line are still counted once", () => {
    const onFlex = parseMonzo([
      HEADER,
      row({
        id: "tx_flex_apple",
        date: "20/02/2026",
        type: "Flex",
        name: "Apple",
        category: "Shopping",
        amount: "-499.00",
      }),
      row({
        id: "tx_flex_instalment",
        date: "05/03/2026",
        type: "Flex",
        category: "Transfers",
        amount: "120.00",
      }),
    ]);
    expect(onFlex.notes.join(" ")).toContain("count as spending, once");
  });
});
