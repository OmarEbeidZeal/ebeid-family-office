import { describe, expect, it } from "vitest";

import {
  STATEMENT_LINES,
  TO_UNICODE_COMPLETE,
  TO_UNICODE_DIGITS_MISSING,
  TO_UNICODE_DIGITS_SPACED,
  TO_UNICODE_DIGITS_ZEROED,
  buildPdf,
} from "@/test/pdf-fixture";
import { digitsLost, extractPdfText, looksScanned } from "./statement-parse.server";

/**
 * The numeric fixture the reader has to survive. A statement whose letters
 * come through and whose figures do not is the one failure that looks like a
 * success, so every map is tested for the digits rather than for the words.
 */
const FIGURES = ["1,250.75", "3,000.00", "82.41", "46.18", "6,397.10"];

async function read(toUnicode: string) {
  return extractPdfText(buildPdf({ lines: STATEMENT_LINES, toUnicode }));
}

describe("extractPdfText — digits survive", () => {
  it("reads a well-mapped statement from the text layer", async () => {
    const pdf = await read(TO_UNICODE_COMPLETE);
    expect(pdf.reader).toBe("text-layer");
    expect(pdf.digits.ok).toBe(true);
    for (const figure of FIGURES) expect(pdf.text).toContain(figure);
  });

  it("recovers digits the character map blanks to nothing", async () => {
    const pdf = await read(TO_UNICODE_DIGITS_ZEROED);
    expect(pdf.reader).toBe("glyphs");
    expect(digitsLost(pdf)).toBe(false);
    for (const figure of FIGURES) expect(pdf.text).toContain(figure);
  });

  it("recovers digits the character map turns into spaces", async () => {
    // The dangerous one: no control characters, nothing to notice, and every
    // amount reads as "GBP  ,   .  ".
    const pdf = await read(TO_UNICODE_DIGITS_SPACED);
    expect(pdf.reader).toBe("glyphs");
    expect(digitsLost(pdf)).toBe(false);
    for (const figure of FIGURES) expect(pdf.text).toContain(figure);
  });

  it("reads digits the character map omits altogether", async () => {
    const pdf = await read(TO_UNICODE_DIGITS_MISSING);
    expect(digitsLost(pdf)).toBe(false);
    for (const figure of FIGURES) expect(pdf.text).toContain(figure);
  });

  it("keeps the words as well as the numbers when it re-reads", async () => {
    const pdf = await read(TO_UNICODE_DIGITS_SPACED);
    expect(pdf.text).toContain("Closing balance");
    expect(pdf.text).toContain("EBEID OMAR");
  });

  it("keeps each printed line on its own line", async () => {
    const pdf = await read(TO_UNICODE_COMPLETE);
    const lines = pdf.text.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(STATEMENT_LINES.length);
  });

  it("counts a page with almost nothing on it as scanned rather than broken", async () => {
    const pdf = await extractPdfText(
      buildPdf({ lines: ["Page 1"], toUnicode: TO_UNICODE_COMPLETE }),
    );
    expect(looksScanned(pdf)).toBe(true);
  });
});
