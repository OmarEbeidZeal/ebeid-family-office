/**
 * Pure text helpers shared by the import pipeline (server) and the review UI
 * (browser). No I/O, no environment assumptions.
 */

const EASTERN_ARABIC = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
const PERSIAN = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";

/** Egyptian and Jordanian exports often carry Eastern-Arabic numerals. */
export function normaliseDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const eastern = EASTERN_ARABIC.indexOf(char);
    if (eastern >= 0) {
      out += String(eastern);
      continue;
    }
    const persian = PERSIAN.indexOf(char);
    if (persian >= 0) {
      out += String(persian);
      continue;
    }
    if (char === "\u066C")
      out += ","; // Arabic thousands separator
    else if (char === "\u066B")
      out += "."; // Arabic decimal separator
    else out += char;
  }
  return out;
}

export function normaliseDescription(value: string): string {
  return normaliseDigits(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NOISE_PATTERNS: RegExp[] = [
  /\b(card|visa|mastercard|maestro)\s*(no\.?|ending|\*+)?\s*[*x\d]{4,}\b/gi,
  /\b\d{2}[:.]\d{2}(?::\d{2})?\b/g,
  /\bref(erence)?[:.# ]+\S+/gi,
  /\bon \d{1,2} \w{3}\b/gi,
];

/** A merchant guess that is always a substring of the description — never invented. */
export function guessMerchant(description: string): string | null {
  let text = description;
  for (const pattern of NOISE_PATTERNS) text = text.replace(pattern, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const cut = text.split(/\s{2,}|,|\||\s+-\s+/)[0] ?? text;
  const words = cut.split(" ").filter(Boolean).slice(0, 4).join(" ");
  const merchant = (words || cut).trim();
  if (merchant.length < 2) return null;
  return merchant.length > 60 ? merchant.slice(0, 60).trim() : merchant;
}

/** Dice coefficient over character bigrams — cheap near-match for descriptions. */
export function similarity(a: string, b: string): number {
  const left = normaliseDescription(a);
  const right = normaliseDescription(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const count = bigrams.get(gram) ?? 0;
    if (count > 0) {
      bigrams.set(gram, count - 1);
      hits += 1;
    }
  }
  return (2 * hits) / (left.length - 1 + right.length - 1);
}

/**
 * The pattern offered when a household corrects a category: the stable part of
 * the description, with card numbers, dates and references stripped out.
 */
export function suggestRulePattern(description: string, merchant?: string | null): string {
  const source = (merchant ?? "").trim().length >= 3 ? merchant!.trim() : description;
  let text = source;
  for (const pattern of NOISE_PATTERNS) text = text.replace(pattern, " ");
  text = text
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").filter(Boolean).slice(0, 3).join(" ");
  return (words || description).slice(0, 60).trim().toUpperCase();
}
