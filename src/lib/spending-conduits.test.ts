import { describe, expect, it } from "vitest";
import type { TransactionRow } from "@/hooks/useTransactions";
import { conduitIds, type ConduitAccount } from "./import/conduits";
import { flowSummary, monthlyTotals } from "./spending";

const wise: ConduitAccount = { id: "wise", institution: "Wise", nickname: "Wise GBP" };
const monzo: ConduitAccount = { id: "monzo", institution: "Monzo", nickname: "Monzo Current" };

type Row = Partial<TransactionRow> & { id: string };

function row(partial: Row): TransactionRow {
  return {
    account_id: "wise",
    booked_date: "2026-03-04",
    amount: 100,
    amount_base: null,
    currency: "GBP",
    direction: "credit",
    description: "",
    merchant: null,
    category_id: null,
    is_transfer: false,
    ...partial,
  } as TransactionRow;
}

/** Marks the rows the conduit rules recognise, exactly as the importer does. */
function withConduits(rows: TransactionRow[], accounts: ConduitAccount[]): TransactionRow[] {
  const internal = conduitIds(
    rows.map((r) => ({
      id: r.id,
      account_id: (r as unknown as { account_id: string | null }).account_id ?? null,
      booked_date: r.booked_date,
      amount: Number(r.amount),
      amount_base: r.amount_base,
      direction: r.direction,
      merchant: r.merchant,
      description: r.description,
    })),
    accounts,
  );
  return rows.map((r) => (internal.has(r.id) ? { ...r, is_transfer: true } : r));
}

const toBase = (amount: number) => amount;

describe("money passing through Wise is not income", () => {
  it("£1,000 in and £1,000 out gives true income 0 and gross in 1,000", () => {
    const rows = withConduits(
      [
        row({ id: "in", amount: 1000, direction: "credit", booked_date: "2026-03-04" }),
        row({ id: "out", amount: 1000, direction: "debit", booked_date: "2026-03-06" }),
      ],
      [wise, monzo],
    );

    const flows = flowSummary(monthlyTotals(rows, [], toBase, ["2026-03"]));
    expect(flows.true_income).toBe(0);
    expect(flows.true_spending).toBe(0);
    expect(flows.gross_in).toBe(1000);
    expect(flows.gross_out).toBe(1000);
  });

  it("money that arrived from outside and stayed is still income", () => {
    const rows = withConduits(
      [row({ id: "pay", account_id: "monzo", amount: 4200, direction: "credit" })],
      [wise, monzo],
    );
    const flows = flowSummary(monthlyTotals(rows, [], toBase, ["2026-03"]));
    expect(flows.true_income).toBe(4200);
    expect(flows.gross_in).toBe(4200);
  });

  it("a Flex repayment nets out while the purchase on Flex is still spending once", () => {
    const flex: ConduitAccount = { id: "flex", institution: "Monzo", nickname: "Monzo Flex" };
    const rows = withConduits(
      [
        row({ id: "purchase", account_id: "flex", amount: 240, direction: "debit", description: "ZARA" }),
        row({
          id: "repayment",
          account_id: "flex",
          amount: 240,
          direction: "credit",
          description: "Flex repayment",
          booked_date: "2026-03-20",
        }),
      ],
      [flex, monzo],
    );

    const flows = flowSummary(monthlyTotals(rows, [], toBase, ["2026-03"]));
    expect(flows.true_income).toBe(0);
    expect(flows.true_spending).toBe(240);
    expect(flows.gross_in).toBe(240);
    expect(flows.gross_out).toBe(240);
  });
});
