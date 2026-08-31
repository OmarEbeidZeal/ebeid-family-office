/**
 * Which months an account has statements for, and which it does not.
 *
 * Gaps are stated, never guessed at: if a month has no file covering it, the
 * spending for that month is incomplete and the household should know rather
 * than read a total that quietly understates itself.
 */
export type CoverageInput = {
  accountId: string | null;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
};

export type CoverageGap = {
  accountId: string;
  /** Months with no statement, oldest first, as YYYY-MM. */
  months: string[];
  /** The most recent month any statement covers, as YYYY-MM. */
  latest: string;
  earliest: string;
};

const COUNTED = new Set(["imported", "parsed", "needs_review"]);

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(key: string, count: number): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + count, 1));
  return monthKey(date);
}

/** Every month between two keys inclusive. */
function span(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = from;
  // A guard against a nonsense period on a badly read statement.
  for (let index = 0; index < 600 && cursor <= to; index += 1) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function monthsCovered(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return [];
  return span(monthKey(from), monthKey(to));
}

/**
 * Gaps per account: months inside the imported range with nothing covering
 * them, plus whole months since the last statement ended.
 */
export function coverageGaps(rows: CoverageInput[], today = new Date()): CoverageGap[] {
  const byAccount = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.accountId || !COUNTED.has(row.status)) continue;
    const months = monthsCovered(row.periodStart, row.periodEnd);
    if (!months.length) continue;
    const set = byAccount.get(row.accountId) ?? new Set<string>();
    for (const month of months) set.add(month);
    byAccount.set(row.accountId, set);
  }

  // The month in progress is not a gap: its statement does not exist yet.
  const currentMonth = monthKey(today);
  const lastComplete = addMonths(currentMonth, -1);

  const gaps: CoverageGap[] = [];
  for (const [accountId, set] of byAccount) {
    const sorted = [...set].sort();
    const earliest = sorted[0]!;
    const latest = sorted[sorted.length - 1]!;
    const upTo = lastComplete > latest ? lastComplete : latest;
    const missing = span(earliest, upTo).filter((month) => !set.has(month));
    if (missing.length) gaps.push({ accountId, months: missing, earliest, latest });
  }

  return gaps.sort((a, b) => b.months.length - a.months.length);
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
