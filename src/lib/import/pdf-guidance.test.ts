import { describe, expect, it } from "vitest";
import { detectPdfExporter, unreadablePdfMessage } from "./pdf-guidance";

/**
 * How a Trading 212 statement actually comes out of the PDF: the digits and
 * every "a" are gone, the rest of the words survive.
 */
const TRADING212 = `CUSTOMER ID

CUSTOMER NAME
Om r Ahmed Ebeid
Activit  st tement
Gener ted b  Tr ding     UK Ltd. on    August     , covering from   .  .
Overview
Trading     Invest
Account ID:
Deposits £ ,   .
Withdr w ls  £ ,   .
Trading     Stocks ISA`;

const IBKR = `Interactive Brokers LLC
Activity Statement
Account Information
Net Asset Value £`;

const ANONYMOUS = `St tement
Opening b l nce £
Closing b l nce £`;

describe("naming the export that works", () => {
  it("recognises Trading 212 through the missing letters", () => {
    expect(detectPdfExporter(TRADING212)?.key).toBe("trading212");
  });

  it("tells the household which two taps produce a readable file", () => {
    const message = unreadablePdfMessage(TRADING212);
    expect(message).toContain("Trading 212");
    expect(message).toContain("History → Export statement → CSV");
    // The CSV is worth more than the PDF here, and the message says why.
    expect(message).toContain("orders");
  });

  it("recognises Interactive Brokers", () => {
    expect(unreadablePdfMessage(IBKR)).toContain(
      "Performance & Reports → Statements → Activity → Format: CSV",
    );
  });

  it("falls back to honest generic advice when the file names no one", () => {
    const message = unreadablePdfMessage(ANONYMOUS);
    expect(detectPdfExporter(ANONYMOUS)).toBeNull();
    expect(message).toContain("CSV or Excel version");
    expect(message).not.toContain("→");
  });

  it("does not send an insurance policy off to find a CSV", () => {
    const message = unreadablePdfMessage(TRADING212, "document");
    expect(message).not.toContain("CSV");
    expect(message).toContain("add the details by hand");
  });

  it("never claims to have read a figure it could not read", () => {
    for (const sample of [TRADING212, IBKR, ANONYMOUS]) {
      expect(unreadablePdfMessage(sample)).toContain("nothing in it can be read honestly");
    }
  });
});
