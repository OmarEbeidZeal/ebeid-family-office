/**
 * Confirming a proposal by hand is still a decision the app checks.
 *
 * Production merged Monzo Flex spending and Trading 212 ISA trades into one
 * general investment account because a manual link asked nothing of the two
 * sides before joining them.
 */
import { describe, expect, it } from "vitest";
import { linkRefusal } from "./proposals.server";

const proposal = (over: Record<string, unknown> = {}) => ({
  institution: "Trading 212",
  currency: "GBP",
  account_type: "isa",
  nickname: "Trading 212 ISA",
  ...over,
});

const account = (over: Record<string, unknown> = {}) => ({
  nickname: "Trading 212 ISA",
  institution: "Trading 212",
  currency: "GBP",
  account_type: "isa",
  ...over,
});

describe("linking statements to an account by hand", () => {
  it("allows the link when bank, currency and kind all agree", () => {
    expect(linkRefusal(proposal(), account())).toBeNull();
  });

  it("refuses a different bank", () => {
    const refusal = linkRefusal(proposal(), account({ institution: "Monzo", nickname: "Monzo" }));
    expect(refusal).toContain("Trading 212");
    expect(refusal).toContain("Monzo");
  });

  it("refuses a different currency", () => {
    const refusal = linkRefusal(proposal({ currency: "USD" }), account());
    expect(refusal).toContain("USD");
  });

  it("refuses investments into a credit line", () => {
    const refusal = linkRefusal(
      proposal(),
      account({ nickname: "Monzo Flex", institution: "Trading 212", account_type: "credit_card" }),
    );
    expect(refusal).toContain("Monzo Flex");
  });

  it("refuses cash into an investment account", () => {
    expect(
      linkRefusal(proposal({ institution: "Monzo", account_type: "current" }), account({ institution: "Monzo" })),
    ).not.toBeNull();
  });

  it("never lets an invented nickname pass as the bank", () => {
    // Two accounts the app named itself are not "the same bank".
    expect(
      linkRefusal(
        proposal({ institution: "Imported account", account_type: "current" }),
        account({ institution: "Imported account", account_type: "credit_card" }),
      ),
    ).not.toBeNull();
  });
});
