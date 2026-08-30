/**
 * 06:00 and 18:00 UTC. Refreshes the GBP exchange-rate table so foreign
 * balances convert against a rate from this morning, not from whenever the app
 * was last opened.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authoriseJobRequest } from "@/lib/jobs/auth.server";
import { runJob } from "@/lib/jobs/runs.server";
import { refreshFxRatesNow } from "@/lib/fx.server";

async function handlePost({ request }: { request: Request }) {
  const denied = await authoriseJobRequest(request);
  if (denied) return denied;

  return runJob("fx_refresh", async () => {
    const result = await refreshFxRatesNow();
    return {
      status: "ok" as const,
      message: `${result.updated} exchange rate${result.updated === 1 ? "" : "s"} refreshed against GBP.`,
      detail: { as_of: result.as_of, pairs: result.updated },
    };
  });
}

export const Route = createFileRoute("/api/public/hooks/fx-refresh")({
  server: { handlers: { POST: handlePost } },
});
