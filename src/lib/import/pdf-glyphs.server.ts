/**
 * Reading a PDF one glyph at a time, when the ordinary text layer loses digits.
 *
 * A PDF font carries up to three separate answers to "what character is this?"
 * — the `ToUnicode` map the file declares, the glyph the viewer draws, and the
 * character code in the content stream itself. Trading 212's statements
 * declare a `ToUnicode` map that covers the letters and blanks the numerals,
 * so a reader that stops at the first answer returns a statement with every
 * figure missing and no sign that anything went wrong.
 *
 * Poppler's `pdftotext` gets those files right because it falls through to the
 * next answer instead of trusting the first. This does the same, from the
 * operator list rather than the text layer: for each glyph, the declared
 * unicode, then the drawn glyph, then the raw character code — and the last of
 * those only for fonts that have already proved, on the characters that did
 * map, that their codes are ASCII. Nothing is guessed; a glyph with no honest
 * answer is dropped and the digit guard refuses the file.
 *
 * Layout is reconstructed from the text matrix, in the manner of
 * `pdftotext -layout`, so columns stay in columns.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Apply `m`, then `n` — the order PDF composes transforms in. */
function mul(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function asMatrix(args: unknown): Matrix {
  const values = Array.isArray(args) ? args.map(Number) : [];
  return [
    values[0] ?? 1,
    values[1] ?? 0,
    values[2] ?? 0,
    values[3] ?? 1,
    values[4] ?? 0,
    values[5] ?? 0,
  ];
}

type Glyph = {
  originalCharCode?: number;
  fontChar?: string;
  unicode?: string;
  width?: number;
  isSpace?: boolean;
};

type Part = Glyph | number;

type Run = {
  page: number;
  x: number;
  y: number;
  /** Font size in device units — what lines are grouped by. */
  size: number;
  font: string;
  parts: Part[];
};

/* ----------------------------------------------------------- glyph decoding */

const PRIVATE_START = 0xe000;
const PRIVATE_END = 0xf8ff;

/** A character that carries meaning, rather than a hole where one should be. */
function usable(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    if (code >= PRIVATE_START && code <= PRIVATE_END) continue;
    if (code === 0xfffd) continue;
    return true;
  }
  return false;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * A space the font declares for a code that is not the space code is not a
 * space — it is a numeral the `ToUnicode` map blanked out.
 */
function honestSpace(value: string, code: number | undefined): boolean {
  return value.trim().length > 0 || code === 32;
}

function decodeGlyph(glyph: Glyph, codesAreAscii: boolean): string {
  const code = glyph.originalCharCode;

  const unicode = asText(glyph.unicode);
  if (unicode && usable(unicode) && honestSpace(unicode, code)) return unicode;

  const drawn = asText(glyph.fontChar);
  if (drawn && usable(drawn) && honestSpace(drawn, code)) return drawn;

  if (codesAreAscii && typeof code === "number" && code >= 32 && code <= 126) {
    return String.fromCharCode(code);
  }

  return "";
}

/**
 * Does this font's own evidence say its character codes are ASCII?
 *
 * Every glyph that did map is a test of the claim. When the letters that came
 * through all sit at their ASCII codes, the numerals that did not came from
 * the same simple encoding and their codes can be trusted. A CID font, whose
 * codes are glyph indices, fails this test and never reaches the third rung.
 */
function asciiCodedFonts(runs: Run[]): Set<string> {
  const stats = new Map<string, { agree: number; total: number }>();

  for (const run of runs) {
    for (const part of run.parts) {
      if (typeof part === "number") continue;
      const code = part.originalCharCode;
      if (typeof code !== "number" || code < 32 || code > 126) continue;
      const unicode = asText(part.unicode);
      if (!unicode || !usable(unicode) || unicode.length !== 1) continue;

      const entry = stats.get(run.font) ?? { agree: 0, total: 0 };
      entry.total += 1;
      if (unicode === String.fromCharCode(code)) entry.agree += 1;
      stats.set(run.font, entry);
    }
  }

  const trusted = new Set<string>();
  for (const [font, entry] of stats) {
    if (entry.total >= 8 && entry.agree / entry.total >= 0.95) trusted.add(font);
  }
  return trusted;
}

/* ------------------------------------------------------------- the walker */

function collectRuns(list: { fnArray: number[]; argsArray: any[] }, ops: any, page: number): Run[] {
  const runs: Run[] = [];

  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let lineMatrix: Matrix = IDENTITY;

  let size = 0;
  let charSpacing = 0;
  let wordSpacing = 0;
  let hscale = 1;
  let leading = 0;
  let rise = 0;
  let font = "";

  const moveLine = (x: number, y: number) => {
    lineMatrix = mul([1, 0, 0, 1, x, y], lineMatrix);
    tm = lineMatrix;
  };

  const show = (parts: unknown) => {
    if (!Array.isArray(parts) || !parts.length) return;

    const placed = mul(tm, ctm);
    const scale = Math.hypot(placed[0], placed[1]) || Math.hypot(placed[2], placed[3]) || 1;

    runs.push({
      page,
      x: placed[4],
      y: placed[5] + rise * placed[3],
      size: Math.abs(size) * scale,
      font,
      parts: parts as Part[],
    });

    let advance = 0;
    for (const part of parts as Part[]) {
      if (typeof part === "number") {
        advance += (-part / 1000) * size * hscale;
        continue;
      }
      const width = (part.width ?? 0) / 1000;
      advance += (width * size + charSpacing + (part.isSpace ? wordSpacing : 0)) * hscale;
    }
    tm = mul([1, 0, 0, 1, advance, 0], tm);
  };

  for (let index = 0; index < list.fnArray.length; index += 1) {
    const fn = list.fnArray[index];
    const args = list.argsArray[index] ?? [];

    switch (fn) {
      case ops.save:
        stack.push(ctm);
        break;
      case ops.restore:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case ops.transform:
        ctm = mul(asMatrix(args), ctm);
        break;
      case ops.beginText:
        tm = IDENTITY;
        lineMatrix = IDENTITY;
        break;
      case ops.setFont:
        font = String(args[0] ?? "");
        size = Number(args[1]) || 0;
        break;
      case ops.setTextMatrix:
        tm = asMatrix(args);
        lineMatrix = tm;
        break;
      case ops.setLeading:
        leading = Number(args[0]) || 0;
        break;
      case ops.setLeadingMoveText:
        leading = -(Number(args[1]) || 0);
        moveLine(Number(args[0]) || 0, Number(args[1]) || 0);
        break;
      case ops.moveText:
        moveLine(Number(args[0]) || 0, Number(args[1]) || 0);
        break;
      case ops.nextLine:
        moveLine(0, -leading);
        break;
      case ops.setCharSpacing:
        charSpacing = Number(args[0]) || 0;
        break;
      case ops.setWordSpacing:
        wordSpacing = Number(args[0]) || 0;
        break;
      case ops.setHScale:
        hscale = (Number(args[0]) || 100) / 100;
        break;
      case ops.setTextRise:
        rise = Number(args[0]) || 0;
        break;
      case ops.showText:
        show(args[0]);
        break;
      case ops.showSpacedText:
        show(args[0]);
        break;
      case ops.nextLineShowText:
        moveLine(0, -leading);
        show(args[0]);
        break;
      case ops.nextLineSetSpacingShowText:
        wordSpacing = Number(args[0]) || 0;
        charSpacing = Number(args[1]) || 0;
        moveLine(0, -leading);
        show(args[2]);
        break;
      default:
        break;
    }
  }

  return runs;
}

/* ------------------------------------------------------------------ layout */

type Item = { x: number; y: number; size: number; text: string };

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

const MAX_COLUMN = 400;

/** One page laid out on a character grid, the way `pdftotext -layout` does. */
function layoutPage(items: Item[]): string {
  if (!items.length) return "";

  const sizes = items.map((item) => item.size).filter((size) => size > 0);
  const typical = median(sizes) || 10;
  const unit = Math.max(1, typical * 0.5);
  const tolerance = Math.max(1, typical * 0.4);
  const minX = Math.min(...items.map((item) => item.x));

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  let current: Item[] = [];
  let anchor = Number.NaN;

  for (const item of sorted) {
    if (!current.length || Math.abs(item.y - anchor) <= tolerance) {
      if (!current.length) anchor = item.y;
      current.push(item);
      continue;
    }
    lines.push(current);
    current = [item];
    anchor = item.y;
  }
  if (current.length) lines.push(current);

  return lines
    .map((line) => {
      let out = "";
      for (const item of [...line].sort((a, b) => a.x - b.x)) {
        const column = Math.min(MAX_COLUMN, Math.max(0, Math.round((item.x - minX) / unit)));
        if (column > out.length) out += " ".repeat(column - out.length);
        else if (out.length && !out.endsWith(" ")) out += " ";
        out += item.text;
      }
      return out.trimEnd();
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/* ------------------------------------------------------------------ public */

export type GlyphText = { text: string; pages: number };

/**
 * Re-read a PDF from its drawing operations. Takes a pdf.js document proxy the
 * caller has already opened, so the file is only parsed once.
 */
export async function extractGlyphText(document: any): Promise<GlyphText> {
  const { getResolvedPDFJS } = await import("unpdf");
  const pdfjs: any = await getResolvedPDFJS();
  const ops = pdfjs.OPS;

  const pageCount: number = Number(document.numPages) || 0;
  const byPage: Run[][] = [];
  const all: Run[] = [];

  for (let number = 1; number <= pageCount; number += 1) {
    const page = await document.getPage(number);
    try {
      const list = await page.getOperatorList();
      const runs = collectRuns(list, ops, number);
      byPage.push(runs);
      all.push(...runs);
    } finally {
      page.cleanup?.();
    }
  }

  const trusted = asciiCodedFonts(all);

  const pages = byPage.map((runs) => {
    const items: Item[] = [];
    for (const run of runs) {
      const codesAreAscii = trusted.has(run.font);
      let text = "";
      for (const part of run.parts) {
        if (typeof part === "number") {
          // A wide negative kern is the file spacing columns apart, not kerning.
          if (part <= -180) text += " ";
          continue;
        }
        text += decodeGlyph(part, codesAreAscii);
      }
      if (text.trim().length === 0) continue;
      items.push({ x: run.x, y: run.y, size: run.size, text });
    }
    return layoutPage(items);
  });

  return { text: pages.filter((page) => page.length > 0).join("\n\n"), pages: pageCount };
}
