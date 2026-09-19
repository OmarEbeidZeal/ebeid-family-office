/**
 * The NatWest reader, on the two things that were silently wrong in production:
 * the year a row belongs to, and the balance the page prints beside it.
 *
 * The fixture is written here rather than taken from the household's own file.
 * A real statement is not test data, and the layout is what is under test.
 */
import { describe, expect, it } from "vitest";
import { looksLikeNatWest, parseNatWest } from "./natwest.server";
import { normaliseIdentifier } from "./identity.server";

process.env["ACCOUNT_IDENTIFIER_SALT"] ??= "test-salt-for-hashing-only";

const STATEMENT = [
  "Transactions-01",
  "ABDIN HN",
  "Student/graduate",
  "Account details",
  "*****234 · 54-21-47",
  "From  31/08/2024  To  31/08/2025",
  "Date Description Type Paid in (£) Paid out (£) Balance (£)",
  "14 Oct TESCO STORESDebit Card Transaction -£40.00 £960.00",
  "02 Nov SALARYBank Credit £1,500.00 £2,460.00",
  "20 Dec HCA HEALTHCARE UKDebit Card Transaction -£140.74 £2,319.26",
].join("\n");

describe("a NatWest transactions PDF", () => {
  it("is recognised by its own layout", () => {
    expect(looksLikeNatWest(STATEMENT)).toBe(true);
  });

  it("dates a row printed without a year inside the statement period", () => {
    const result = parseNatWest(STATEMENT);
    const dates = result.transactions.map((row) => row.booked_date);

    // The period runs 31 Aug 2024 to 31 Aug 2025, so "14 Oct" is 2024 — the
    // year production filed a year late, dragging 66 rows into Sep–Dec 2025.
    expect(dates).toContain("2024-10-14");
    expect(dates).not.toContain("2025-10-14");
    expect(dates).toEqual(["2024-10-14", "2024-11-02", "2024-12-20"]);
  });

  it("leaves out a row that cannot be placed inside the period", () => {
    const outside = STATEMENT.replace(
      "From  31/08/2024  To  31/08/2025",
      "From  01/10/2024  To  31/10/2024",
    );
    const result = parseNatWest(outside);

    expect(result.transactions.map((row) => row.booked_date)).toEqual(["2024-10-14"]);
    // The two rows outside the period are counted, never filed to a guess.
    expect(result.skippedRows).toBe(2);
  });

  it("takes every balance from the printed running balance and reconciles", () => {
    const result = parseNatWest(STATEMENT);

    expect(result.transactions.map((row) => row.balance_after)).toEqual([960, 2460, 2319.26]);
    expect(result.meta.opening_balance).toBe(1000);
    expect(result.meta.closing_balance).toBe(2319.26);
    expect(result.exactBalances).toBe(true);
  });

  it("claims no balance when the export prints no balance column", () => {
    const noBalances = [
      "Transactions-01",
      "ABDIN HN",
      "Account details",
      "*****234 · 54-21-47",
      "From  31/08/2024  To  31/08/2025",
      "Date Description Type Paid in (£) Paid out (£)",
      "14 Oct TESCO STORESDebit Card Transaction -£40.00",
    ].join("\n");
    const result = parseNatWest(noBalances);

    expect(result.transactions[0]!.balance_after).toBeNull();
    expect(result.meta.opening_balance).toBeNull();
    expect(result.meta.closing_balance).toBeNull();
    expect(result.exactBalances).toBe(false);
  });

  it("identifies the account positively from the sort code and the masked tail", () => {
    const result = parseNatWest(STATEMENT);
    const identity = result.meta.identity!;

    expect(identity.institution).toBe("NatWest");
    expect(identity.statement_holder).toBe("ABDIN HN");
    expect(identity.account_identifier).toContain("54-21-47");

    const identifier = normaliseIdentifier(identity.account_identifier, identity.identifier_kind, {
      institution: identity.institution,
    })!;
    // A sort code with a tail is as good as an account number, so three years
    // of downloads land on one account rather than three.
    expect(identifier.positive).toBe(true);
  });
});
