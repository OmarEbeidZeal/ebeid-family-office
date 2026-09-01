/**
 * Pure text helpers shared by the import pipeline (server) and the review UI
 * (browser). No I/O, no environment assumptions.
 *
 * Statements are English-language throughout, so these are plain Latin-script
 * helpers with no transliteration or numeral conversion.
 */

/**
 * Characters the database refuses to store. Postgres rejects NUL inside `text`
 * and inside `jsonb` alike — a PDF whose font map leaves glyphs unmapped hands
 * back exactly that, and the insert fails with "unsupported Unicode escape
 * sequence" rather than anything a household could act on. The other C0
 * controls carry no meaning in a statement either; tab, newline and carriage
 * return are kept because they carry layout.
 */
const UNSTORABLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** The same text with every unstorable control character removed. */
export function scrubText(value: string): string {
  return value.replace(UNSTORABLE, "");
}


/**
 * Every string inside a parsed result, scrubbed. Extraction output is written
 * to `jsonb` columns whole, so one unmapped glyph anywhere in it fails the
 * write — this runs once at the boundary rather than at every field.
 */
export function scrubDeep<T>(value: T): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (Array.isArray(value)) return value.map((entry) => scrubDeep(entry)) as T;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) out[key] = scrubDeep(source[key]);
    return out as T;
  }
  return value;
}

/**
 * How much of the text came back as unmapped glyphs, ignoring whitespace.
 *
 * Some brokers ship PDFs whose embedded font has no usable character map for
 * digits: the page looks right on screen and extracts as NUL wherever a number
 * should be. Nothing in that text can be trusted, so it is caught rather than
 * guessed at.
 */
export function unreadableRatio(text: string): number {
  const meaningful = text.replace(/\s/g, "");
  if (!meaningful.length) return 0;
  const unmapped = meaningful.match(/[\u0000\uFFFD]/g)?.length ?? 0;
  return unmapped / meaningful.length;
}

export function normaliseDescription(value: string): string {
  return value
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
