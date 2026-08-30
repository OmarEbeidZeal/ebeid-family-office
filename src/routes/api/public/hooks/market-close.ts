/**
 * Weekdays at 21:15 UTC, after the US close. Stores a closing price for every
 * held and watchlisted ticker so the portfolio has a real series behind it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authoriseJobRequest } from "@/lib/jobs/auth.server";
import { runJob } from "@/lib/jobs/runs.server";
import { runMarketClose } from "@/lib/jobs/prices.server";

async function handlePost({ request }: { request: Request }) {
  const denied = await authoriseJobRequest(request);
  if (denied) return denied;
  return runJob("market_close", () => runMarketClose());
}

export const Route = createFileRoute("/api/public/hooks/market-close")({
  server: { handlers: { POST: handlePost } },
});
