/**
 * File decoding and value-parsing primitives for statement import.
 *
 * Everything here is pure and deterministic: no AI, no network, no database.
 * Bank exports from the UK, Egypt and Jordan differ in delimiter, digit set,
 * decimal separator and date order, so each of those is handled explicitly
 * rather than hoped away.
 */
import { guessMerchant, normaliseDescription, normaliseDigits, similarity } from "./text";

export { guessMerchant, normaliseDescription, normaliseDigits, similarity };

export type FileKind = "pdf" | "csv" | "xlsx";

export type RawTransaction = {
  booked_date: string;
  description: string;
  raw_description: string;
  merchant: string | null;
  amount: number;
  direction: "debit" | "credit";
  balance_after: number | null;
  currency: string | null;
};

export type DateFormat = "DMY" | "MDY" | "YMD" | "auto";

const PDF_EXTENSIONS = [".pdf"];
const CSV_EXTENSIONS = [".csv", ".txt", ".tsv"];
const SHEET_EXTENSIONS = [".xls", ".xlsx", ".xlsm"];

export function detectFileKind(fileName: string, mimeType?: string | null): FileKind | null {
  const name = fileName.toLowerCase();
  if (PDF_EXTENSIONS.some((ext) => name.endsWith(ext))) return "pdf";
  if (SHEET_EXTENSIONS.some((ext) => name.endsWith(ext))) return "xlsx";
  if (CSV_EXTENSIONS.some((ext) => name.endsWith(ext))) return "csv";

  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("sheet") || mime.includes("excel")) return "xlsx";
  if (mime.includes("csv") || mime.includes("text/plain")) return "csv";
  return null;
}

/* ------------------------------------------------------------------ amounts */

const DEBIT_MARKERS = ["dr", "d/r", "debit", "\u0645\u062F\u064A\u0646", "withdrawal", "out"];
const CREDIT_MARKERS = ["cr", "c/r", "credit", "\u062F\u0627\u0626\u0646", "deposit", "in"];

export type ParsedAmount = { value: number; explicitSign: "debit" | "credit" | null };

/**
 * Parses a monetary cell. Handles thousands separators in either convention,
 * parentheses and trailing minus for negatives, and CR/DR suffixes.
 */
export function parseAmountCell(raw: unknown): ParsedAmount | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return { value: raw, explicitSign: null };
  }

  let text = normaliseDigits(String(raw)).trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  let explicitSign: "debit" | "credit" | null = null;
  if (DEBIT_MARKERS.some((marker) => new RegExp(`(^|[^a-z])${marker}([^a-z]|$)`).test(lower))) {
    explicitSign = "debit";
  } else if (
    CREDIT_MARKERS.some((marker) => new RegExp(`(^|[^a-z])${marker}([^a-z]|$)`).test(lower))
  ) {
    explicitSign = "credit";
  }

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/-\s*$/.test(text)) {
    negative = true;
    text = text.replace(/-\s*$/, "");
  }
  if (/^\s*-/.test(text)) {
    negative = true;
  }

  // Strip everything that isn't a digit, separator or sign.
  const cleaned = text.replace(/[^0-9.,\-]/g, "");
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;

  const body = cleaned.replace(/-/g, "");
  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");

  let normalised: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever appears last is the decimal separator.
    normalised =
      lastComma > lastDot ? body.replace(/\./g, "").replace(",", ".") : body.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = body.length - lastComma - 1;
    const commaCount = (body.match(/,/g) ?? []).length;
    normalised =
      commaCount === 1 && decimals !== 3 ? body.replace(",", ".") : body.replace(/,/g, "");
  } else {
    normalised = body;
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -Math.abs(value) : value, explicitSign };
}

/* -------------------------------------------------------------------- dates */

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  // Arabic month names as they appear in Egyptian and Jordanian exports
  "\u064A\u0646\u0627\u064A\u0631": 1,
  "\u0641\u0628\u0631\u0627\u064A\u0631": 2,
  "\u0645\u0627\u0631\u0633": 3,
  "\u0623\u0628\u0631\u064A\u0644": 4,
  "\u0645\u0627\u064A\u0648": 5,
  "\u064A\u0648\u0646\u064A\u0648": 6,
  "\u064A\u0648\u0644\u064A\u0648": 7,
  "\u0623\u063A\u0633\u0637\u0633": 8,
  "\u0633\u0628\u062A\u0645\u0628\u0631": 9,
  "\u0623\u0643\u062A\u0648\u0628\u0631": 10,
  "\u0646\u0648\u0641\u0645\u0628\u0631": 11,
  "\u062F\u064A\u0633\u0645\u0628\u0631": 12,
};

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const fullYear = year < 100 ? (year > 70 ? 1900 + year : 2000 + year) : year;
  if (fullYear < 1950 || fullYear > 2100) return null;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Excel keeps dates as a serial day count from 1899-12-30. */
function fromExcelSerial(serial: number): string | null {
  if (serial < 20000 || serial > 60000) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Returns an ISO yyyy-mm-dd string, or null when the cell isn't a date. */
export function parseDateCell(raw: unknown, format: DateFormat = "auto"): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number") return fromExcelSerial(raw);

  const text = normaliseDigits(String(raw)).trim();
  if (!text) return null;

  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = fromExcelSerial(Number(text));
    if (serial) return serial;
  }

  // ISO first: unambiguous.
  const isoMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  // 12 Feb 2025 / Feb 12, 2025 / 12-FEB-25
  const nameMatch = text
    .toLowerCase()
    .match(/(\d{1,2})[\s\-/.]*([a-z\u0600-\u06FF]{3,12})[\s\-/.,]*(\d{2,4})/);
  if (nameMatch && MONTH_NAMES[nameMatch[2]!]) {
    return iso(Number(nameMatch[3]), MONTH_NAMES[nameMatch[2]!]!, Number(nameMatch[1]));
  }
  const nameFirst = text
    .toLowerCase()
    .match(/([a-z\u0600-\u06FF]{3,12})[\s\-/.]*(\d{1,2})[\s\-/.,]*(\d{2,4})/);
  if (nameFirst && MONTH_NAMES[nameFirst[1]!]) {
    return iso(Number(nameFirst[3]), MONTH_NAMES[nameFirst[1]!]!, Number(nameFirst[2]));
  }

  const numeric = text.match(/(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (!numeric) return null;
  const a = Number(numeric[1]);
  const b = Number(numeric[2]);
  const c = Number(numeric[3]);

  if (String(numeric[1]).length === 4) return iso(a, b, c);

  if (format === "MDY") return iso(c, a, b);
  if (format === "DMY") return iso(c, b, a);
  if (format === "YMD") return iso(a, b, c);

  // auto: the only unambiguous signal is a value above 12.
  if (a > 12) return iso(c, b, a);
  if (b > 12) return iso(c, a, b);
  return iso(c, b, a); // UK-first household: day/month wins ties
}

/**
 * Looks across a column of date cells and decides day-first vs month-first.
 * Returns null when the sample can't distinguish them.
 */
export function inferDateOrder(samples: string[]): DateFormat | null {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const sample of samples) {
    const match = normaliseDigits(sample).match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a > 12 && b <= 12) dayFirst += 1;
    else if (b > 12 && a <= 12) monthFirst += 1;
  }
  if (dayFirst > monthFirst) return "DMY";
  if (monthFirst > dayFirst) return "MDY";
  return null;
}

/* -------------------------------------------------------------- description */

/**
 * Identity of a transaction for duplicate detection: the same money, on the
 * same day, described the same way, in the same account.
 */
export function fingerprintOf(input: {
  booked_date: string;
  amount: number;
  direction: string;
  description: string;
}): string {
  const description = normaliseDescription(input.description).slice(0, 60);
  return [
    input.booked_date,
    Math.round(Math.abs(input.amount) * 100),
    input.direction,
    description,
  ].join("|");
}

/* ---------------------------------------------------------------- file input */

export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // A replacement-character storm means the file is almost certainly Windows-1252.
  const replacements = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacements > utf8.length * 0.005) {
    try {
      return new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, "");
    } catch {
      /* fall through to the utf-8 read */
    }
  }
  return utf8.replace(/^\uFEFF/, "");
}

export async function parseDelimitedRows(text: string): Promise<string[][]> {
  const { default: Papa } = await import("papaparse");
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  return (result.data ?? []).map((row) => row.map((cell) => (cell ?? "").toString().trim()));
}

export async function parseWorkbookRows(bytes: Uint8Array): Promise<string[][]> {
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: "",
  });
  return rows.map((row) =>
    (row ?? []).map((cell) =>
      cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "").trim(),
    ),
  );
}

export type PdfText = { text: string; pages: number };

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(document, { mergePages: true });
  return { text: Array.isArray(text) ? text.join("\n") : text, pages: totalPages };
}

export const SCANNED_PDF_MESSAGE =
  "This looks like a scanned PDF with no text layer — try downloading the CSV from your bank instead.";

/** A statement page with real text carries far more than a few stray characters. */
export function looksScanned(pdf: PdfText): boolean {
  const meaningful = pdf.text.replace(/\s+/g, "");
  const perPage = meaningful.length / Math.max(1, pdf.pages);
  return meaningful.length < 200 || perPage < 80;
}
