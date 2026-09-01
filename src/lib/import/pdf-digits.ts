/**
 * Whether a PDF's digits survived extraction.
 *
 * Some exporters — Trading 212's statements are the household's own example —
 * embed a font whose character map covers the letters and not the numerals.
 * A reader that trusts that map returns "£3,000.00" as "£ ,   .  ": the words
 * are all there, the file looks read, and every figure in it is gone. That is
 * the worst failure this importer can have, because nothing about it looks
 * like a failure.
 *
 * So every PDF is measured before it is believed. A bank statement, a payslip,
 * a tenancy agreement and an insurance schedule all print far more digits than
 * currency symbols; text that carries the symbols and not the digits has lost
 * its numbers somewhere between the page and here, and is refused rather than
 * read.
 *
 * Pure and dependency-free so it can guard both the statement path and the
 * documents path, and be tested without a PDF.
 */

/** Symbols and codes that only appear beside a figure. */
const CURRENCY_MARK =
  /[£$€¥₣₤₨₪﷼]|\b(?:GBP|USD|EUR|EGP|JOD|AED|SAR|CHF|CAD|AUD|JPY|LE|EGP)\b/gi;

export type DigitIntegrity = {
  digits: number;
  letters: number;
  /** Currency symbols and ISO codes — each one should sit beside a figure. */
  currencyMarks: number;
  /** Digits printed per currency mark, or null when nothing priced appears. */
  digitsPerMark: number | null;
  ok: boolean;
  /** Why it failed, for the note that goes on the statement. */
  reason: "ok" | "digits_missing" | "no_digits";
};

/**
 * A statement line prints at least "1,234.56" — six digits — against one
 * currency mark, and most files print the mark once in a header and the digits
 * on every row. Two digits per mark is far below anything real and far above
 * the zero a broken font produces.
 */
const MIN_DIGITS_PER_MARK = 2;

/** Below this there is too little text to judge; `looksScanned` handles it. */
const MIN_LETTERS = 150;

export function digitIntegrity(text: string): DigitIntegrity {
  const digits = (text.match(/[0-9]/g) ?? []).length;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const currencyMarks = (text.match(CURRENCY_MARK) ?? []).length;
  const digitsPerMark = currencyMarks > 0 ? digits / currencyMarks : null;

  // Real text with no digit at all in it: no statement, payslip, policy or
  // tenancy exists without a date, let alone a figure.
  if (letters >= MIN_LETTERS && digits === 0) {
    return { digits, letters, currencyMarks, digitsPerMark, ok: false, reason: "no_digits" };
  }

  if (
    letters >= MIN_LETTERS &&
    currencyMarks >= 2 &&
    digitsPerMark !== null &&
    digitsPerMark < MIN_DIGITS_PER_MARK
  ) {
    return { digits, letters, currencyMarks, digitsPerMark, ok: false, reason: "digits_missing" };
  }

  return { digits, letters, currencyMarks, digitsPerMark, ok: true, reason: "ok" };
}
