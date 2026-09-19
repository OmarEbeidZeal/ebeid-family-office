import { describe, expect, it } from "vitest";
import {
  allowedIncomeCategoryId,
  conduitIds,
  flexConduitIds,
  isFlexAccount,
  isWiseAccount,
  wiseConduitIds,
  type ConduitAccount,
  type ConduitRow,
} from "./conduits";

const wise: ConduitAccount = { id: "wise", institution: "Wise", nickname: "Wise GBP" };
const flex: ConduitAccount = {
  id: "flex",
  institution: "Monzo",
  nickname: "Monzo Flex",
  account_type: "credit_card",
};
const current: ConduitAccount = { id: "monzo", institution: "Monzo", nickname: "Monzo Current" };

function row(partial: Partial<ConduitRow> & { id: string }): ConduitRow {
  return {
    account_id: "wise",
    booked_date: "2026-03-01",
    amount: 100,
    direction: "credit",
    ...partial,
  };
}

describe("recognising the conduits", () => {
  it("knows Flex from the current account it sits beside", () => {
    expect(isFlexAccount(flex)).toBe(true);
    expect(isFlexAccount(current)).toBe(false);
  });

  it("knows Wise under either spelling", () => {
    expect(isWiseAccount(wise)).toBe(true);
    expect(isWiseAccount({ id: "x", institution: "TransferWise" })).toBe(true);
    expect(isWiseAccount(current)).toBe(false);
  });
});

describe("Monzo Flex", () => {
  const rows = [
    row({ id: "purchase", account_id: "flex", direction: "debit", amount: 240, description: "ZARA" }),
    row({ id: "repayment", account_id: "flex", direction: "credit", amount: 240, description: "Repayment" }),
    row({ id: "interest", account_id: "flex", direction: "credit", amount: 4.1, description: "Flex interest" }),
  ];

  it("treats a repayment arriving on Flex as internal, so Flex nets to zero in income", () => {
    const internal = flexConduitIds(rows, [flex, current]);
    expect(internal.has("repayment")).toBe(true);
  });

  it("leaves the purchase as spending, counted once on the Flex ledger", () => {
    expect(flexConduitIds(rows, [flex, current]).has("purchase")).toBe(false);
  });

  it("never nets off interest or a fee", () => {
    expect(flexConduitIds(rows, [flex, current]).has("interest")).toBe(false);
  });
});

describe("Wise as a pipe", () => {
  it("£1,000 in and £1,000 out is money passing through, both legs internal", () => {
    const rows = [
      row({ id: "in", amount: 1000, direction: "credit", booked_date: "2026-03-01" }),
      row({ id: "out", amount: 1000, direction: "debit", booked_date: "2026-03-03" }),
    ];
    const internal = wiseConduitIds(rows, [wise]);
    expect([...internal].sort()).toEqual(["in", "out"]);
  });

  it("allows for the conversion spread but not for a different sum", () => {
    const converted = wiseConduitIds(
      [
        row({ id: "in", amount: 1000, direction: "credit", booked_date: "2026-03-01" }),
        row({ id: "out", amount: 978.4, direction: "debit", booked_date: "2026-03-02" }),
      ],
      [wise],
    );
    expect(converted.size).toBe(2);

    const unrelated = wiseConduitIds(
      [
        row({ id: "in", amount: 1000, direction: "credit", booked_date: "2026-03-01" }),
        row({ id: "out", amount: 120, direction: "debit", booked_date: "2026-03-02" }),
      ],
      [wise],
    );
    expect(unrelated.size).toBe(0);
  });

  it("money that arrived and stayed is not a conduit", () => {
    const internal = wiseConduitIds(
      [row({ id: "in", amount: 1000, direction: "credit", booked_date: "2026-03-01" })],
      [wise],
    );
    expect(internal.size).toBe(0);
  });

  it("one payment out cannot absolve two payments in", () => {
    const internal = wiseConduitIds(
      [
        row({ id: "in1", amount: 500, direction: "credit", booked_date: "2026-03-01" }),
        row({ id: "in2", amount: 500, direction: "credit", booked_date: "2026-03-02" }),
        row({ id: "out", amount: 500, direction: "debit", booked_date: "2026-03-03" }),
      ],
      [wise],
    );
    expect(internal.size).toBe(2);
  });

  it("leaves other banks alone", () => {
    const internal = conduitIds(
      [
        row({ id: "in", account_id: "monzo", amount: 1000, direction: "credit" }),
        row({ id: "out", account_id: "monzo", amount: 1000, direction: "debit", booked_date: "2026-03-02" }),
      ],
      [current],
    );
    expect(internal.size).toBe(0);
  });
});

describe("income categories", () => {
  it("a self-transfer can never be Salary", () => {
    expect(allowedIncomeCategoryId(true, "salary-category")).toBeNull();
    expect(allowedIncomeCategoryId(false, "salary-category")).toBe("salary-category");
  });
});
