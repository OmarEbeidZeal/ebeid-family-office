/**
 * Authorising a scheduled callback.
 *
 * These endpoints live under `/api/public/*` so the database scheduler can
 * reach them without a session, which makes the shared secret *the* security
 * boundary. Two secrets are accepted:
 *
 *  1. the platform's own cron secret, held in the environment; and
 *  2. the secret the database minted for `pg_cron`, which exists only inside
 *     Postgres — it is never held in this codebase, never logged, and Postgres
 *     only ever answers yes or no to it.
 *
 * Anything else gets a flat 401 with no detail.
 */
import { createHash, timingSafeEqual } from "node:crypto";

function unauthorised() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Compared as digests so the check takes the same time whatever is presented. */
function secretsMatch(presented: string, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

export async function authoriseJobRequest(request: Request): Promise<Response | null> {
  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return unauthorised();

  const platform = process.env["LOVABLE_CRON_SECRET"];
  const previous = process.env["LOVABLE_CRON_SECRET_PREVIOUS"];
  if (platform && secretsMatch(token, platform)) return null;
  if (previous && secretsMatch(token, previous)) return null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("verify_job_secret", { token });
    if (!error && data === true) return null;
  } catch (error) {
    console.error("[jobs] the scheduler secret could not be checked", error);
    return new Response(JSON.stringify({ error: "Secret check unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return unauthorised();
}
