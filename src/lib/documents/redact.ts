/**
 * What never gets stored.
 *
 * Policy schedules, tenancy agreements and payslips carry identifiers a bank
 * statement does not. The rules here are absolute:
 *
 *   - A National Insurance number is never stored. Not masked, not hashed,
 *     not in a typed column and not in the extracted jsonb. It is stripped out
 *     of the text *before* the text ever reaches a model, so there is no copy
 *     of it anywhere in the pipeline.
 *   - Policy, payroll and tenancy reference numbers are reduced to their last
 *     four characters, exactly as account numbers already are.
 *
 * Pure and client-safe, so the same rules apply wherever a value is handled.
 */

/**
 * A National Insurance number as printed: two prefix letters (the excluded
 * ones are those HMRC never issues), six digits in any spacing, an optional
 * suffix letter. Deliberately a shade broader than the strict format — an
 * over-redaction costs nothing, a missed one is a stored identifier.
 */
const NINO_BARE =
  /\b[ABCEGHJKLMNOPRSTWXYZ][ABCEGHJKLMNPRSTWXYZ][ -]?\d{2}[ -]?\d{2}[ -]?\d{2}[ -]?[A-D]?\b/g;

/** "NI number: AB 12 34 56 C", "National Insurance No. AB123456C", "NINO AB123456C". */
const NINO_LABELLED =
  /((?:national\s+insurance|nat\.?\s*ins\.?|\bni\b|\bnino\b)\s*(?:number|no\.?|num\.?|#)?\s*[:\-–]?\s*)([A-Z][A-Z][ -]?\d{2}[ -]?\d{2}[ -]?\d{2}[ -]?[A-D]?)/gi;

export const NI_PLACEHOLDER = "[not stored]";

/**
 * Remove every National Insurance number from a block of text. Applied to the
 * document body before extraction, so a model never sees one either.
 */
export function stripNationalInsurance(text: string): string {
  if (!text) return text;
  return text.replace(NINO_LABELLED, (_match, label: string) => `${label}${NI_PLACEHOLDER}`).replace(
    NINO_BARE,
    NI_PLACEHOLDER,
  );
}

/** True when a string still looks like it carries one. Used by the tests. */
export function containsNationalInsurance(text: string): boolean {
  NINO_BARE.lastIndex = 0;
  return NINO_BARE.test(text ?? "");
}

/* --------------------------------------------------------------- masking */

/**
 * A reference reduced to what a human needs to recognise it: the last four
 * alphanumeric characters. Returns null when there is not enough left to be
 * worth storing.
 */
export function maskReference(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length < 2) return null;
  return cleaned.slice(-4);
}

/** "···· 8213" — safe to render anywhere. */
export function referenceLabel(lastFour: string | null | undefined): string | null {
  if (!lastFour) return null;
  return `···· ${lastFour}`;
}

/* --------------------------------------------- redacting extracted output */

/** Keys whose value is dropped outright, whatever it holds. */
const DROP_KEY =
  /(national[_ ]?insurance|^ni[_ ]?(number|no)$|nino|passport|date[_ ]?of[_ ]?birth|\bdob\b|sort[_ ]?code|bank[_ ]?account|iban|utr|tax[_ ]?reference)/i;

/** Keys whose value is kept only as a last-four mask. */
const MASK_KEY =
  /(policy[_ ]?(number|no|ref)|payroll[_ ]?(number|no|ref|id)|employee[_ ]?(number|no|id)|membership[_ ]?(number|no)|certificate[_ ]?(number|no)|tenancy[_ ]?(reference|number|no)|deposit[_ ]?(reference|certificate)|reference[_ ]?(number|no)|^reference$|account[_ ]?number)/i;

/** Keys already holding a mask, which must be left exactly as they are. */
const ALREADY_MASKED = /_last4$/i;

type Json = unknown;

/**
 * Walk anything the extractor returned and apply the same rules the typed
 * columns get: identifiers masked, National Insurance numbers gone, free text
 * scrubbed. The jsonb is a full copy of what was read, so it is the one place
 * a leak would otherwise hide.
 */
export function redactExtracted(value: Json): Json {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") return stripNationalInsurance(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) return value.map((entry) => redactExtracted(entry));

  if (typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [key, entry] of Object.entries(value as Record<string, Json>)) {
      if (ALREADY_MASKED.test(key)) {
        out[key] = typeof entry === "string" ? entry : entry === null ? null : String(entry);
        continue;
      }
      if (DROP_KEY.test(key)) continue;
      if (MASK_KEY.test(key)) {
        const masked = maskReference(typeof entry === "string" ? entry : null);
        if (masked) out[`${key}_last4`] = masked;
        continue;
      }
      out[key] = redactExtracted(entry);
    }
    return out;
  }

  return null;
}
