import { describe, expect, it } from "vitest";
import { chooseProposal, fingerprintPrefix, type ExistingProposal } from "./proposal-key";

const proposal = (fingerprint: string, id = fingerprint): ExistingProposal => ({
  id,
  fingerprint,
  currency: fingerprint.slice(fingerprint.lastIndexOf("|") + 1) || null,
});

describe("fingerprintPrefix", () => {
  it("drops the currency, which is the weakest part of the key", () => {
    expect(fingerprintPrefix("natwest|l4:4821|GBP")).toBe("natwest|l4:4821");
    expect(fingerprintPrefix("natwest|l4:4821|")).toBe("natwest|l4:4821");
  });
});

describe("chooseProposal", () => {
  it("joins the same key when the file states the same currency", () => {
    const existing = [proposal("natwest|l4:4821|GBP")];
    const choice = chooseProposal({
      fingerprint: "natwest|l4:4821|GBP",
      currency: "GBP",
      existing,
    });

    expect(choice.match?.id).toBe("natwest|l4:4821|GBP");
    expect(choice.fingerprint).toBe("natwest|l4:4821|GBP");
  });

  it("absorbs a file whose currency could not be read into the account it names", () => {
    const choice = chooseProposal({
      fingerprint: "natwest|l4:4821|",
      currency: null,
      existing: [proposal("natwest|l4:4821|GBP")],
    });

    // The second NatWest statement joins the first instead of forking a proposal.
    expect(choice.match?.id).toBe("natwest|l4:4821|GBP");
    expect(choice.fingerprint).toBe("natwest|l4:4821|GBP");
  });

  it("upgrades a currency-less proposal once a later file states one", () => {
    const choice = chooseProposal({
      fingerprint: "natwest|l4:4821|GBP",
      currency: "GBP",
      existing: [proposal("natwest|l4:4821|")],
    });

    expect(choice.match?.id).toBe("natwest|l4:4821|");
    expect(choice.fingerprint).toBe("natwest|l4:4821|GBP");
  });

  it("keeps two real currencies apart", () => {
    const choice = chooseProposal({
      fingerprint: "wise|l4:1234|EUR",
      currency: "EUR",
      existing: [proposal("wise|l4:1234|GBP"), proposal("wise|l4:1234|USD")],
    });

    expect(choice.match).toBeNull();
    expect(choice.fingerprint).toBe("wise|l4:1234|EUR");
  });

  it("refuses to guess when a currency-less file could join either of two accounts", () => {
    const choice = chooseProposal({
      fingerprint: "wise|l4:1234|",
      currency: null,
      existing: [proposal("wise|l4:1234|GBP"), proposal("wise|l4:1234|USD")],
    });

    expect(choice.match).toBeNull();
  });

  it("never pools files that name neither a bank nor an account number", () => {
    const choice = chooseProposal({
      fingerprint: "unknown|noid|GBP",
      currency: "GBP",
      existing: [proposal("unknown|noid|")],
    });

    expect(choice.match).toBeNull();
    expect(choice.fingerprint).toBe("unknown|noid|GBP");
  });

  it("starts a proposal when nothing on file resembles the statement", () => {
    const choice = chooseProposal({
      fingerprint: "monzo|noid|GBP",
      currency: "GBP",
      existing: [proposal("natwest|l4:4821|GBP")],
    });

    expect(choice.match).toBeNull();
  });
});
