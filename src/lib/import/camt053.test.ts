/**
 * CAMT.053 version tolerance.
 *
 * Omar's bank offers .02, .04, .08 and .10, and may well change which is the
 * default without telling anyone. The contract these tests hold the parser to
 * is the whole point of the exercise: equivalent input in any of those four
 * versions must produce byte-for-byte identical normalised output. If that
 * ever stops being true, a mixed-version set of files would import as a set of
 * subtly different ledgers, which is far worse than a file that simply fails.
 */
import { describe, expect, it } from "vitest";
import { camtVersion, parseCamt053 } from "./camt053.server";

type Version = "02" | "04" | "08" | "10";

const VERSIONS: Version[] = ["02", "04", "08", "10"];

/**
 * The same statement, expressed the way each version of the schema expresses
 * it. Only the shapes that genuinely changed between versions differ:
 *
 *  - `Sts` is a plain code in .02 and .04, a composite from .08
 *  - `.10` is written with a namespace prefix, to prove the reader matches on
 *    local names rather than qualified ones
 *  - `.02` omits `ValDt` entirely, which must fall back to the booking date
 *  - `.04` writes the booking date as a `DtTm` timestamp rather than a `Dt`
 *  - `.02` states its balance type as a bare `Tp/Cd`, the rest via `CdOrPrtry`
 *
 * Everything semantic — amounts, dates, directions, references, parties — is
 * identical, so the normalised output must be identical too.
 */
function buildStatement(version: Version): string {
  const prefixed = version === "10";
  const p = prefixed ? "ns:" : "";
  const ns = `urn:iso:std:iso:20022:tech:xsd:camt.053.001.${version}`;
  const root = prefixed
    ? `<ns:Document xmlns:ns="${ns}">`
    : `<Document xmlns="${ns}">`;
  const rootClose = prefixed ? `</ns:Document>` : `</Document>`;

  const status = (code: string) =>
    version === "02" || version === "04"
      ? `<${p}Sts>${code}</${p}Sts>`
      : `<${p}Sts><${p}Cd>${code}</${p}Cd></${p}Sts>`;

  const balanceType = (code: string) =>
    version === "02"
      ? `<${p}Tp><${p}Cd>${code}</${p}Cd></${p}Tp>`
      : `<${p}Tp><${p}CdOrPrtry><${p}Cd>${code}</${p}Cd></${p}CdOrPrtry></${p}Tp>`;

  const bookingDate = (date: string) =>
    version === "04"
      ? `<${p}BookgDt><${p}DtTm>${date}T09:14:22+00:00</${p}DtTm></${p}BookgDt>`
      : `<${p}BookgDt><${p}Dt>${date}</${p}Dt></${p}BookgDt>`;

  // .02 leaves the value date out; it must be taken from the booking date.
  const valueDate = (date: string) =>
    version === "02" ? "" : `<${p}ValDt><${p}Dt>${date}</${p}Dt></${p}ValDt>`;

  const balance = (code: string, amount: string, date: string, sign: "CRDT" | "DBIT") => `
    <${p}Bal>
      ${balanceType(code)}
      <${p}Amt Ccy="GBP">${amount}</${p}Amt>
      <${p}CdtDbtInd>${sign}</${p}CdtDbtInd>
      <${p}Dt><${p}Dt>${date}</${p}Dt></${p}Dt>
    </${p}Bal>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
${root}
  <${p}BkToCstmrStmt>
    <${p}GrpHdr>
      <${p}MsgId>STMT-2026-07</${p}MsgId>
      <${p}CreDtTm>2026-08-01T02:00:00+00:00</${p}CreDtTm>
    </${p}GrpHdr>
    <${p}Stmt>
      <${p}Id>GB-CURRENT-2026-07</${p}Id>
      <${p}CreDtTm>2026-08-01T02:00:00+00:00</${p}CreDtTm>
      <${p}FrToDt>
        <${p}FrDtTm>2026-07-01T00:00:00+00:00</${p}FrDtTm>
        <${p}ToDtTm>2026-07-31T23:59:59+00:00</${p}ToDtTm>
      </${p}FrToDt>
      <${p}Acct>
        <${p}Id><${p}IBAN>GB29NWBK60161331926819</${p}IBAN></${p}Id>
        <${p}Ccy>GBP</${p}Ccy>
        <${p}Tp><${p}Cd>CACC</${p}Cd></${p}Tp>
        <${p}Ownr><${p}Nm>Omar Ebeid</${p}Nm></${p}Ownr>
        <${p}Svcr>
          <${p}FinInstnId>
            <${p}BICFI>NWBKGB2L</${p}BICFI>
            <${p}Nm>NatWest</${p}Nm>
          </${p}FinInstnId>
        </${p}Svcr>
      </${p}Acct>
      ${balance("OPBD", "1000.00", "2026-07-01", "CRDT")}
      ${balance("CLBD", "997.15", "2026-07-31", "CRDT")}

      <${p}Ntry>
        <${p}Amt Ccy="GBP">250.00</${p}Amt>
        <${p}CdtDbtInd>CRDT</${p}CdtDbtInd>
        ${status("BOOK")}
        ${bookingDate("2026-07-02")}
        ${valueDate("2026-07-02")}
        <${p}AcctSvcrRef>REF-CREDIT-0001</${p}AcctSvcrRef>
        <${p}BkTxCd><${p}Domn><${p}Cd>PMNT</${p}Cd><${p}Fmly><${p}SubFmlyCd>SALA</${p}SubFmlyCd></${p}Fmly></${p}Domn></${p}BkTxCd>
        <${p}NtryDtls><${p}TxDtls>
          <${p}Refs><${p}EndToEndId>E2E-SALARY-07</${p}EndToEndId></${p}Refs>
          <${p}RltdPties><${p}Dbtr><${p}Nm>Zeal Technologies Ltd</${p}Nm></${p}Dbtr></${p}RltdPties>
          <${p}RmtInf><${p}Ustrd>July salary</${p}Ustrd></${p}RmtInf>
        </${p}TxDtls></${p}NtryDtls>
      </${p}Ntry>

      <${p}Ntry>
        <${p}Amt Ccy="GBP">40.50</${p}Amt>
        <${p}CdtDbtInd>DBIT</${p}CdtDbtInd>
        ${status("BOOK")}
        ${bookingDate("2026-07-05")}
        ${valueDate("2026-07-05")}
        <${p}AcctSvcrRef>REF-DEBIT-0002</${p}AcctSvcrRef>
        <${p}NtryDtls><${p}TxDtls>
          <${p}Refs><${p}EndToEndId>E2E-GROCERY-07</${p}EndToEndId></${p}Refs>
          <${p}RltdPties><${p}Cdtr><${p}Nm>Waitrose</${p}Nm></${p}Cdtr></${p}RltdPties>
          <${p}RmtInf><${p}Ustrd>Weekly shop</${p}Ustrd></${p}RmtInf>
        </${p}TxDtls></${p}NtryDtls>
      </${p}Ntry>

      <${p}Ntry>
        <${p}Amt Ccy="GBP">130.00</${p}Amt>
        <${p}CdtDbtInd>DBIT</${p}CdtDbtInd>
        ${status("BOOK")}
        ${bookingDate("2026-07-09")}
        ${valueDate("2026-07-09")}
        <${p}AcctSvcrRef>REF-BATCH-0003</${p}AcctSvcrRef>
        <${p}NtryDtls>
          <${p}TxDtls>
            <${p}Refs><${p}EndToEndId>E2E-BATCH-A</${p}EndToEndId></${p}Refs>
            <${p}Amt Ccy="GBP">30.00</${p}Amt>
            <${p}CdtDbtInd>DBIT</${p}CdtDbtInd>
            <${p}RltdPties><${p}Cdtr><${p}Nm>Thames Water</${p}Nm></${p}Cdtr></${p}RltdPties>
          </${p}TxDtls>
          <${p}TxDtls>
            <${p}Refs><${p}EndToEndId>E2E-BATCH-B</${p}EndToEndId></${p}Refs>
            <${p}Amt Ccy="GBP">100.00</${p}Amt>
            <${p}CdtDbtInd>DBIT</${p}CdtDbtInd>
            <${p}RltdPties><${p}Cdtr><${p}Nm>Octopus Energy</${p}Nm></${p}Cdtr></${p}RltdPties>
          </${p}TxDtls>
        </${p}NtryDtls>
      </${p}Ntry>

      <${p}Ntry>
        <${p}Amt Ccy="GBP">82.35</${p}Amt>
        <${p}CdtDbtInd>DBIT</${p}CdtDbtInd>
        ${status("BOOK")}
        ${bookingDate("2026-07-14")}
        ${valueDate("2026-07-14")}
        <${p}AcctSvcrRef>REF-FX-0004</${p}AcctSvcrRef>
        <${p}NtryDtls><${p}TxDtls>
          <${p}Refs><${p}EndToEndId>E2E-FX-07</${p}EndToEndId></${p}Refs>
          <${p}AmtDtls>
            <${p}InstdAmt>
              <${p}Amt Ccy="EUR">100.00</${p}Amt>
              <${p}CcyXchg><${p}XchgRate>1.2143</${p}XchgRate></${p}CcyXchg>
            </${p}InstdAmt>
          </${p}AmtDtls>
          <${p}RltdPties><${p}Cdtr><${p}Nm>Hotel Amalfi</${p}Nm></${p}Cdtr></${p}RltdPties>
          <${p}RmtInf><${p}Ustrd>Deposit</${p}Ustrd></${p}RmtInf>
        </${p}TxDtls></${p}NtryDtls>
      </${p}Ntry>

      <${p}Ntry>
        <${p}Amt Ccy="GBP">500.00</${p}Amt>
        <${p}CdtDbtInd>DBIT</${p}CdtDbtInd>
        ${status("PDNG")}
        ${bookingDate("2026-07-31")}
        ${valueDate("2026-07-31")}
        <${p}AcctSvcrRef>REF-PENDING-0005</${p}AcctSvcrRef>
        <${p}NtryDtls><${p}TxDtls>
          <${p}RltdPties><${p}Cdtr><${p}Nm>Awaiting settlement</${p}Nm></${p}Cdtr></${p}RltdPties>
        </${p}TxDtls></${p}NtryDtls>
      </${p}Ntry>
    </${p}Stmt>
  </${p}BkToCstmrStmt>
${rootClose}`;
}

const single = (version: Version) => {
  const results = parseCamt053(buildStatement(version));
  expect(results).toHaveLength(1);
  return results[0]!;
};

const minor = (value: number) => Math.round(value * 100);

describe("CAMT.053 version tolerance", () => {
  it.each(VERSIONS)("reads .%s into the same normalised statement", (version) => {
    const result = single(version);

    expect(result.format).toBe("camt053");
    expect(result.formatVersion).toBe(`camt.053.001.${version}`);
    expect(result.exactBalances).toBe(true);
    expect(result.accountDetectable).toBe(true);
    expect(result.skippedRows).toBe(0);

    expect(result.meta.currency).toBe("GBP");
    expect(result.meta.period_start).toBe("2026-07-01");
    expect(result.meta.period_end).toBe("2026-07-31");
    expect(result.meta.opening_balance).toBe(1000);
    expect(result.meta.closing_balance).toBe(997.15);

    expect(result.meta.identity).toMatchObject({
      institution: "NatWest",
      statement_holder: "Omar Ebeid",
      account_identifier: "GB29NWBK60161331926819",
      identifier_kind: "iban",
      account_type: "current",
      country: "GB",
    });
  });

  it("produces identical transactions across .02, .04, .08 and .10", () => {
    const [first, ...rest] = VERSIONS.map((version) => single(version).transactions);
    expect(first).toBeDefined();
    // Five entries, one of them pending and one of them batched into two.
    expect(first).toHaveLength(5);
    for (const other of rest) expect(other).toEqual(first);
  });

  it("records the version without letting it change anything", () => {
    const versions = VERSIONS.map((version) => single(version).formatVersion);
    expect(versions).toEqual([
      "camt.053.001.02",
      "camt.053.001.04",
      "camt.053.001.08",
      "camt.053.001.10",
    ]);
    expect(camtVersion("<Document xmlns='urn:iso:std:iso:20022:tech:xsd:camt.053.001.08'/>")).toBe(
      "camt.053.001.08",
    );
    expect(camtVersion("<Document/>")).toBeNull();
  });

  it.each(VERSIONS)("reads a credit and a debit correctly in .%s", (version) => {
    const rows = single(version).transactions;

    expect(rows[0]).toMatchObject({
      booked_date: "2026-07-02",
      value_date: "2026-07-02",
      direction: "credit",
      amount: 250,
      currency: "GBP",
      merchant: "Zeal Technologies Ltd",
      bank_reference: "REF-CREDIT-0001",
      bank_tx_code: "SALA",
    });
    expect(rows[0]!.description).toContain("July salary");

    expect(rows[1]).toMatchObject({
      booked_date: "2026-07-05",
      direction: "debit",
      amount: 40.5,
      merchant: "Waitrose",
    });
  });

  it.each(VERSIONS)("splits a batched entry into its parts in .%s", (version) => {
    const result = single(version);
    const parts = result.transactions.filter((row) =>
      ["Thames Water", "Octopus Energy"].includes(row.merchant ?? ""),
    );

    expect(parts).toHaveLength(2);
    expect(parts.map((row) => row.amount)).toEqual([30, 100]);
    expect(parts.every((row) => row.direction === "debit")).toBe(true);
    expect(parts.every((row) => row.booked_date === "2026-07-09")).toBe(true);
    // The batch itself must not survive alongside its parts.
    expect(result.transactions.some((row) => row.amount === 130)).toBe(false);
    expect(result.notes.join(" ")).toContain("batched");
  });

  it.each(VERSIONS)("keeps the instructed currency and rate in .%s", (version) => {
    const fx = single(version).transactions.find((row) => row.merchant === "Hotel Amalfi");

    expect(fx).toMatchObject({
      amount: 82.35,
      currency: "GBP",
      original_amount: 100,
      original_currency: "EUR",
      fx_rate: 1.2143,
      direction: "debit",
    });
  });

  it.each(VERSIONS)("leaves the pending entry out in .%s", (version) => {
    const result = single(version);

    expect(result.transactions.some((row) => row.amount === 500)).toBe(false);
    expect(result.notes.join(" ")).toContain("pending");
  });

  it.each(VERSIONS)("reconciles opening to closing in .%s", (version) => {
    const result = single(version);
    const movement = result.transactions.reduce(
      (sum, row) => sum + (row.direction === "credit" ? minor(row.amount) : -minor(row.amount)),
      0,
    );

    expect(minor(result.meta.opening_balance!) + movement).toBe(
      minor(result.meta.closing_balance!),
    );
  });
});

/* ------------------------------------------------- shape-by-shape tolerance */

function wrap(version: Version, body: string): string {
  const ns = `urn:iso:std:iso:20022:tech:xsd:camt.053.001.${version}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${ns}"><BkToCstmrStmt><Stmt>
  <Id>TOLERANCE</Id>
  <Acct><Id><IBAN>GB29NWBK60161331926819</IBAN></Id><Ccy>GBP</Ccy></Acct>
  ${body}
</Stmt></BkToCstmrStmt></Document>`;
}

const entry = (inner: string) => `<Ntry>
  <Amt Ccy="GBP">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
  <BookgDt><Dt>2026-07-03</Dt></BookgDt>
  ${inner}
</Ntry>`;

describe("CAMT.053 optional and changed elements", () => {
  it("accepts a plain and a composite entry status alike", () => {
    const plain = parseCamt053(wrap("02", entry("<Sts>BOOK</Sts>")))[0]!;
    const composite = parseCamt053(wrap("10", entry("<Sts><Cd>BOOK</Cd></Sts>")))[0]!;

    expect(plain.transactions).toHaveLength(1);
    expect(composite.transactions).toEqual(plain.transactions);
  });

  it("skips a pending entry whether the status is plain or composite", () => {
    const plain = parseCamt053(wrap("02", entry("<Sts>PDNG</Sts>")))[0]!;
    const composite = parseCamt053(wrap("10", entry("<Sts><Cd>PDNG</Cd></Sts>")))[0]!;

    expect(plain.transactions).toHaveLength(0);
    expect(composite.transactions).toHaveLength(0);
  });

  it("falls back to the booking date when no value date is stated", () => {
    const result = parseCamt053(wrap("02", entry("<Sts>BOOK</Sts>")))[0]!;
    expect(result.transactions[0]!.value_date).toBe("2026-07-03");
  });

  it("prefers structured remittance over unstructured when both exist", () => {
    const body = entry(`<Sts><Cd>BOOK</Cd></Sts>
      <NtryDtls><TxDtls><RmtInf>
        <Ustrd>free text a person typed</Ustrd>
        <Strd><CdtrRefInf><Ref>RF18-INVOICE-4471</Ref></CdtrRefInf></Strd>
      </RmtInf></TxDtls></NtryDtls>`);
    const result = parseCamt053(wrap("08", body))[0]!;

    expect(result.transactions[0]!.description).toContain("RF18-INVOICE-4471");
    expect(result.transactions[0]!.description).not.toContain("free text");
  });

  it("falls back to unstructured remittance when there is no structured block", () => {
    const body = entry(`<Sts>BOOK</Sts>
      <NtryDtls><TxDtls><RmtInf><Ustrd>Standing order to Haya</Ustrd></RmtInf></TxDtls></NtryDtls>`);
    const result = parseCamt053(wrap("02", body))[0]!;

    expect(result.transactions[0]!.description).toContain("Standing order to Haya");
  });

  it("leaves the merchant null when no counterparty is named", () => {
    const body = entry(`<Sts>BOOK</Sts>
      <NtryDtls><TxDtls>
        <Refs><EndToEndId>E2E-NO-PARTY</EndToEndId></Refs>
      </TxDtls></NtryDtls>`);
    const result = parseCamt053(wrap("04", body))[0]!;

    expect(result.transactions[0]!.merchant).toBeNull();
    expect(result.transactions[0]!.raw_description).toContain("E2E-NO-PARTY");
  });

  it("flips a reversal however the flag is written", () => {
    for (const written of ["true", "1", "Y"]) {
      const body = entry(`<Sts>BOOK</Sts><RvslInd>${written}</RvslInd>`);
      const result = parseCamt053(wrap("08", body))[0]!;
      expect(result.transactions[0]!.direction).toBe("credit");
    }
  });

  it("reads a bare balance type as readily as a composite one", () => {
    const bare = parseCamt053(
      wrap(
        "02",
        `<Bal><Tp><Cd>OPBD</Cd></Tp><Amt Ccy="GBP">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
         <Bal><Tp><Cd>CLBD</Cd></Tp><Amt Ccy="GBP">20.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>`,
      ),
    )[0]!;

    expect(bare.meta.opening_balance).toBe(10);
    expect(bare.meta.closing_balance).toBe(20);
    expect(bare.exactBalances).toBe(true);
  });

  it("degrades cleanly when a statement carries no entries at all", () => {
    const empty = parseCamt053(wrap("10", ""))[0]!;

    expect(empty.transactions).toHaveLength(0);
    expect(empty.skippedRows).toBe(0);
    expect(empty.exactBalances).toBe(false);
    expect(empty.notes.join(" ")).toContain("could not be checked");
  });
});
