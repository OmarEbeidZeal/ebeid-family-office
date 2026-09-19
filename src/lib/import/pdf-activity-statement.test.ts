/**
 * A Trading 212 annual or activity statement whose font maps no digits.
 *
 * Nothing on the page can be read, so the household is told what the file is,
 * why it cannot be imported, and — the part that matters — that the CSV exports
 * already cover it, so there is nothing to chase.
 */
import { describe, expect, it } from "vitest";
import { digitsLostPdfMessage } from "./pdf-guidance";

const ACTIVITY = "Trading 212 Activity Statement for the period 6 April 2024 to 5 April 2025";
const ANNUAL = "Trading 212 Annual Statement 2024/25";

describe("the message for an unreadable broker statement", () => {
  it("names it an activity statement and points at the CSVs", () => {
    const message = digitsLostPdfMessage(ACTIVITY);

    expect(message).toContain("activity statement");
    expect(message).toContain("not a transaction export");
    expect(message).toMatch(/font maps no digits/i);
    expect(message).toMatch(/CSV exports? carry the same orders/i);
    expect(message).toMatch(/nothing to upload again/i);
  });

  it("names an annual statement as an annual statement", () => {
    expect(digitsLostPdfMessage(ANNUAL)).toContain("annual statement");
  });

  it("keeps the ordinary digit-loss guidance for an ordinary statement", () => {
    const message = digitsLostPdfMessage("NatWest Your transactions 31/08/2024 to 31/08/2025");
    expect(message).not.toContain("not a transaction export");
  });
});
