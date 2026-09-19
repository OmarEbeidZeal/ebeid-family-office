/**
 * Reading everything again, from the files.
 *
 * The readers have been corrected several times, and every correction leaves the
 * database holding what the old reader believed: transactions that should never
 * have existed, accounts that pooled two people's money, snapshots of £0.00,
 * advisor notes reasoned from all of it. Re-uploading is not the answer — the
 * files are already here, and the household should not have to go and find them
 * again.
 *
 * So this clears everything the importer produced, keeps everything the
 * household typed, and puts every file back in the queue. The pure parts live
 * here so the ordering, the predicates and the reset are testable without a
 * database.
 */

/** Rows the household created themselves are never touched by any of this. */
export const PROTECTED_TABLES = [
  "assets",
  "liabilities",
  "goals",
  "goal_line_items",
  "income_streams",
  "categories",
  "category_rules",
  "investment_mandates",
  "profiles",
  "households",
  "tax_allowances",
  "insurance_policies",
  "tenancies",
  "payslips",
] as const;

export type SnapshotLike = {
  total_assets: number | string | null;
  total_liabilities: number | string | null;
  breakdown?: unknown;
};

const num = (value: number | string | null | undefined) =>
  value === null || value === undefined ? 0 : Number(value);

function emptyBreakdown(breakdown: unknown): boolean {
  if (breakdown === null || breakdown === undefined) return true;
  if (Array.isArray(breakdown)) return breakdown.length === 0;
  if (typeof breakdown === "object") return Object.keys(breakdown as object).length === 0;
  return false;
}

/**
 * A snapshot of a household that owned nothing and owed nothing, with nothing
 * behind it. Nineteen of these were written while every balance was unknown, and
 * they draw a trend line through zero.
 */
export function isEmptySnapshot(row: SnapshotLike): boolean {
  return num(row.total_assets) === 0 && num(row.total_liabilities) === 0 && emptyBreakdown(row.breakdown);
}

/** `path/to/file.csv` → `path/to/file.csv.extract.json`, as the reader writes it. */
export function cachePathOf(filePath: string): string {
  return `${filePath}.extract.json`;
}

export function isCacheObject(path: string): boolean {
  return path.endsWith(".extract.json");
}

/** The file a cache belongs to, or the path itself when it is not a cache. */
export function subjectOf(path: string): string {
  return isCacheObject(path) ? path.slice(0, -".extract.json".length) : path;
}

/**
 * Objects in storage that no row points at any more — including the four
 * `*-fixture.csv` files a test run left behind. A cache whose file is still
 * referenced is not orphaned; a cache whose file is gone is.
 */
export function orphanObjects(paths: string[], referenced: Iterable<string>): string[] {
  const kept = new Set(referenced);
  return paths.filter((path) => !kept.has(subjectOf(path)));
}

/**
 * Everything the last reading concluded, cleared. The file, the account it was
 * confirmed against and its fingerprint stay: this is a re-read, not a
 * re-upload, and nothing should import twice because of it.
 */
export function statementResetPatch(): Record<string, unknown> {
  return {
    status: "queued",
    attempts: 0,
    next_attempt_at: null,
    locked_at: null,
    error_message: null,
    parsed_at: null,
    transaction_count: null,
    duplicate_count: 0,
    discrepancy: null,
    opening_balance: null,
    closing_balance: null,
    period_start: null,
    period_end: null,
    summary: null,
    source_format: null,
    format_version: null,
    detected_institution: null,
    detected_institution_domain: null,
    detected_holder: null,
    detected_last4: null,
    detected_identifier_kind: null,
    detected_country: null,
    detected_account_type: null,
    match_confidence: null,
    match_reason: null,
  };
}

/** Statuses that mean a reader is mid-file; nothing may be deleted under it. */
export const BUSY_STATUSES = ["parsing", "extracting"] as const;

export function busyRefusal(busy: number, locked: number): string | null {
  if (busy > 0) {
    return busy === 1
      ? "One statement is being read right now. Wait for it to finish, then run this again."
      : `${busy} statements are being read right now. Wait for them to finish, then run this again.`;
  }
  if (locked > 0) {
    return locked === 1
      ? "One statement is locked by a reader that has not finished. Try again in a few minutes."
      : `${locked} statements are locked by readers that have not finished. Try again in a few minutes.`;
  }
  return null;
}

export type ReprocessCounts = {
  statements: number;
  transactions: number;
  splits: number;
  trades: number;
  holdings: number;
  identifiers: number;
  proposals: number;
  accounts: number;
  advisorNotes: number;
  emptySnapshots: number;
  duplicates: number;
  caches: number;
  orphanObjects: number;
  requeued: number;
};

export function emptyCounts(): ReprocessCounts {
  return {
    statements: 0,
    transactions: 0,
    splits: 0,
    trades: 0,
    holdings: 0,
    identifiers: 0,
    proposals: 0,
    accounts: 0,
    advisorNotes: 0,
    emptySnapshots: 0,
    duplicates: 0,
    caches: 0,
    orphanObjects: 0,
    requeued: 0,
  };
}

/** One line for the automation log, in the same words the dialog used. */
export function reprocessSummary(counts: ReprocessCounts): string {
  return [
    `${counts.requeued} statement${counts.requeued === 1 ? "" : "s"} back in the queue`,
    `${counts.transactions} transactions`,
    `${counts.trades} trades`,
    `${counts.holdings} holdings`,
    `${counts.accounts} imported accounts`,
    `${counts.proposals} proposals`,
    `${counts.advisorNotes} advisor notes`,
    `${counts.emptySnapshots} empty snapshots`,
    `${counts.caches} cached readings`,
    `${counts.orphanObjects} stray files`,
    `${counts.duplicates} duplicate uploads`,
  ].join(", ");
}
