/**
 * Every scheduled run leaves a record.
 *
 * A job that silently does nothing is indistinguishable from a job that never
 * fired, so each run writes one row to `automation_runs` — what ran, how it
 * went, in plain English, and how long it took. Settings reads those rows back
 * so "the system is keeping itself up to date" is a fact and not a promise.
 */
import type { Json } from "@/integrations/supabase/types";

export type JobStatus = "ok" | "partial" | "skipped" | "failed";

export type JobOutcome = {
  status: JobStatus;
  /** Written for a person, not a log parser. */
  message: string;
  households?: number;
  detail?: Json;
};

async function record(job: string, outcome: JobOutcome, durationMs: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("automation_runs").insert({
      job,
      status: outcome.status,
      message: outcome.message,
      detail: outcome.detail ?? null,
      households: outcome.households ?? 0,
      duration_ms: Math.round(durationMs),
      ran_at: new Date().toISOString(),
    });
    if (error) console.error(`[jobs] could not record the ${job} run: ${error.message}`);
  } catch (error) {
    console.error(`[jobs] could not record the ${job} run`, error);
  }
}

/** Runs the work, records the outcome, and answers the scheduler. */
export async function runJob(job: string, work: () => Promise<JobOutcome>): Promise<Response> {
  const startedAt = Date.now();
  let outcome: JobOutcome;

  try {
    outcome = await work();
  } catch (error) {
    outcome = {
      status: "failed",
      message: error instanceof Error ? error.message : "The job failed for an unknown reason.",
    };
    console.error(`[jobs] ${job} failed`, error);
  }

  const durationMs = Date.now() - startedAt;
  await record(job, outcome, durationMs);

  return new Response(
    JSON.stringify({
      job,
      status: outcome.status,
      message: outcome.message,
      households: outcome.households ?? 0,
      duration_ms: Math.round(durationMs),
    }),
    {
      status: outcome.status === "failed" ? 500 : 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    },
  );
}
