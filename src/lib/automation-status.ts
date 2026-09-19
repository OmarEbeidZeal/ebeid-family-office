/**
 * Whether a scheduled job is actually working.
 *
 * The scheduler's own record says a call "succeeded" when the HTTP request was
 * made, not when the job did anything: the paperwork queue answered 404 on
 * every run for a fortnight because the published build predated the route, and
 * the schedule reported success throughout. So health is read from the job's own
 * last recorded run — a failure is a failure until a later run says otherwise.
 *
 * Pure, and tested.
 */

export type JobRunLike = {
  status: string;
  message: string | null;
  ran_at: string;
};

export type JobHealth = {
  state: "failing" | "problem" | "ok" | "quiet" | "overdue" | "never";
  label: string;
  /** Shown whenever there is something to explain. */
  message: string | null;
  /** True when this needs attention now, not merely watching. */
  attention: boolean;
};

export function jobHealth(
  run: JobRunLike | undefined,
  overdueAfterHours: number,
  now: number = Date.now(),
): JobHealth {
  if (!run) {
    return {
      state: "never",
      label: "Not run yet",
      message: "Publish the app once and the schedule starts calling it.",
      attention: false,
    };
  }

  // The most recent run decides. A job whose last attempt failed is failing,
  // however many times it worked before that.
  if (run.status === "failed") {
    return {
      state: "failing",
      label: "Failing",
      message: run.message ?? "The last run did not complete, and no reason was recorded.",
      attention: true,
    };
  }

  if (run.status === "partial") {
    return {
      state: "problem",
      label: "Ran with problems",
      message: run.message,
      attention: true,
    };
  }

  const overdue = now - new Date(run.ran_at).getTime() > overdueAfterHours * 3_600_000;
  if (overdue) {
    return {
      state: "overdue",
      label: run.status === "skipped" ? "Nothing to do" : "Ran",
      message: "Overdue — it has missed at least one turn.",
      attention: true,
    };
  }

  if (run.status === "skipped") {
    return { state: "quiet", label: "Nothing to do", message: null, attention: false };
  }

  return { state: "ok", label: "Ran", message: null, attention: false };
}
