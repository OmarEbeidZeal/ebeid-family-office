/**
 * Maintenance the household can run itself.
 *
 * Reading every file again, and removing one file for good, both delete data
 * that took work to gather. So both are owner-only, both are scoped to the
 * caller's own household, and the screen states the exact counts first.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const documentInput = z.object({ statementId: z.string().uuid() });

async function ownerOf(supabase: unknown, userId: string) {
  const { resolveViewer } = await import("./viewer.server");
  const viewer = await resolveViewer(supabase, userId);
  if (viewer.role !== "owner") {
    throw new Error("Only the household owner can do this.");
  }
  return viewer;
}

/** The live counts the confirmation dialog states, and any reason it cannot run. */
export const previewReprocessAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { householdId } = await ownerOf(context.supabase, context.userId);
    const { previewReprocess } = await import("./maintenance/reprocess.server");
    return previewReprocess(context.supabase, householdId);
  });

/**
 * Clears everything the importer produced and puts every file back in the queue.
 * The household's own records — assets, liabilities, goals, income, categories,
 * rules, mandates, people — are never touched.
 */
export const reprocessAllDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { householdId } = await ownerOf(context.supabase, context.userId);
    const { reprocessAllDocuments: run } = await import("./maintenance/reprocess.server");
    return run(context.supabase, householdId);
  });

/** Removes one file, everything it wrote, and its cached reading. */
export const deleteDocumentAndData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await ownerOf(context.supabase, context.userId);
    const { deleteStatementAndData } = await import("./maintenance/reprocess.server");
    return deleteStatementAndData(context.supabase, {
      householdId,
      statementId: data.statementId,
    });
  });
