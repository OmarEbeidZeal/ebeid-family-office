import { describe, expect, it } from "vitest";
import { detectProvider, normaliseHeader } from "./providers";

const monzo = [
  [
    "Transaction ID",
    "Date",
    "Time",
    "Type",
    "Name",
    "Emoji",
    "Category",
    "Amount",
    "Currency",
    "Local amount",
    "Local currency",
    "Notes and #tags",
    "Address",
    "Receipt",
    "Description",
    "Category split",
  ],
  [
    "tx_0000A1",
    "04/02/2026",
    "08:12:44",
    "Card payment",
    "Pret A Manger",
    "🥪",
    "Eating out",
    "-4.85",
    "GBP",
    "-4.85",
    "GBP",
    "",
    "London",
    "",
    "PRET A MANGER LONDON",
    "",
  ],
  [
    "tx_0000A2",
    "05/02/2026",
    "09:01:00",
    "Faster payment",
    "Zeal Ltd",
    "",
    "Income",
    "4200.00",
    "GBP",
    "4200.00",
    "GBP",
    "",
    "",
    "",
    "SALARY",
    "",
  ],
];

const trading212 = [
  [
    "Action",
    "Time",
    "ISIN",
    "Ticker",
    "Name",
    "No. of shares",
    "Price / share",
    "Currency (Price / share)",
    "Total",
    "Currency (Total)",
  ],
  [
    "Market buy",
    "2026-01-12 14:31:02",
    "US45824A1051",
    "LUNR",
    "Intuitive Machines",
    "40",
    "11.24",
    "USD",
    "449.60",
    "USD",
  ],
];

describe("normaliseHeader", () => {
  it("reduces a printed heading to a comparable token", () => {
    expect(normaliseHeader("No. of shares")).toBe("noofshares");
    expect(normaliseHeader("Notes and #tags")).toBe("notesandtags");
    expect(normaliseHeader(undefined)).toBe("");
  });
});

describe("detectProvider", () => {
  it("tells a Monzo export from a Trading 212 export", () => {
    const one = detectProvider(monzo);
    const other = detectProvider(trading212);

    expect(one?.institution).toBe("Monzo");
    expect(other?.institution).toBe("Trading 212");
    // The whole point: two nameless CSVs no longer share one account.
    expect(one?.institution).not.toBe(other?.institution);
  });

  it("maps a Monzo export deterministically, currency included", () => {
    const found = detectProvider(monzo);
    expect(found?.mapping).not.toBeNull();
    expect(found?.mapping?.header_row_index).toBe(0);
    expect(found?.mapping?.date_column).toBe(1);
    expect(found?.mapping?.amount_column).toBe(7);
    expect(found?.mapping?.currency_column).toBe(8);
    expect(found?.mapping?.amount_sign_convention).toBe("negative_is_debit");
    expect(found?.currency).toBe("GBP");
    expect(found?.mapping?.account_type).toBe("current");
  });

  it("leaves an investment ledger to the reader rather than guessing a sign", () => {
    const found = detectProvider(trading212);
    expect(found?.mapping).toBeNull();
    expect(found?.accountType).toBe("investment");
    expect(found?.note).toBe("Recognised as a Trading 212 export.");
  });

  it("reads the account number out of a Lloyds-format export without naming a bank", () => {
    const found = detectProvider([
      [
        "Transaction Date",
        "Transaction Type",
        "Sort Code",
        "Account Number",
        "Transaction Description",
        "Debit Amount",
        "Credit Amount",
        "Balance",
      ],
      ["03/02/2026", "DEB", "'30-99-50", "12345678", "TESCO STORES", "24.10", "", "1,204.55"],
    ]);

    expect(found?.key).toBe("lloyds-group");
    expect(found?.institution).toBeNull();
    expect(found?.accountIdentifier).toBe("'30-99-50 12345678");
    expect(found?.identifierKind).toBe("account_number");
    expect(found?.mapping?.amount_sign_convention).toBe("separate_columns");
    expect(found?.mapping?.debit_column).toBe(5);
    expect(found?.mapping?.credit_column).toBe(6);
  });

  it("finds the header under Nationwide's preamble rows", () => {
    const found = detectProvider([
      ["Account Name:", "FlexAccount"],
      ["Account Balance:", "£2,204.19"],
      ["Available Balance:", "£2,204.19"],
      [],
      ["Date", "Transaction type", "Description", "Paid out", "Paid in", "Balance"],
      ["01 Feb 2026", "Direct debit", "THAMES WATER", "£42.00", "", "£2,162.19"],
    ]);

    expect(found?.institution).toBe("Nationwide");
    expect(found?.mapping?.header_row_index).toBe(4);
    expect(found?.mapping?.debit_column).toBe(3);
    expect(found?.mapping?.balance_column).toBe(5);
  });

  it("takes the currency from a Starling column heading", () => {
    const found = detectProvider([
      [
        "Date",
        "Counter Party",
        "Reference",
        "Type",
        "Amount (GBP)",
        "Balance (GBP)",
        "Spending Category",
        "Notes",
      ],
      ["02/02/2026", "Ocado", "GROCERIES", "FASTER PAYMENT", "-88.20", "3,110.40", "GROCERIES", ""],
    ]);

    expect(found?.institution).toBe("Starling Bank");
    expect(found?.currency).toBe("GBP");
    expect(found?.mapping?.currency_code).toBe("GBP");
  });

  it("treats an Amex charge as money out", () => {
    const found = detectProvider([
      ["Date", "Description", "Card Member", "Account #", "Amount"],
      ["02/02/2026", "BRITISH AIRWAYS", "O EBEID", "-51007", "412.60"],
    ]);

    expect(found?.institution).toBe("American Express");
    expect(found?.mapping?.amount_sign_convention).toBe("positive_is_debit");
    expect(found?.accountIdentifier).toBe("-51007");
    expect(found?.identifierKind).toBe("card");
  });

  it("recognises nothing in an unfamiliar export", () => {
    expect(
      detectProvider([
        ["Posting date", "Narrative", "Debit", "Credit", "Running balance"],
        ["01/02/2026", "CAIRO BRANCH WITHDRAWAL", "500.00", "", "12,400.00"],
      ]),
    ).toBeNull();
  });

  it("ignores a signature row with no data under it", () => {
    expect(detectProvider([["Transaction ID", "Date", "Notes and #tags"]])).toBeNull();
  });
});
