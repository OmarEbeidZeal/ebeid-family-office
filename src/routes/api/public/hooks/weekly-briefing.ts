/**
 * 07:00 UTC daily; each household is briefed on the weekday its members chose,
 * Sunday unless they changed it. Writes `advisor_notes` and, when a Resend key
 * exists, emails the digest to everyone who asked for it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authoriseJobRequest } from "@/lib/jobs/auth.server";
import { runJob } from "@/lib/jobs/runs.server";
import { runScheduledBriefings } from "@/lib/jobs/briefings.server";

async function handlePost({ request }: { request: Request }) {
  const denied = await authoriseJobRequest(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  return runJob("weekly_briefing", () => runScheduledBriefings({ appUrl: url.origin, force }));
}

export const Route = createFileRoute("/api/public/hooks/weekly-briefing")({
  server: { handlers: { POST: handlePost } },
});
