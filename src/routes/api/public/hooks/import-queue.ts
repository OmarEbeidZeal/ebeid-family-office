/**
 * Every five minutes. Reads whatever statements are waiting, a few at a time,
 * so an import finishes whether or not the tab that started it is still open.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authoriseJobRequest } from "@/lib/jobs/auth.server";
import { runJob } from "@/lib/jobs/runs.server";
import { runImportQueueJob } from "@/lib/import/worker.server";

async function handlePost({ request }: { request: Request }) {
  const denied = await authoriseJobRequest(request);
  if (denied) return denied;
  return runJob("import_queue", () => runImportQueueJob());
}

export const Route = createFileRoute("/api/public/hooks/import-queue")({
  server: { handlers: { POST: handlePost } },
});
