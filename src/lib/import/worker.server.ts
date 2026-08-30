/**
 * The import worker.
 *
 * Bounded on every axis that could otherwise run away: at most a handful of
 * files per invocation, at most two at a time, at most five attempts per file,
 * and a lease that stops two workers reading the same statement. Whatever is
 * left over waits for the next run — five minutes later — rather than being
 * crammed into this one.
 */
import type { Json } from "@/integrations/supabase/types";
import type { JobOutcome } from "@/lib/jobs/runs.server";
import { processStatement } from "./pipeline.server";
import {
  activeBatchIds,
  claimStatement,
  deferStatement,
  pendingStatements,
  refreshBatch,
  releaseStatement,
} from "./queue.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/** A run reads at most this many files, whatever is waiting. */
export const FILES_PER_RUN = 6;
/** Two at a time: enough to keep moving, few enough not to trip AI rate limits. */
export const CONCURRENCY = 2;

export type QueueRunSummary = {
  claimed: number;
  imported: number;
  awaiting: number;
  duplicates: number;
  failed: number;
  deferred: number;
  transactions: number;
  remaining: number;
};

export async function runImportQueue(
  supabase: Client,
  options: { householdId?: string | undefined; limit?: number | undefined } = {},
): Promise<QueueRunSummary> {
  const limit = Math.min(options.limit ?? FILES_PER_RUN, 20);
  const candidates = await pendingStatements(supabase, {
    householdId: options.householdId,
    limit: limit * 2,
  });

  const summary: QueueRunSummary = {
    claimed: 0,
    imported: 0,
    awaiting: 0,
    duplicates: 0,
    failed: 0,
    deferred: 0,
    transactions: 0,
    remaining: 0,
  };

  const batches = new Set<string>();
  const queue = [...candidates];

  async function drain(): Promise<void> {
    for (;;) {
      if (summary.claimed >= limit) return;
      const next = queue.shift();
      if (!next) return;

      const claimed = await claimStatement(supabase, next);
      if (!claimed) continue; // another worker took it
      summary.claimed += 1;
      if (claimed.import_batch_id) batches.add(claimed.import_batch_id);

      try {
        const outcome = await processStatement(supabase, claimed);
        if (outcome.kind === "imported") {
          if (outcome.result.status === "failed") summary.failed += 1;
          else {
            summary.imported += 1;
            summary.transactions += outcome.result.inserted;
          }
        } else if (outcome.kind === "awaiting_account") summary.awaiting += 1;
        else if (outcome.kind === "duplicate") summary.duplicates += 1;
        else summary.failed += 1;
      } catch (error) {
        // An unexpected failure — a timeout, a provider outage — is worth
        // another go later; a verdict about the file is not, and those are
        // already terminal by the time they reach here.
        const message = error instanceof Error ? error.message : "The import stopped unexpectedly.";
        if (claimed.attempts + 1 >= 5) {
          await supabase
            .from("statements")
            .update({
              status: "failed",
              locked_at: null,
              error_message: `${message} It has been tried five times, so it has stopped retrying.`,
              parsed_at: new Date().toISOString(),
            })
            .eq("id", claimed.id);
          summary.failed += 1;
        } else {
          await deferStatement(
            supabase,
            { id: claimed.id, attempts: claimed.attempts + 1 },
            message,
          );
          summary.deferred += 1;
        }
      } finally {
        await releaseStatement(supabase, claimed.id).catch(() => undefined);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => drain()));

  for (const batchId of new Set([
    ...batches,
    ...(await activeBatchIds(supabase, options.householdId)),
  ])) {
    await refreshBatch(supabase, batchId).catch(() => undefined);
  }

  const stillWaiting = await pendingStatements(supabase, {
    householdId: options.householdId,
    limit: 50,
  });
  summary.remaining = stillWaiting.length;

  return summary;
}

/** The scheduled entry point: same worker, wrapped in a run record. */
export async function runImportQueueJob(): Promise<JobOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const summary = await runImportQueue(supabaseAdmin);

  if (!summary.claimed) {
    return { status: "skipped", message: "No statements were waiting to be read." };
  }

  const parts: string[] = [];
  if (summary.imported)
    parts.push(`${summary.imported} statement${summary.imported === 1 ? "" : "s"} imported`);
  if (summary.transactions) parts.push(`${summary.transactions} transactions added`);
  if (summary.awaiting) parts.push(`${summary.awaiting} waiting on an account`);
  if (summary.duplicates) parts.push(`${summary.duplicates} already on file`);
  if (summary.deferred) parts.push(`${summary.deferred} will be retried`);
  if (summary.failed) parts.push(`${summary.failed} failed`);
  if (summary.remaining) parts.push(`${summary.remaining} still queued`);

  return {
    status: summary.failed ? "partial" : "ok",
    message: parts.join(" · "),
    detail: summary as unknown as Json,
  };
}
