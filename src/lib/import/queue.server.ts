/**
 * The import queue.
 *
 * Twenty statements dropped in at once used to mean twenty parses racing in the
 * browser tab, and a closed laptop lid meant a half-finished import. Now the
 * upload only writes rows; the work is claimed one file at a time by a worker
 * that survives the tab being closed, retries what deserves retrying, and gives
 * up loudly on what does not.
 *
 * Claiming is a single conditional UPDATE. Two workers racing issue the same
 * statement, Postgres serialises them, and the loser's WHERE no longer matches
 * — so no file is ever processed twice.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/** A claim older than this is assumed dead and may be taken over. */
export const LEASE_MS = 10 * 60_000;
/** Give up after this many tries; a file that fails five times needs a human. */
export const MAX_ATTEMPTS = 5;

export type QueuedStatement = {
  id: string;
  household_id: string;
  account_id: string | null;
  import_batch_id: string | null;
  proposal_id: string | null;
  file_path: string;
  file_name: string | null;
  file_hash: string | null;
  attempts: number;
  status: string;
  uploaded_by: string | null;
};

const CLAIM_COLUMNS =
  "id, household_id, account_id, import_batch_id, proposal_id, file_path, file_name, file_hash, attempts, status, uploaded_by";

/** Statements ready to run now: queued, past their backoff, not held by anyone. */
export async function pendingStatements(
  supabase: Client,
  options: { householdId?: string; limit?: number } = {},
): Promise<QueuedStatement[]> {
  const now = new Date().toISOString();
  const staleLease = new Date(Date.now() - LEASE_MS).toISOString();

  let query = supabase
    .from("statements")
    .select(`${CLAIM_COLUMNS}, locked_at`)
    .in("status", ["queued", "extracting", "parsing"])
    .lt("attempts", MAX_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit((options.limit ?? 25) * 2);

  if (options.householdId) query = query.eq("household_id", options.householdId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // A live lease means another worker holds it; only an expired one is fair game.
  return ((data ?? []) as Array<QueuedStatement & { locked_at: string | null }>)
    .filter((row) => !row.locked_at || row.locked_at <= staleLease)
    .slice(0, options.limit ?? 25);
}

/**
 * Take exclusive ownership of one statement. Returns null when another worker
 * got there first — the caller simply moves to the next one.
 */
export async function claimStatement(
  supabase: Client,
  statement: QueuedStatement,
): Promise<QueuedStatement | null> {
  const staleLease = new Date(Date.now() - LEASE_MS).toISOString();

  const { data, error } = await supabase
    .from("statements")
    .update({
      status: "extracting",
      locked_at: new Date().toISOString(),
      attempts: (statement.attempts ?? 0) + 1,
      error_message: null,
    })
    .eq("id", statement.id)
    .eq("status", statement.status)
    .or(`locked_at.is.null,locked_at.lte.${staleLease}`)
    .select(CLAIM_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as QueuedStatement | null) ?? null;
}

export async function releaseStatement(supabase: Client, statementId: string): Promise<void> {
  await supabase.from("statements").update({ locked_at: null }).eq("id", statementId);
}

/** Wait longer each time, but never so long that a transient blip parks a file for hours. */
function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
}

export async function deferStatement(
  supabase: Client,
  statement: { id: string; attempts: number },
  message: string,
): Promise<void> {
  await supabase
    .from("statements")
    .update({
      status: "queued",
      locked_at: null,
      error_message: message,
      next_attempt_at: new Date(Date.now() + backoffMs(statement.attempts)).toISOString(),
    })
    .eq("id", statement.id);
}

export async function failStatement(
  supabase: Client,
  statementId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("statements")
    .update({
      status: "failed",
      locked_at: null,
      error_message: message,
      parsed_at: new Date().toISOString(),
    })
    .eq("id", statementId);
}

/* -------------------------------------------------------------- batches */

export type BatchProgress = {
  id: string;
  status: string;
  total_files: number;
  finished_files: number;
  failed_files: number;
  duplicate_files: number;
  transactions_imported: number;
  duplicates_skipped: number;
  accounts_proposed: number;
  message: string | null;
};

const TERMINAL = ["parsed", "needs_review", "failed", "duplicate", "cancelled"];

/**
 * Recount a batch from its statements rather than incrementing counters as we
 * go — a counter that drifts is worse than no counter, and a recount is cheap
 * at these volumes.
 */
export async function refreshBatch(supabase: Client, batchId: string): Promise<BatchProgress | null> {
  const { data: statements } = await supabase
    .from("statements")
    .select("status, transaction_count, duplicate_count, proposal_id")
    .eq("import_batch_id", batchId);

  const rows = (statements ?? []) as Array<{
    status: string;
    transaction_count: number | null;
    duplicate_count: number | null;
    proposal_id: string | null;
  }>;
  if (!rows.length) return null;

  const finished = rows.filter((row) => TERMINAL.includes(row.status)).length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const duplicates = rows.filter((row) => row.status === "duplicate").length;
  const awaiting = rows.filter((row) => row.status === "awaiting_account").length;
  const imported = rows.reduce((sum, row) => sum + (row.transaction_count ?? 0), 0);
  const skipped = rows.reduce((sum, row) => sum + (row.duplicate_count ?? 0), 0);
  const proposals = new Set(rows.map((row) => row.proposal_id).filter(Boolean)).size;

  const settled = finished + awaiting === rows.length;
  const status = !settled
    ? "running"
    : failed === rows.length
      ? "failed"
      : "completed";

  const parts: string[] = [];
  if (imported) parts.push(`${imported} transaction${imported === 1 ? "" : "s"} imported`);
  if (skipped) parts.push(`${skipped} already on file`);
  if (awaiting) parts.push(`${awaiting} waiting on an account`);
  if (duplicates) parts.push(`${duplicates} duplicate file${duplicates === 1 ? "" : "s"}`);
  if (failed) parts.push(`${failed} failed`);

  const update = {
    status,
    finished_files: finished,
    failed_files: failed,
    duplicate_files: duplicates,
    transactions_imported: imported,
    duplicates_skipped: skipped,
    accounts_proposed: proposals,
    message: parts.join(" · ") || null,
    ...(settled ? { finished_at: new Date().toISOString() } : {}),
  };

  const { data } = await supabase
    .from("import_batches")
    .update(update)
    .eq("id", batchId)
    .select(
      "id, status, total_files, finished_files, failed_files, duplicate_files, transactions_imported, duplicates_skipped, accounts_proposed, message",
    )
    .maybeSingle();

  return (data as BatchProgress | null) ?? null;
}

/** Every batch that still has work in it, so a sweep knows what to recount. */
export async function activeBatchIds(supabase: Client, householdId?: string): Promise<string[]> {
  let query = supabase.from("import_batches").select("id").in("status", ["queued", "running"]);
  if (householdId) query = query.eq("household_id", householdId);
  const { data } = await query;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}
