/**
 * Date arithmetic for the life-event planner.
 *
 * Everything is done in UTC on plain `YYYY-MM-DD` strings so a projection run
 * in London in October gives the same answer as one run anywhere else.
 */

export type IsoDate = string;

export function parseDate(value: IsoDate): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function addWeeks(value: IsoDate, weeks: number): IsoDate {
  return addDays(value, weeks * 7);
}

/** Calendar-month arithmetic that clamps rather than rolling over a short month. */
export function addMonths(value: IsoDate, months: number): IsoDate {
  const date = parseDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIso(date);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** "2027-03" — the key the forecast and every monthly series is indexed by. */
export function monthKeyOf(value: IsoDate): string {
  return value.slice(0, 7);
}

export function daysInMonthOf(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month!, 0)).getUTCDate();
}

export function firstOfMonth(monthKey: string): IsoDate {
  return `${monthKey}-01`;
}

export function nextMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return month === 12
    ? `${year! + 1}-01`
    : `${year}-${String(month! + 1).padStart(2, "0")}`;
}

/**
 * The Sunday that starts the week a date falls in.
 *
 * The maternity rules count in whole weeks running Sunday to Saturday — the
 * expected week of childbirth, and the qualifying week fifteen weeks before it,
 * are both defined that way — so the arithmetic has to follow the statute
 * rather than the calendar people read.
 */
export function startOfStatutoryWeek(value: IsoDate): IsoDate {
  return addDays(value, -parseDate(value).getUTCDay());
}

/**
 * School and nursery funding terms start in January, April and September.
 * Funding for a child who qualifies mid-term starts the term after.
 */
export function nextTermStart(value: IsoDate): IsoDate {
  const date = parseDate(value);
  const year = date.getUTCFullYear();
  const candidates = [
    `${year}-01-01`,
    `${year}-04-01`,
    `${year}-09-01`,
    `${year + 1}-01-01`,
  ];
  return candidates.find((candidate) => candidate >= value) ?? candidates[3]!;
}

/** The 5 April the tax year ends on, on or after a given date. */
export function taxYearEndOnOrAfter(value: IsoDate): IsoDate {
  const year = parseDate(value).getUTCFullYear();
  const thisYear = `${year}-04-05`;
  return value <= thisYear ? thisYear : `${year + 1}-04-05`;
}

/** Whole days from today until a date; negative once it has passed. */
export function daysUntil(value: IsoDate, today: IsoDate = toIso(new Date())): number {
  return daysBetween(today, value);
}
