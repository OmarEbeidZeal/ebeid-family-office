/**
 * Every five minutes. Reads whatever paperwork is waiting — policies,
 * tenancies, payslips — a few files at a time, so an upload finishes whether or
 * not the tab that started it is still open. Bank statements found in the pile
 * are handed to the statement importer by the worker itself.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authoriseJobRequest } from "@/lib/jobs/auth.server";
import { runJob } from "@/lib/jobs/runs.server";
import { runDocumentQueueJob } from "@/lib/documents/worker.server";

async function handlePost({ request }: { request: Request }) {
  const denied = await authoriseJobRequest(request);
  if (denied) return denied;
  return runJob("document_queue", () => runDocumentQueueJob());
}

export const Route = createFileRoute("/api/public/hooks/document-queue")({
  server: { handlers: { POST: handlePost } },
});
