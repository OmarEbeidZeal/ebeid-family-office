/**
 * Which account a CAMT.053 file belongs to, when the file declines to say.
 *
 * Wise issues CAMT.053 for its non-euro balances with no IBAN anywhere in the
 * document. Before the fallback ladder those files matched nothing, proposed
 * nothing, and sat in "waiting for an account" forever.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { parseCamt053 } from "./camt053.server";
import { compositeAccountKey, matchAccount, normaliseIdentifier } from "./identity.server";

beforeAll(() => {
  process.env["ACCOUNT_IDENTIFIER_SALT"] = "test-salt-for-identity-specs";
});

/** One entry is enough: these tests are about the account block, not the ledger. */
function statement(accountBlock: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M1</MsgId><CreDtTm>2026-08-01T02:00:00+00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>S1</Id>
      <CreDtTm>2026-08-01T02:00:00+00:00</CreDtTm>
      <FrToDt>
        <FrDtTm>2026-07-01T00:00:00+00:00</FrDtTm>
        <ToDtTm>2026-07-31T23:59:59+00:00</ToDtTm>
      </FrToDt>
      ${accountBlock}
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="USD">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-07-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="USD">75.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-07-31</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="USD">25.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-07-14</Dt></BookgDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Card payment</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
}

const WITH_IBAN = `<Acct>
  <Id><IBAN>GB29NWBK60161331926819</IBAN></Id>
  <Ccy>USD</Ccy>
  <Svcr><FinInstnId><Nm>Wise Payments Limited</Nm></FinInstnId></Svcr>
  <Ownr><Nm>Omar Ebeid</Nm></Ownr>
</Acct>`;

const WITH_OTHER_ID = `<Acct>
  <Id><Othr><Id>0000123456789</Id><SchmeNm><Cd>BBAN</Cd></SchmeNm></Othr></Id>
  <Ccy>USD</Ccy>
  <Svcr><FinInstnId><Nm>Wise Payments Limited</Nm></FinInstnId></Svcr>
  <Ownr><Nm>Omar Ebeid</Nm></Ownr>
</Acct>`;

const NO_IDENTIFIER = `<Acct>
  <Ccy>USD</Ccy>
  <Svcr><FinInstnId><Nm>Wise Payments Limited</Nm></FinInstnId></Svcr>
  <Ownr><Nm>Omar Ebeid</Nm></Ownr>
</Acct>`;

const NO_IDENTIFIER_GBP = NO_IDENTIFIER.replace("<Ccy>USD</Ccy>", "<Ccy>GBP</Ccy>");

const NO_IDENTIFIER_HAYA = NO_IDENTIFIER.replace("Omar Ebeid", "Haya Ebeid");

const BIC_ONLY = `<Acct>
  <Ccy>USD</Ccy>
  <Svcr><FinInstnId><BICFI>TRWIGB2LXXX</BICFI></FinInstnId></Svcr>
  <Ownr><Nm>Omar Ebeid</Nm></Ownr>
</Acct>`;

const NOTHING_AT_ALL = `<Acct><Ccy>USD</Ccy></Acct>`;

const identityOf = (block: string) => parseCamt053(statement(block))[0]!.meta.identity;

describe("CAMT.053 identity ladder", () => {
  it("takes the IBAN when the file prints one", () => {
    expect(identityOf(WITH_IBAN)).toMatchObject({
      account_identifier: "GB29NWBK60161331926819",
      identifier_kind: "iban",
    });
  });

  it("falls back to Othr/Id when there is no IBAN", () => {
    expect(identityOf(WITH_OTHER_ID)).toMatchObject({
      account_identifier: "0000123456789",
      identifier_kind: "account_number",
    });
  });

  it("builds a composite of servicer, currency and owner when neither is printed", () => {
    const identity = identityOf(NO_IDENTIFIER);
    expect(identity.identifier_kind).toBe("reference");
    expect(identity.account_identifier).toBe("WISEPAYMENTSLIMITED|USD|OMAREBEID");
    expect(identity.institution).toBe("Wise Payments Limited");
    expect(identity.statement_holder).toBe("Omar Ebeid");
  });

  it("keeps two currencies at the same bank apart", () => {
    expect(identityOf(NO_IDENTIFIER).account_identifier).not.toBe(
      identityOf(NO_IDENTIFIER_GBP).account_identifier,
    );
  });

  it("keeps two people at the same bank apart", () => {
    expect(identityOf(NO_IDENTIFIER).account_identifier).not.toBe(
      identityOf(NO_IDENTIFIER_HAYA).account_identifier,
    );
  });

  it("names the servicer by BIC when the file gives no name", () => {
    const identity = identityOf(BIC_ONLY);
    expect(identity.identifier_kind).toBe("reference");
    expect(identity.account_identifier).toContain("USD");
  });

  it("gives up rather than inventing a key from a currency alone", () => {
    expect(identityOf(NOTHING_AT_ALL)).toMatchObject({
      account_identifier: null,
      identifier_kind: null,
    });
  });

  it("reads the same statement identically each time", () => {
    expect(identityOf(NO_IDENTIFIER)).toEqual(identityOf(NO_IDENTIFIER));
  });
});

describe("compositeAccountKey", () => {
  it("needs two named parts to mean anything", () => {
    expect(compositeAccountKey(["Wise", null, null])).toBeNull();
    expect(compositeAccountKey([null, "USD", null])).toBeNull();
  });

  it("refuses a key too short to identify anything", () => {
    expect(compositeAccountKey(["A", "B"])).toBeNull();
  });

  it("ignores punctuation and case so the key stays stable", () => {
    expect(compositeAccountKey(["Wise Payments Ltd.", "usd"])).toBe("WISEPAYMENTSLTD|USD");
  });
});

describe("matching on a composite key", () => {
  const identifier = normaliseIdentifier("WISEPAYMENTSLIMITED|USD|OMAREBEID", "reference")!;

  const account = {
    id: "acc-1",
    nickname: "Wise USD",
    institution: "Wise Payments Limited",
    institution_domain: "wise.com",
    currency: "USD",
    country: "GB",
    account_type: "current",
    is_active: true,
    identifiers: [{ hash: identifier.hash, last_four: null, kind: "reference" }],
  };

  it("hashes the composite without inventing a last four", () => {
    expect(identifier.kind).toBe("reference");
    expect(identifier.lastFour).toBeNull();
    expect(identifier.mask).toBeNull();
    expect(identifier.hash).toHaveLength(64);
  });

  it("recognises the account but stops short of an automatic link", () => {
    const outcome = matchAccount(
      {
        institution: "Wise Payments Limited",
        identifierHash: identifier.hash,
        identifierKind: "reference",
        lastFourHashes: [],
        lastFour: null,
        currency: "USD",
        country: "GB",
      },
      [account],
    );

    expect(outcome.account_id).toBe("acc-1");
    // Below 1: the pipeline only links a statement on its own at full certainty.
    expect(outcome.confidence).toBeLessThan(1);
    expect(outcome.confidence).toBeGreaterThan(0.9);
    expect(outcome.reason).toContain("No account number");
    expect(outcome.reason).toContain("Wise USD");
  });

  it("still links outright when a real account number matches", () => {
    const printed = normaliseIdentifier("GB29NWBK60161331926819", "iban")!;
    const outcome = matchAccount(
      {
        institution: "NatWest",
        identifierHash: printed.hash,
        identifierKind: "iban",
        lastFourHashes: [],
        lastFour: printed.lastFour,
        currency: "GBP",
        country: "GB",
      },
      [
        {
          ...account,
          nickname: "NatWest Current",
          identifiers: [{ hash: printed.hash, last_four: "6819", kind: "iban" }],
        },
      ],
    );

    expect(outcome.confidence).toBe(1);
  });
});
