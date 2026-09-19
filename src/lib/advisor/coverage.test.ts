import { describe, expect, it } from "vitest";
import {
  buildCoverage,
  cleanGaps,
  NO_HOUSING_GAP,
  NO_SALARY_GAP,
  type CoverageAccountInput,
} from "./coverage";

function account(partial: Partial<CoverageAccountInput> & { id: string }): CoverageAccountInput {
  return {
    label: partial.id,
    currency: "GBP",
    balanceKnown: true,
    firstTransaction: "2024-09-01",
    lastTransaction: "2026-03-01",
    transactionCount: 120,
    ...partial,
  };
}

describe("coverage", () => {
  it("reports each account's first and last transaction and whether the balance is known", () => {
    const coverage = buildCoverage({
      accounts: [
        account({ id: "monzo", label: "Monzo Current" }),
        account({
          id: "wise",
          label: "Wise USD",
          balanceKnown: false,
          firstTransaction: "2025-01-04",
          lastTransaction: "2025-08-30",
          transactionCount: 460,
        }),
      ],
      declaredGaps: [],
      salaryCredits: 4,
      housingPayments: 12,
    });

    expect(coverage.accounts[0]).toMatchObject({
      label: "Monzo Current",
      balance_known: true,
      first_transaction: "2024-09-01",
      last_transaction: "2026-03-01",
    });
    expect(coverage.accounts[1]).toMatchObject({ label: "Wise USD", balance_known: false });
    expect(coverage.known_gaps).toEqual(["one account has no stated balance"]);
  });

  it("names the automatic gaps when no salary and no housing payment appear anywhere", () => {
    const coverage = buildCoverage({
      accounts: [account({ id: "monzo" })],
      declaredGaps: [],
      salaryCredits: 0,
      housingPayments: 0,
    });
    expect(coverage.known_gaps).toContain(NO_SALARY_GAP);
    expect(coverage.known_gaps).toContain(NO_HOUSING_GAP);
  });

  it("claims no automatic gap when nothing has been imported at all", () => {
    const coverage = buildCoverage({
      accounts: [account({ id: "monzo", transactionCount: 0, firstTransaction: null, lastTransaction: null })],
      declaredGaps: [],
      salaryCredits: 0,
      housingPayments: 0,
    });
    expect(coverage.known_gaps).not.toContain(NO_SALARY_GAP);
    expect(coverage.known_gaps).not.toContain(NO_HOUSING_GAP);
  });

  it("carries the household's own notes through, deduplicated and untouched", () => {
    const coverage = buildCoverage({
      accounts: [account({ id: "monzo" })],
      declaredGaps: ["  Haya's NatWest savings is not uploaded ", "Haya's NatWest savings is not uploaded", "", null],
      salaryCredits: 2,
      housingPayments: 2,
    });
    expect(coverage.known_gaps).toEqual(["Haya's NatWest savings is not uploaded"]);
  });

  it("keeps the note that the context is not necessarily complete", () => {
    const coverage = buildCoverage({
      accounts: [],
      declaredGaps: [],
      salaryCredits: 1,
      housingPayments: 1,
    });
    expect(coverage.note).toMatch(/not necessarily everything/i);
    expect(cleanGaps(undefined)).toEqual([]);
  });
});
