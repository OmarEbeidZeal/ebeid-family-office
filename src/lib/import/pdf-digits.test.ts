import { describe, expect, it } from "vitest";

import { digitIntegrity } from "./pdf-digits";
import { DIGITS_LOST_MESSAGE, digitsLostPdfMessage } from "./pdf-guidance";

/** A page's worth of prose, so the guard has enough text to judge. */
const PROSE = "Statement of account for the period shown below. ".repeat(12);

describe("digitIntegrity", () => {
  it("passes a statement that kept its figures", () => {
    const text = `${PROSE}\nOpening balance GBP 1,250.75\nClosing balance GBP 6,397.10\nDeposit GBP 3,000.00`;
    const verdict = digitIntegrity(text);
    expect(verdict.ok).toBe(true);
    expect(verdict.digits).toBe(18);
  });

  it("refuses text whose currency symbols outnumber its digits", () => {
    // Exactly what pypdf returns for a Trading 212 PDF: words, no numerals.
    const text = `${PROSE}\nOpening balance GBP  ,   .  \nClosing balance GBP  ,   .  \nDeposit GBP  ,   .  `;
    const verdict = digitIntegrity(text);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("no_digits");
  });

  it("refuses a page priced all over and numbered nowhere", () => {
    const text = `${PROSE}\n£ 1\n£\n£\n£\n$\n$\n€\n€`;
    const verdict = digitIntegrity(text);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("digits_missing");
  });

  it("leaves a short page to the scanned-PDF check rather than failing it", () => {
    expect(digitIntegrity("Statement").ok).toBe(true);
  });

  it("passes a document that carries dates but prices nothing", () => {
    const verdict = digitIntegrity(
      `${PROSE}\nThe term begins on 01/09/2025 and ends on 31/08/2026.`,
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.currencyMarks).toBe(0);
  });
});


describe("digitsLostPdfMessage", () => {
  it("leads with the sentence the household is meant to act on", () => {
    expect(digitsLostPdfMessage("Something unrecognised")).toContain(DIGITS_LOST_MESSAGE);
    expect(digitsLostPdfMessage("Something unrecognised").startsWith(DIGITS_LOST_MESSAGE)).toBe(
      true,
    );
  });

  it("names the export that works when the surviving words name the exporter", () => {
    const message = digitsLostPdfMessage("Tr ding     Account Statement");
    expect(message).toContain(DIGITS_LOST_MESSAGE);
    expect(message).toContain("Trading 212");
    expect(message).toContain("Export statement");
  });

  it("speaks differently about a document that is not from a bank", () => {
    const message = digitsLostPdfMessage("Policy schedule", "document");
    expect(message).toContain(DIGITS_LOST_MESSAGE);
    expect(message).toContain("add the details by hand");
  });
});
