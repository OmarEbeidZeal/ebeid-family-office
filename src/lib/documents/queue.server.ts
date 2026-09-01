/**
 * The document queue.
 *
 * The same shape as the statement queue, and deliberately so: upload writes
 * rows, a worker claims them one at a time under a lease, a transient failure
 * is retried with backoff and a verdict about the file is not. A household
 * dropping in eleven policy PDFs, four payslips and a year of statements gets
 * one queue, not three racing ones.
 *
 * Claiming is a single conditional UPDATE. Two workers reaching for the same
 * document serialise in Postgres, and the loser's WHERE stops matching — so no
 * file is ever read twice, and no model call is ever paid for twice.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/** A claim older than this is assumed dead and may be taken over. */
export const LEASE_MS = 10 * 60_000;
/** Give up after this many tries; a file that fails five times needs a person. */
export const MAX_ATTEMPTS = 5;

export type QueuedDocument = {
  id: string;
  household_id: string;
  owner_profile_id: string | null;
  uploaded_by: string | null;
  doc_type: string | null;
  type_hint: string | null;
  storage_bucket: string | null;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  file_hash: string | null;
  import_batch_id: string | null;
  statement_id: string | null;
  attempts: number;
  status: string;
};

const CLAIM_COLUMNS =
  "id, household_id, owner_profile_id, uploaded_by, doc_type, type_hint, storage_bucket, file_path, file_name, file_size, file_hash, import_batch_id, statement_id, attempts, status";

/** Documents ready to run now: queued, past their backoff, held by nobody. */
export async function pendingDocuments(
  supabase: Client,
  options: { householdId?: string | undefined; limit?: number | undefined } = {},
): Promise<QueuedDocument[]> {
  const now = new Date().toISOString();
  const staleLease = new Date(Date.now() - LEASE_MS).toISOString();

  let query = supabase
    .from("documents")
    .select(`${CLAIM_COLUMNS}, locked_at`)
    .in("status", ["queued", "extracting"])
    .lt("attempts", MAX_ATTEMPTS)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit((options.limit ?? 25) * 2);

  if (options.householdId) query = query.eq("household_id", options.householdId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<QueuedDocument & { locked_at: string | null }>)
    .filter((row) => !row.locked_at || row.locked_at <= staleLease)
    .slice(0, options.limit ?? 25);
}

/** Take exclusive ownership of one document, or null when someone else has it. */
export async function claimDocument(
  supabase: Client,
  document: QueuedDocument,
): Promise<QueuedDocument | null> {
  const staleLease = new Date(Date.now() - LEASE_MS).toISOString();

  const { data, error } = await supabase
    .from("documents")
    .update({
      status: "extracting",
      locked_at: new Date().toISOString(),
      attempts: (document.attempts ?? 0) + 1,
      error_message: null,
    })
    .eq("id", document.id)
    .eq("status", document.status)
    .or(`locked_at.is.null,locked_at.lte.${staleLease}`)
    .select(CLAIM_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as QueuedDocument | null) ?? null;
}

export async function releaseDocument(supabase: Client, documentId: string): Promise<void> {
  await supabase.from("documents").update({ locked_at: null }).eq("id", documentId);
}

/** Wait longer each time, but never long enough to park a file for hours. */
function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
}

export async function deferDocument(
  supabase: Client,
  document: { id: string; attempts: number },
  message: string,
): Promise<void> {
  await supabase
    .from("documents")
    .update({
      status: "queued",
      locked_at: null,
      error_message: message,
      next_attempt_at: new Date(Date.now() + backoffMs(document.attempts)).toISOString(),
    })
    .eq("id", document.id);
}

export async function failDocument(
  supabase: Client,
  documentId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("documents")
    .update({
      status: "failed",
      locked_at: null,
      error_message: message,
      extracted_at: new Date().toISOString(),
    })
    .eq("id", documentId);
}
