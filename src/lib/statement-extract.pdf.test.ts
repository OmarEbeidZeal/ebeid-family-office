import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The NatWest failure: rows print `26 Aug`, the year appears once in the
 * header, and the transaction type is glued to the merchant. This exercises
 * the reader end to end with the model stubbed out, so what is under test is
 * the dating and the splitting rather than anyone's prompt.
 */
const completeJson = vi.fn();
vi.mock("./ai/gateway.server", () => ({ completeJson: (...args: unknown[]) => completeJson(...args) }));

type PdfRow = {
  date: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  balance_after: string;
};

type Header = {
  period_start?: string;
  period_end?: string;
  opening_balance?: string;
  closing_balance?: string;
  currency?: string;
};

function mockStatement(rows: PdfRow[], header: Header) {
  completeJson.mockImplementation((_job: string, options: { schemaName: string }) => {
    if (options.schemaName === "statement_meta") {
      return Promise.resolve({
        period_start: "",
        period_end: "",
        opening_balance: "",
        closing_balance: "",
        currency: "GBP",
        institution: "NatWest",
        statement_holder: "MR O EBEID",
        account_identifier: "60-12-34 12345678",
        identifier_kind: "account_number",
        account_type: "current",
        country: "GB",
        ...header,
      });
    }
    return Promise.resolve({ transactions: rows });
  });
}

const { extractFromPdfText } = await import("./statement-extract.server");

const TEXT = "NatWest statement\nFrom 01 September 2024 to 31 August 2025\n";

beforeEach(() => {
  completeJson.mockReset();
});

describe("extractFromPdfText — year-less rows", () => {
  it("dates every row from the statement period, rolling back across the year end", async () => {
    mockStatement(
      [
        { date: "1 Sep", description: "SALARY", amount: 4200, direction: "credit", balance_after: "5,000.00" },
        { date: "25 Dec", description: "JOHN LEWIS", amount: 180.5, direction: "debit", balance_after: "4,819.50" },
        { date: "26 Aug", description: "TESCO STORES 3241", amount: 42.1, direction: "debit", balance_after: "4,777.40" },
      ],
      { period_start: "2024-09-01", period_end: "2025-08-31", opening_balance: "800.00", closing_balance: "4,777.40" },
    );

    const result = await extractFromPdfText(TEXT);

    expect(result.transactions.map((row) => row.booked_date)).toEqual([
      "2024-09-01",
      "2024-12-25",
      "2025-08-26",
    ]);
    expect(result.meta.period_start).toBe("2024-09-01");
    expect(result.meta.period_end).toBe("2025-08-31");
    expect(result.notes.some((note) => note.includes("no year"))).toBe(true);
  });

  it("falls back to the span of rows that did print a full date", async () => {
    mockStatement(
      [
        { date: "2025-03-01", description: "OPENING TRANSFER", amount: 1000, direction: "credit", balance_after: "1,000.00" },
        { date: "14 Mar", description: "PRET A MANGER", amount: 6.4, direction: "debit", balance_after: "993.60" },
        { date: "2025-03-28", description: "RENT", amount: 900, direction: "debit", balance_after: "93.60" },
      ],
      {},
    );

    const result = await extractFromPdfText(TEXT);

    expect(result.transactions.map((row) => row.booked_date)).toEqual([
      "2025-03-01",
      "2025-03-14",
      "2025-03-28",
    ]);
  });

  it("leaves out a row that lands outside the period rather than guessing its year", async () => {
    mockStatement(
      [
        { date: "5 Jan", description: "COUNCIL TAX", amount: 210, direction: "debit", balance_after: "1,000.00" },
        { date: "20 Nov", description: "STRAY ROW", amount: 15, direction: "debit", balance_after: "985.00" },
      ],
      { period_start: "2025-01-01", period_end: "2025-06-30" },
    );

    const result = await extractFromPdfText(TEXT);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.booked_date).toBe("2025-01-05");
    expect(result.skippedRows).toBe(1);
    expect(result.notes.some((note) => note.includes("outside the statement period"))).toBe(true);
  });

  it("refuses the file outright when nothing can be dated", async () => {
    mockStatement(
      [{ date: "26 Aug", description: "TESCO", amount: 42.1, direction: "debit", balance_after: "" }],
      {},
    );

    await expect(extractFromPdfText(TEXT)).rejects.toThrow(/print no year/i);
  });
});

describe("extractFromPdfText — run-together transaction types", () => {
  it("splits the type off the merchant and keeps the printed line verbatim", async () => {
    mockStatement(
      [
        {
          date: "12 Feb",
          description: "TESCO STORES 3241Debit Card Transaction",
          amount: 42.1,
          direction: "debit",
          balance_after: "1,000.00",
        },
        {
          date: "13 Feb",
          description: "ZEAL LTDAutomated Credit",
          amount: 4200,
          direction: "credit",
          balance_after: "5,200.00",
        },
      ],
      { period_start: "2025-01-01", period_end: "2025-06-30" },
    );

    const result = await extractFromPdfText(TEXT);

    expect(result.transactions[0]!.description).toBe("TESCO STORES 3241");
    expect(result.transactions[0]!.bank_tx_code).toBe("Debit Card Transaction");
    expect(result.transactions[0]!.raw_description).toBe("TESCO STORES 3241Debit Card Transaction");
    expect(result.transactions[0]!.merchant).toBeTruthy();
    expect(result.transactions[0]!.merchant).not.toMatch(/debit card/i);
    expect(result.transactions[1]!.description).toBe("ZEAL LTD");
    expect(result.transactions[1]!.bank_tx_code).toBe("Automated Credit");
  });
});
