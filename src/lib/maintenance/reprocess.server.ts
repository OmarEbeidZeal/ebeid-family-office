/**
 * Reading every file again, and removing one file cleanly.
 *
 * The household's real data was imported by readers that have since been
 * corrected six times over, so the database holds transactions that were never
 * in the files, accounts that pooled two people's money and snapshots of zero.
 * The files themselves are still here, which means nothing needs re-uploading —
 * only re-reading.
 *
 * Everything below is scoped to one household and touches only what the importer
 * produced. Assets, liabilities, goals, income streams, categories, rules,
 * mandates and profiles are the household's own work and are never in scope.
 *
 * The cached reading beside each file is deleted too. Without that the reader
 * replays exactly what it concluded last time and reprocessing changes nothing.
 */
import {
  busyRefusal,
  BUSY_STATUSES,
  cachePathOf,
  emptyCounts,
  isEmptySnapshot,
  orphanObjects,
  reprocessSummary,
  statementResetPatch,
  type ReprocessCounts,
} from "./reprocess";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const PAGE = 1000;
const CHUNK = 200;

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 60; page += 1) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function countOf(supabase: Client, table: string, apply: (query: any) => any): Promise<number> {
  const { count } = await apply(
    supabase.from(table).select("id", { count: "exact", head: true }),
  );
  return count ?? 0;
}

const BUCKETS = ["statements", "documents"] as const;

/** Every object under this household's folder, whatever depth it sits at. */
async function listHouseholdObjects(
  supabase: Client,
  bucket: string,
  householdId: string,
): Promise<string[]> {
  const found: string[] = [];
  const queue: string[] = [householdId];

  while (queue.length) {
    const prefix = queue.shift()!;
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) break;
    for (const entry of (data ?? []) as Array<{ name: string; id: string | null }>) {
      const path = `${prefix}/${entry.name}`;
      // A folder comes back without an id of its own.
      if (entry.id === null) queue.push(path);
      else found.push(path);
    }
  }

  return found;
}

/* ------------------------------------------------------------- the preview */

export type ReprocessPreview = {
  blocked: string | null;
  statements: number;
  transactions: number;
  trades: number;
  holdings: number;
  identifiers: number;
  proposals: number;
  accounts: number;
  advisorNotes: number;
  emptySnapshots: number;
  duplicates: number;
};

/**
 * Exactly what would go, counted now rather than estimated. The confirmation
 * dialog states these figures, because "this deletes your imported data" is not
 * something anyone should agree to without seeing the size of it.
 */
export async function previewReprocess(
  supabase: Client,
  householdId: string,
): Promise<ReprocessPreview> {
  const mine = (query: any) => query.eq("household_id", householdId);

  const [statements, busy, locked, transactions, trades, identifiers, proposals, accounts, notes] =
    await Promise.all([
      countOf(supabase, "statements", mine),
      countOf(supabase, "statements", (q) => mine(q).in("status", BUSY_STATUSES as unknown as string[])),
      countOf(supabase, "statements", (q) => mine(q).not("locked_at", "is", null)),
      countOf(supabase, "transactions", (q) => mine(q).not("statement_id", "is", null)),
      countOf(supabase, "trades", (q) => mine(q).not("statement_id", "is", null)),
      countOf(supabase, "account_identifiers", (q) => mine(q).eq("source", "statement")),
      countOf(supabase, "account_proposals", mine),
      countOf(supabase, "accounts", (q) => mine(q).eq("discovered_from", "statement")),
      countOf(supabase, "advisor_notes", mine),
    ]);

  const duplicates = await countOf(supabase, "statements", (q) => mine(q).eq("status", "duplicate"));

  const snapshots = await fetchAll<{
    id: string;
    total_assets: number | string | null;
    total_liabilities: number | string | null;
    breakdown: unknown;
  }>((from, to) =>
    supabase
      .from("net_worth_snapshots")
      .select("id, total_assets, total_liabilities, breakdown")
      .eq("household_id", householdId)
      .range(from, to),
  );

  const holdings = await countOf(supabase, "holdings", (q) =>
    mine(q).eq("discovered_from", "statement"),
  );

  return {
    blocked: busyRefusal(busy, locked),
    statements,
    transactions,
    trades,
    holdings,
    identifiers,
    proposals,
    accounts,
    advisorNotes: notes,
    emptySnapshots: snapshots.filter(isEmptySnapshot).length,
    duplicates,
  };
}

/* ------------------------------------------------------------ the rerun */

async function deleteTransactionsWithStatements(
  supabase: Client,
  householdId: string,
): Promise<{ transactions: number; splits: number }> {
  const rows = await fetchAll<{ id: string }>((from, to) =>
    supabase
      .from("transactions")
      .select("id")
      .eq("household_id", householdId)
      .not("statement_id", "is", null)
      .range(from, to),
  );

  let splits = 0;
  for (const batch of chunk(rows.map((row) => row.id))) {
    const { data: removed } = await supabase
      .from("transaction_splits")
      .delete()
      .in("transaction_id", batch)
      .select("id");
    splits += (removed ?? []).length;

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("household_id", householdId)
      .in("id", batch);
    if (error) throw new Error(error.message);
  }

  return { transactions: rows.length, splits };
}

/**
 * Trades an import wrote, and the positions that existed only because of them.
 * A holding the household typed in keeps its row; it simply has no trades left.
 */
async function deleteImportedTrades(
  supabase: Client,
  householdId: string,
): Promise<{ trades: number; holdings: number }> {
  const rows = await fetchAll<{ id: string; holding_id: string }>((from, to) =>
    supabase
      .from("trades")
      .select("id, holding_id")
      .eq("household_id", householdId)
      .not("statement_id", "is", null)
      .range(from, to),
  );

  const holdingIds = Array.from(new Set(rows.map((row) => row.holding_id).filter(Boolean)));

  for (const batch of chunk(rows.map((row) => row.id))) {
    const { error } = await supabase
      .from("trades")
      .delete()
      .eq("household_id", householdId)
      .in("id", batch);
    if (error) throw new Error(error.message);
  }

  let holdings = 0;
  for (const holdingId of holdingIds) {
    const { count } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("holding_id", holdingId);
    if ((count ?? 0) > 0) continue;

    const { data: holding } = await supabase
      .from("holdings")
      .select("id, discovered_from")
      .eq("id", holdingId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (!holding || holding.discovered_from !== "statement") continue;

    await supabase.from("holdings").delete().eq("id", holdingId).eq("household_id", householdId);
    holdings += 1;
  }

  return { trades: rows.length, holdings };
}

async function removeObjects(supabase: Client, bucket: string, paths: string[]): Promise<number> {
  let gone = 0;
  for (const batch of chunk(paths, 100)) {
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (!error) gone += batch.length;
  }
  return gone;
}

export type ReprocessResult = ReprocessCounts & { message: string };

export async function reprocessAllDocuments(
  supabase: Client,
  householdId: string,
): Promise<ReprocessResult> {
  const counts = emptyCounts();

  /* --- a. nothing may be pulled out from under a reader still working --- */
  const busy = await countOf(supabase, "statements", (q) =>
    q.eq("household_id", householdId).in("status", BUSY_STATUSES as unknown as string[]),
  );
  const locked = await countOf(supabase, "statements", (q) =>
    q.eq("household_id", householdId).not("locked_at", "is", null),
  );
  const refusal = busyRefusal(busy, locked);
  if (refusal) throw new Error(refusal);

  /* --- b. everything the importer produced --- */
  const removedTransactions = await deleteTransactionsWithStatements(supabase, householdId);
  counts.transactions = removedTransactions.transactions;
  counts.splits = removedTransactions.splits;

  const removedTrades = await deleteImportedTrades(supabase, householdId);
  counts.trades = removedTrades.trades;
  counts.holdings = removedTrades.holdings;

  const deleted = async (table: string, apply: (query: any) => any) => {
    const { data, error } = await apply(
      supabase.from(table).delete().eq("household_id", householdId),
    ).select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length as number;
  };

  counts.identifiers = await deleted("account_identifiers", (q) => q.eq("source", "statement"));

  // Statements point at proposals, so the reference goes before the proposal.
  await supabase
    .from("statements")
    .update({ proposal_id: null })
    .eq("household_id", householdId)
    .not("proposal_id", "is", null);
  counts.proposals = await deleted("account_proposals", (q) => q);

  // An account discovered from a file is the file's claim, not the household's,
  // and it will be proposed again on the next reading.
  const discovered = await fetchAll<{ id: string }>((from, to) =>
    supabase
      .from("accounts")
      .select("id")
      .eq("household_id", householdId)
      .eq("discovered_from", "statement")
      .range(from, to),
  );
  if (discovered.length) {
    const ids = discovered.map((row) => row.id);
    await supabase
      .from("statements")
      .update({ account_id: null })
      .eq("household_id", householdId)
      .in("account_id", ids);
    for (const batch of chunk(ids)) {
      const { data, error } = await supabase
        .from("accounts")
        .delete()
        .eq("household_id", householdId)
        .in("id", batch)
        .select("id");
      if (error) throw new Error(error.message);
      counts.accounts += (data ?? []).length;
    }
  }

  // Advisor notes were reasoned from the wrong figures; keeping them would carry
  // that reasoning forward into a conversation about the corrected ones.
  counts.advisorNotes = await deleted("advisor_notes", (q) => q);

  const snapshots = await fetchAll<{
    id: string;
    total_assets: number | string | null;
    total_liabilities: number | string | null;
    breakdown: unknown;
  }>((from, to) =>
    supabase
      .from("net_worth_snapshots")
      .select("id, total_assets, total_liabilities, breakdown")
      .eq("household_id", householdId)
      .range(from, to),
  );
  const emptyIds = snapshots.filter(isEmptySnapshot).map((row) => row.id);
  for (const batch of chunk(emptyIds)) {
    const { data } = await supabase
      .from("net_worth_snapshots")
      .delete()
      .eq("household_id", householdId)
      .in("id", batch)
      .select("id");
    counts.emptySnapshots += (data ?? []).length;
  }

  /* --- e. duplicate uploads, file and row together --- */
  const duplicates = await fetchAll<{ id: string; file_path: string; storage_bucket: string | null }>(
    (from, to) =>
      supabase
        .from("statements")
        .select("id, file_path, storage_bucket")
        .eq("household_id", householdId)
        .eq("status", "duplicate")
        .range(from, to),
  );
  if (duplicates.length) {
    for (const bucket of BUCKETS) {
      const paths = duplicates
        .filter((row) => (row.storage_bucket ?? "statements") === bucket)
        .flatMap((row) => [row.file_path, cachePathOf(row.file_path)]);
      if (paths.length) await removeObjects(supabase, bucket, paths);
    }
    for (const batch of chunk(duplicates.map((row) => row.id))) {
      const { data } = await supabase
        .from("statements")
        .delete()
        .eq("household_id", householdId)
        .in("id", batch)
        .select("id");
      counts.duplicates += (data ?? []).length;
    }
  }

  /* --- f. every remaining statement goes back in the queue --- */
  const remaining = await fetchAll<{ id: string; file_path: string; storage_bucket: string | null }>(
    (from, to) =>
      supabase
        .from("statements")
        .select("id, file_path, storage_bucket")
        .eq("household_id", householdId)
        .range(from, to),
  );
  counts.statements = remaining.length;

  const patch = statementResetPatch();
  for (const batch of chunk(remaining.map((row) => row.id))) {
    const { data, error } = await supabase
      .from("statements")
      .update(patch)
      .eq("household_id", householdId)
      .in("id", batch)
      .select("id");
    if (error) throw new Error(error.message);
    counts.requeued += (data ?? []).length;
  }

  /* --- c and d. cached readings, and files no row points at --- */
  const documents = await fetchAll<{ file_path: string; storage_bucket: string | null }>((from, to) =>
    supabase
      .from("documents")
      .select("file_path, storage_bucket")
      .eq("household_id", householdId)
      .range(from, to),
  );

  for (const bucket of BUCKETS) {
    const objects = await listHouseholdObjects(supabase, bucket, householdId);
    if (!objects.length) continue;

    const referenced = new Set(
      [...remaining, ...documents]
        .filter((row) => (row.storage_bucket ?? "statements") === bucket)
        .map((row) => row.file_path),
    );

    const caches = objects.filter((path) => path.endsWith(".extract.json"));
    const strays = orphanObjects(objects, referenced);
    const straySet = new Set(strays);

    counts.orphanObjects += await removeObjects(supabase, bucket, strays);
    // A cache whose file is still here goes too — it is the old reading.
    counts.caches += await removeObjects(
      supabase,
      bucket,
      caches.filter((path) => !straySet.has(path)),
    );
  }

  /* --- g. one line in the record of what the system did --- */
  const message = reprocessSummary(counts);
  await supabase.from("automation_runs").insert({
    job: "reprocess",
    status: "ok",
    message,
    detail: counts as unknown as Record<string, number>,
    households: 1,
    duration_ms: 0,
    ran_at: new Date().toISOString(),
  });

  return { ...counts, message };
}

/* --------------------------------------------------- one document, removed */

export type DeleteDocumentResult = {
  fileName: string | null;
  transactions: number;
  trades: number;
  holdingsRemoved: number;
  accountRemoved: boolean;
};

/**
 * Remove one file and everything it wrote: the rows, the orders, the cached
 * reading, the file itself. The account restates its balance from the statements
 * it still holds, and an account that exists only because of this file goes with
 * it.
 */
export async function deleteStatementAndData(
  supabase: Client,
  input: { householdId: string; statementId: string },
): Promise<DeleteDocumentResult> {
  const { data: statement } = await supabase
    .from("statements")
    .select("id, account_id, file_name, file_path, storage_bucket, status")
    .eq("id", input.statementId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (!statement) throw new Error("That document is not part of this household.");
  if ((BUSY_STATUSES as readonly string[]).includes(statement.status)) {
    throw new Error("This file is being read right now. Wait for it to finish, then delete it.");
  }

  const { unfileStatement, recomputeAccountBalance } = await import("@/lib/accounts/repair.server");
  const outcome = await unfileStatement(supabase, {
    householdId: input.householdId,
    statementId: input.statementId,
  });

  const accountId: string | null = statement.account_id;
  const bucket: string = statement.storage_bucket ?? "statements";

  await removeObjects(supabase, bucket, [statement.file_path, cachePathOf(statement.file_path)]);

  const { error } = await supabase
    .from("statements")
    .delete()
    .eq("id", input.statementId)
    .eq("household_id", input.householdId);
  if (error) throw new Error(error.message);

  let accountRemoved = false;
  if (accountId) {
    const { count } = await supabase
      .from("statements")
      .select("id", { count: "exact", head: true })
      .eq("household_id", input.householdId)
      .eq("account_id", accountId);

    const { data: account } = await supabase
      .from("accounts")
      .select("id, discovered_from")
      .eq("id", accountId)
      .eq("household_id", input.householdId)
      .maybeSingle();

    if ((count ?? 0) === 0 && account?.discovered_from === "statement") {
      const { error: removeError } = await supabase
        .from("accounts")
        .delete()
        .eq("id", accountId)
        .eq("household_id", input.householdId);
      accountRemoved = !removeError;
    }

    if (!accountRemoved) {
      await recomputeAccountBalance(supabase, input.householdId, accountId);
    }
  }

  return {
    fileName: statement.file_name ?? outcome.fileName,
    transactions: outcome.removed,
    trades: outcome.trades,
    holdingsRemoved: outcome.holdingsRemoved,
    accountRemoved,
  };
}
