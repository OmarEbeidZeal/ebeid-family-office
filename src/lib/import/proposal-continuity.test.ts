import { describe, expect, it } from "vitest";
import { chooseProposal } from "./proposal-key";
import { proposalFingerprint } from "./identity.server";

/**
 * Two files with no account number on either are two accounts until the rows
 * prove otherwise. This is the rule that kept Haya's and Omar's nameless
 * Trading 212 exports apart, and Monzo current apart from Monzo Flex.
 */
describe("nameless files never pool into one proposal without proof", () => {
  it("keeps two nameless broker exports apart even on the same key", () => {
    const fingerprint = proposalFingerprint({
      institution: "Trading 212",
      identifierHash: null,
      lastFour: null,
      currency: "GBP",
      holder: null,
    });
    const choice = chooseProposal({
      fingerprint,
      currency: "GBP",
      existing: [{ id: "p1", fingerprint, currency: "GBP" }],
    });
    expect(choice.match).toBeNull();
  });

  it("joins the existing proposal when the ledger and holder both match", () => {
    const fingerprint = proposalFingerprint({
      institution: "Monzo",
      identifierHash: null,
      lastFour: null,
      currency: "GBP",
      ledger: "current",
      holder: "Omar Ebeid",
    });
    const choice = chooseProposal({
      fingerprint,
      currency: "GBP",
      existing: [{ id: "p1", fingerprint, currency: "GBP" }],
    });
    expect(choice.match?.id).toBe("p1");
  });

  it("joins when the caller proved continuity from overlapping transaction ids", () => {
    const fingerprint = proposalFingerprint({
      institution: "Trading 212",
      identifierHash: null,
      lastFour: null,
      currency: "GBP",
      holder: null,
    });
    const choice = chooseProposal({
      fingerprint,
      currency: "GBP",
      existing: [{ id: "p1", fingerprint, currency: "GBP" }],
      continuity: true,
    });
    expect(choice.match?.id).toBe("p1");
  });

  it("keeps Monzo current and Monzo Flex as two proposals", () => {
    const current = proposalFingerprint({
      institution: "Monzo",
      identifierHash: null,
      lastFour: null,
      currency: "GBP",
      ledger: "current",
      holder: "Omar Ebeid",
    });
    const flex = proposalFingerprint({
      institution: "Monzo",
      identifierHash: null,
      lastFour: null,
      currency: "GBP",
      ledger: "flex",
      holder: "Omar Ebeid",
    });
    expect(flex).not.toBe(current);
    expect(
      chooseProposal({
        fingerprint: flex,
        currency: "GBP",
        existing: [{ id: "p1", fingerprint: current, currency: "GBP" }],
      }).match,
    ).toBeNull();
  });

  it("never groups files whose bank could not be read either", () => {
    const fingerprint = proposalFingerprint({
      institution: null,
      identifierHash: null,
      lastFour: null,
      currency: "GBP",
      holder: "Omar Ebeid",
    });
    expect(
      chooseProposal({
        fingerprint,
        currency: "GBP",
        existing: [{ id: "p1", fingerprint, currency: "GBP" }],
        continuity: true,
      }).match,
    ).toBeNull();
  });

  it("still groups two files that share a real account-number hash", () => {
    const fingerprint = proposalFingerprint({
      institution: "NatWest",
      identifierHash: "hash-abc",
      lastFour: "1234",
      currency: "GBP",
      holder: "Omar Ebeid",
    });
    expect(
      chooseProposal({
        fingerprint,
        currency: "GBP",
        existing: [{ id: "p1", fingerprint, currency: "GBP" }],
      }).match?.id,
    ).toBe("p1");
  });
});
