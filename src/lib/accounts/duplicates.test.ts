import { describe, expect, it } from "vitest";
import { findDuplicateAccounts, type DuplicateCandidate } from "./duplicates";

const account = (overrides: Partial<DuplicateCandidate> & { id: string }): DuplicateCandidate => ({
  nickname: overrides.id,
  institution: "National Westminster Bank Plc",
  institution_domain: "natwest.com",
  currency: "GBP",
  account_type: "current",
  is_active: true,
  ...overrides,
});

describe("findDuplicateAccounts", () => {
  it("pairs the household's two unidentified NatWest current accounts", () => {
    const groups = findDuplicateAccounts([
      account({ id: "a", nickname: "NatWest Current", statements: 2 }),
      account({ id: "b", nickname: "NatWest Current", statements: 1 }),
    ]);

    expect(groups).toHaveLength(1);
    // The row with more statements behind it is offered as the one to keep.
    expect(groups[0]!.accounts.map((row) => row.id)).toEqual(["a", "b"]);
    expect(groups[0]!.reason).toContain("none of which printed an account number");
  });

  it("leaves accounts alone when the printed digits differ", () => {
    const groups = findDuplicateAccounts([
      account({ id: "a", identifier_mask: "•••• 9503" }),
      account({ id: "b", identifier_mask: "•••• 4994" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("flags two rows that print the same digits", () => {
    const groups = findDuplicateAccounts([
      account({ id: "a", identifier_mask: "•••• 9503", statements: 1 }),
      account({ id: "b", identifier_mask: "9503", statements: 4 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.accounts[0]!.id).toBe("b");
    expect(groups[0]!.reason).toContain("9503");
  });

  it("never pairs rows whose bank is unknown", () => {
    const groups = findDuplicateAccounts([
      account({ id: "a", institution: null, institution_domain: null }),
      account({ id: "b", institution: null, institution_domain: null }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("keeps different currencies and different types apart", () => {
    const groups = findDuplicateAccounts([
      account({ id: "gbp", currency: "GBP" }),
      account({ id: "usd", currency: "USD" }),
      account({ id: "savings", account_type: "savings" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("ignores closed accounts", () => {
    const groups = findDuplicateAccounts([
      account({ id: "a" }),
      account({ id: "b", is_active: false }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("does not guess when one row is masked and another is not", () => {
    const groups = findDuplicateAccounts([
      account({ id: "masked", identifier_mask: "•••• 1234" }),
      account({ id: "plain" }),
    ]);
    expect(groups).toHaveLength(0);
  });
});
