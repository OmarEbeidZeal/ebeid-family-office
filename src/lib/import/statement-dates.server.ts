/**
 * Dating a row that prints no year.
 *
 * NatWest's PDF statements print `26 Aug` on every line and the year only in
 * the header — `From 31/08/2024 To 31/08/2025`. Anything that guesses "this
 * year" files twelve months of a household's spending into the wrong twelve
 * months, quietly, and the totals still add up.
 *
 * So the year comes from the statement's own period: take the year of the
 * period end, and roll back one when that would put the row after the
 * statement finished. A date that still falls outside the period is not
 * imported at all — a row this reader cannot place is a row it must not
 * invent a place for.
 *
 * Pure, and independent of any one bank.
 */
import { parseDateCell, type DateFormat } from "../statement-parse.server";

export type StatementPeriod = {
  start: string | null;
  end: string | null;
};

export type ResolvedDate = {
  date: string | null;
  /** True when the year came from the period rather than from the page. */
  inferred: boolean;
  reason: "printed" | "inferred" | "outside_period" | "unreadable";
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** `26 Aug`, `26-Aug`, `Aug 26`, `26/08` — a day and a month, and no year. */
function dayMonthOnly(raw: string): { day: number; month: number } | null {
  const text = raw.trim();
  if (!text || /\d{4}/.test(text)) return null;

  const dayFirst = text.match(/^(\d{1,2})\s*[-/.\s]?\s*([A-Za-z]{3,9})\.?$/);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]!.slice(0, 3).toLowerCase()];
    if (month) return { day: Number(dayFirst[1]), month };
  }

  const monthFirst = text.match(/^([A-Za-z]{3,9})\.?\s*[-/.\s]?\s*(\d{1,2})$/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]!.slice(0, 3).toLowerCase()];
    if (month) return { day: Number(monthFirst[2]), month };
  }

  // `26/08` with no year. Day-first: every statement this reader handles is.
  const numeric = text.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})$/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) return { day: a, month: b };
    if (b >= 1 && b <= 31 && a >= 1 && a <= 12) return { day: b, month: a };
  }

  return null;
}

function isoOf(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null;
  if (date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Which year a day-and-month belongs to, given when the statement ran.
 *
 * The period end is the anchor: a row dated later in the year than the
 * statement ended cannot be from the ending year, so it belongs to the one
 * before. A period spanning more than a year cannot be resolved this way and
 * is refused rather than guessed at.
 */
export function inferYearFromPeriod(
  day: number,
  month: number,
  period: StatementPeriod,
): string | null {
  const end = period.end ?? period.start;
  if (!end) return null;

  const endYear = Number(end.slice(0, 4));
  if (!Number.isFinite(endYear)) return null;

  const sameYear = isoOf(endYear, month, day);
  if (sameYear && sameYear <= end) return sameYear;

  const previous = isoOf(endYear - 1, month, day);
  // 29 February only exists in one of the two candidate years.
  return previous ?? sameYear;
}

function withinPeriod(date: string, period: StatementPeriod): boolean {
  if (period.start && date < period.start) return false;
  if (period.end && date > period.end) return false;
  return true;
}

/**
 * Turn what the row printed into an ISO date.
 *
 * A full date is taken as printed. A day and a month have their year inferred
 * from the period, and are rejected outright when the result falls outside it
 * — better to import a statement short of a row and say so than to import a
 * row filed a year from where it happened.
 */
export function resolveStatementDate(
  printed: unknown,
  period: StatementPeriod,
  format: DateFormat = "auto",
): ResolvedDate {
  const raw = typeof printed === "string" ? printed.trim() : printed;

  if (typeof raw === "string") {
    const partial = dayMonthOnly(raw);
    if (partial) {
      const date = inferYearFromPeriod(partial.day, partial.month, period);
      if (!date) return { date: null, inferred: false, reason: "unreadable" };
      if (!withinPeriod(date, period)) {
        return { date: null, inferred: true, reason: "outside_period" };
      }
      return { date, inferred: true, reason: "inferred" };
    }
  }

  const printedDate = parseDateCell(raw, "YMD") ?? parseDateCell(raw, format);
  if (printedDate) return { date: printedDate, inferred: false, reason: "printed" };
  return { date: null, inferred: false, reason: "unreadable" };
}
