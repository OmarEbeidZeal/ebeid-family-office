/**
 * Matching may only file a statement on its own when the file proves which
 * account it is. Everything weaker proposes.
 *
 * Each case here is a merge that happened in production and corrupted both
 * sides of it.
 */
import { describe, expect, it } from "vitest";
import {
  compatibleAccountTypes,
  matchAccount,
  meaningfulInstitution,
  normaliseIdentifier,
  proposalFingerprint,
  sameInstitution,
} from "./identity.server";

process.env["ACCOUNT_IDENTIFIER_SALT"] ??= "test-salt-for-hashing-only";

const base = {
  id: "acc-1",
  nickname: "Monzo Current",
  institution: "Monzo",
  institution_domain: "monzo.com",
  currency: "GBP",
  country: "GB",
  account_type: "current",
  is_active: true,
  identifiers: [] as Array<{ hash: string; last_four: string | null; kind: string }>,
};

describe("only a positive identifier links a statement", () => {
  it("links on an exact hash of a printed account number", () => {
    const printed = normaliseIdentifier("54-21-47 *****234", "account_number", {
      institution: "NatWest",
    })!;
    const outcome = matchAccount(
      {
        institution: "NatWest",
        identifierHash: printed.hash,
        identifierKind: printed.kind,
        identifierPositive: printed.positive,
        lastFourHashes: [],
        lastFour: printed.lastFour,
        currency: "GBP",
        country: "GB",
      },
      [{ ...base, identifiers: [{ hash: printed.hash, last_four: "234", kind: "account_number" }] }],
    );

    expect(outcome.account_id).toBe("acc-1");
    expect(outcome.confidence).toBe(1);
  });

  it("only suggests on a composite key the app assembled itself", () => {
    const composite = normaliseIdentifier("WISEPAYMENTSLIMITED|USD|OMAREBEID", "reference")!;
    const outcome = matchAccount(
      {
        institution: "Wise Payments Limited",
        identifierHash: composite.hash,
        identifierKind: "reference",
        identifierPositive: composite.positive,
        lastFourHashes: [],
        lastFour: null,
        currency: "USD",
        country: "GB",
      },
      [
        {
          ...base,
          nickname: "Wise USD",
          currency: "USD",
          identifiers: [{ hash: composite.hash, last_four: null, kind: "reference" }],
        },
      ],
    );

    expect(outcome.account_id).toBeNull();
    expect(outcome.suggested_account_id).toBe("acc-1");
  });

  it("only suggests on the printed last four and the currency", () => {
    const outcome = matchAccount(
      {
        institution: "Monzo",
        identifierHash: null,
        lastFourHashes: [],
        lastFour: "1234",
        currency: "GBP",
        country: "GB",
      },
      [{ ...base, identifiers: [{ hash: "other", last_four: "1234", kind: "account_number" }] }],
    );

    expect(outcome.account_id).toBeNull();
    expect(outcome.suggested_account_id).toBe("acc-1");
    expect(outcome.confidence).toBe(0.8);
  });

  it("only suggests when it is the one account held at that bank", () => {
    const outcome = matchAccount(
      {
        institution: "Monzo",
        identifierHash: null,
        lastFourHashes: [],
        lastFour: null,
        currency: "GBP",
        country: "GB",
      },
      [base],
    );

    expect(outcome.account_id).toBeNull();
    expect(outcome.suggested_account_id).toBe("acc-1");
  });

  it("refuses to treat an invented nickname as a bank", () => {
    expect(meaningfulInstitution("Imported account")).toBeNull();
    expect(meaningfulInstitution("Unknown")).toBeNull();
    expect(sameInstitution("Imported account", "Imported account")).toBe(false);

    const outcome = matchAccount(
      {
        institution: "Imported account",
        identifierHash: null,
        lastFourHashes: [],
        lastFour: null,
        currency: "GBP",
        country: "GB",
      },
      [{ ...base, institution: "Imported account" }],
    );
    expect(outcome.account_id).toBeNull();
    expect(outcome.suggested_account_id).toBeNull();
  });

  it("never suggests an account of an incompatible kind", () => {
    const outcome = matchAccount(
      {
        institution: "Trading 212",
        identifierHash: null,
        lastFourHashes: [],
        lastFour: null,
        currency: "GBP",
        country: "GB",
        accountType: "isa",
      },
      [{ ...base, nickname: "Monzo Flex", institution: "Trading 212", account_type: "credit_card" }],
    );

    expect(outcome.account_id).toBeNull();
    expect(outcome.suggested_account_id).toBeNull();
  });
});

describe("account kinds that cannot be the same account", () => {
  it("keeps investments, cash and debt apart", () => {
    expect(compatibleAccountTypes("isa", "credit_card")).toBe(false);
    expect(compatibleAccountTypes("gia", "current")).toBe(false);
    expect(compatibleAccountTypes("credit_card", "savings")).toBe(false);
    expect(compatibleAccountTypes("isa", "sipp")).toBe(true);
    expect(compatibleAccountTypes("current", "savings")).toBe(true);
    // An unrecognised kind is not evidence either way.
    expect(compatibleAccountTypes("crypto", "current")).toBe(true);
  });
});

describe("proposals keyed on a nameless file", () => {
  it("never pools two people's exports into one account", () => {
    const shared = {
      institution: "Trading 212",
      identifierHash: null,
      lastFour: null,
      currency: "GBP",
    };
    const omar = proposalFingerprint({ ...shared, holder: "Omar Ebeid" });
    const haya = proposalFingerprint({ ...shared, holder: "Haya Ebeid" });

    expect(omar).not.toBe(haya);
    // The same person's two exports still land on one proposal.
    expect(proposalFingerprint({ ...shared, holder: "omar ebeid" })).toBe(omar);
  });

  it("keeps a bank's sub-ledgers apart", () => {
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

    expect(current).not.toBe(flex);
  });

  it("ignores the holder once a real account number keys the file", () => {
    const printed = normaliseIdentifier("GB29NWBK60161331926819", "iban")!;
    const key = (holder: string) =>
      proposalFingerprint({
        institution: "NatWest",
        identifierHash: printed.hash,
        lastFour: printed.lastFour,
        currency: "GBP",
        holder,
      });

    // One account, however the bank spelled the name on the page.
    expect(key("ABDIN HN")).toBe(key("H N ABDIN"));
  });
});
