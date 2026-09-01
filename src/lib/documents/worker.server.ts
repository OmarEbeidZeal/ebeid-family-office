/**
 * The document worker.
 *
 * Bounded on every axis, exactly as the statement worker is: a handful of files
 * per invocation, two at a time, five attempts per file, and a lease that stops
 * two workers reading the same document. Whatever is left over waits for the
 * next run rather than being crammed into this one.
 */
import type { Json } from "@/integrations/supabase/types";
import type { JobOutcome } from "@/lib/jobs/runs.server";
import { activeBatchIds, refreshBatch } from "../import/queue.server";
import { processDocument } from "./pipeline.server";
import {
  claimDocument,
  deferDocument,
  MAX_ATTEMPTS,
  pendingDocuments,
  releaseDocument,
} from "./queue.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/** A run reads at most this many files, whatever is waiting. */
export const FILES_PER_RUN = 6;
/** Two at a time: enough to keep moving, few enough not to trip AI rate limits. */
export const CONCURRENCY = 2;

export type DocumentRunSummary = {
  claimed: number;
  linked: number;
  statements: number;
  needsType: number;
  filed: number;
  duplicates: number;
  failed: number;
  deferred: number;
  remaining: number;
};

export async function runDocumentQueue(
  supabase: Client,
  options: { householdId?: string | undefined; limit?: number | undefined } = {},
): Promise<DocumentRunSummary> {
  const limit = Math.min(options.limit ?? FILES_PER_RUN, 20);
  const candidates = await pendingDocuments(supabase, {
    householdId: options.householdId,
    limit: limit * 2,
  });

  const summary: DocumentRunSummary = {
    claimed: 0,
    linked: 0,
    statements: 0,
    needsType: 0,
    filed: 0,
    duplicates: 0,
    failed: 0,
    deferred: 0,
    remaining: 0,
  };

  const batches = new Set<string>();
  const queue = [...candidates];

  async function drain(): Promise<void> {
    for (;;) {
      if (summary.claimed >= limit) return;
      const next = queue.shift();
      if (!next) return;

      const claimed = await claimDocument(supabase, next);
      if (!claimed) continue; // another worker took it
      summary.claimed += 1;
      if (claimed.import_batch_id) batches.add(claimed.import_batch_id);

      try {
        const outcome = await processDocument(supabase, claimed);
        if (outcome.kind === "linked") summary.linked += 1;
        else if (outcome.kind === "statement") summary.statements += 1;
        else if (outcome.kind === "needs_type") summary.needsType += 1;
        else if (outcome.kind === "filed") summary.filed += 1;
        else if (outcome.kind === "duplicate") summary.duplicates += 1;
        else summary.failed += 1;
      } catch (error) {
        // A timeout or a provider outage deserves another go. A verdict about
        // the file does not, and those are already terminal by the time they
        // reach here.
        const message = error instanceof Error ? error.message : "Reading the document stopped unexpectedly.";
        if (claimed.attempts + 1 >= MAX_ATTEMPTS) {
          await supabase
            .from("documents")
            .update({
              status: "failed",
              locked_at: null,
              error_message: `${message} It has been tried ${MAX_ATTEMPTS} times, so it has stopped retrying.`,
              extracted_at: new Date().toISOString(),
            })
            .eq("id", claimed.id);
          summary.failed += 1;
        } else {
          await deferDocument(supabase, { id: claimed.id, attempts: claimed.attempts + 1 }, message);
          summary.deferred += 1;
        }
      } finally {
        await releaseDocument(supabase, claimed.id).catch(() => undefined);
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

  const stillWaiting = await pendingDocuments(supabase, {
    householdId: options.householdId,
    limit: 50,
  });
  summary.remaining = stillWaiting.length;

  return summary;
}

/** The scheduled entry point: same worker, wrapped in a run record. */
export async function runDocumentQueueJob(): Promise<JobOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const summary = await runDocumentQueue(supabaseAdmin);

  if (!summary.claimed) {
    return { status: "skipped", message: "No documents were waiting to be read." };
  }

  const parts: string[] = [];
  if (summary.linked) parts.push(`${summary.linked} read and filed`);
  if (summary.statements)
    parts.push(`${summary.statements} passed to the statement importer`);
  if (summary.filed) parts.push(`${summary.filed} filed as they are`);
  if (summary.needsType) parts.push(`${summary.needsType} waiting on a type`);
  if (summary.duplicates) parts.push(`${summary.duplicates} already on file`);
  if (summary.deferred) parts.push(`${summary.deferred} will be retried`);
  if (summary.failed) parts.push(`${summary.failed} could not be read`);
  if (summary.remaining) parts.push(`${summary.remaining} still queued`);

  return {
    status: summary.failed ? "partial" : "ok",
    message: parts.join(" · "),
    detail: summary as unknown as Json,
  };
}
