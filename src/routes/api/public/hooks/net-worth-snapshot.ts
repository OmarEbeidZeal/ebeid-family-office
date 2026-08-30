/**
 * Nightly at 23:30 UTC. Writes one net-worth row per household so the trend
 * chart is a continuous record rather than a sample of the days someone
 * happened to sign in. Re-running on the same date corrects that day's row.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authoriseJobRequest } from "@/lib/jobs/auth.server";
import { runJob } from "@/lib/jobs/runs.server";
import { runDailySnapshots } from "@/lib/jobs/snapshots.server";

async function handlePost({ request }: { request: Request }) {
  const denied = await authoriseJobRequest(request);
  if (denied) return denied;
  return runJob("net_worth_snapshot", () => runDailySnapshots());
}

export const Route = createFileRoute("/api/public/hooks/net-worth-snapshot")({
  server: { handlers: { POST: handlePost } },
});
