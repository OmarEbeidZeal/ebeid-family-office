/**
 * Everything the documents shelf asks the server to do.
 *
 * The same shape as the statement importer, deliberately: the browser uploads
 * and registers, the queue reads, and the tab is free to close. What is
 * different here is that the household is occasionally asked a question — "is
 * this a payslip or a policy?" — and that answer goes back into the same queue
 * rather than starting a separate one.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOC_TYPES } from "./documents/types";

const docTypeEnum = z.enum(DOC_TYPES as [string, ...string[]]);

const queueInput = z.object({
  /** What the household said it was, if they said. Never guessed from here. */
  typeHint: docTypeEnum.nullable().optional(),
  ownerProfileId: z.string().uuid().nullable().optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        name: z.string().min(1).max(300),
        size: z
          .number()
          .int()
          .nonnegative()
          .max(20 * 1024 * 1024),
        mimeType: z.string().max(160).nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
});

const pumpInput = z.object({ limit: z.number().int().min(1).max(8).optional() }).optional();

const documentInput = z.object({ documentId: z.string().uuid() });

const confirmInput = z.object({
  documentId: z.string().uuid(),
  docType: docTypeEnum,
  ownerProfileId: z.string().uuid().nullable().optional(),
});

async function viewerOf(supabase: unknown, userId: string) {
  const { resolveViewer } = await import("./viewer.server");
  return resolveViewer(supabase, userId);
}

/**
 * Registers uploaded files as one batch of queued documents.
 *
 * Nothing is asked up front. The reader works out what each file is, and the
 * shelf asks only where the answer would be a guess.
 */
export const queueDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => queueInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId, profileId } = await viewerOf(context.supabase, context.userId);

    // Every path must sit under this household's own folder, matching the
    // storage policy — a crafted path cannot reach another household's files.
    for (const file of data.files) {
      if (!file.path.startsWith(`${householdId}/`)) {
        throw new Error("That upload path is not valid for this household.");
      }
    }

    if (data.ownerProfileId) {
      const { data: person } = await context.supabase
        .from("profiles")
        .select("id")
        .eq("id", data.ownerProfileId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (!person) throw new Error("That person is not part of this household.");
    }

    const { data: batch, error: batchError } = await context.supabase
      .from("import_batches")
      .insert({
        household_id: householdId,
        created_by: profileId,
        status: "queued",
        total_files: data.files.length,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (batchError) throw new Error(batchError.message);

    const { data: rows, error } = await context.supabase
      .from("documents")
      .insert(
        data.files.map((file) => ({
          household_id: householdId,
          owner_profile_id: data.ownerProfileId ?? null,
          uploaded_by: profileId,
          import_batch_id: batch.id,
          storage_bucket: "documents",
          file_path: file.path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.mimeType ?? null,
          type_hint: data.typeHint ?? null,
          status: "queued",
        })),
      )
      .select("id");
    if (error) throw new Error(error.message);

    return { batchId: batch.id as string, documentIds: (rows ?? []).map((row) => row.id) };
  });

/**
 * Reads a few queued documents now. The browser calls this in a loop while the
 * shelf is open; the scheduled run does the same work unattended.
 */
export const pumpDocumentQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => pumpInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);
    const { runDocumentQueue } = await import("./documents/worker.server");
    return runDocumentQueue(context.supabase, { householdId, limit: data?.limit ?? 2 });
  });

/**
 * Answers the reader's one question. The answer is recorded as a hint so a
 * re-read never overrides it, and the file goes straight back into the queue.
 */
export const confirmDocumentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => confirmInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);

    if (data.ownerProfileId) {
      const { data: person } = await context.supabase
        .from("profiles")
        .select("id")
        .eq("id", data.ownerProfileId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (!person) throw new Error("That person is not part of this household.");
    }

    const { error } = await context.supabase
      .from("documents")
      .update({
        type_hint: data.docType,
        status: "queued",
        attempts: 0,
        next_attempt_at: null,
        locked_at: null,
        error_message: null,
        ...(data.ownerProfileId ? { owner_profile_id: data.ownerProfileId } : {}),
      })
      .eq("id", data.documentId)
      .eq("household_id", householdId);
    if (error) throw new Error(error.message);
    return { queued: true };
  });

/**
 * Puts a failed or cancelled document back in the queue for another read.
 *
 * A file already handed to the statement importer is retried there instead:
 * re-reading it as a document would hand the same statement over twice and
 * leave a second row behind for the same file.
 */
export const retryDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);

    const { data: document, error: readError } = await context.supabase
      .from("documents")
      .select("statement_id")
      .eq("id", data.documentId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!document) throw new Error("That document is no longer on file.");

    if (document.statement_id) {
      const { error: statementError } = await context.supabase
        .from("statements")
        .update({
          status: "queued",
          attempts: 0,
          next_attempt_at: null,
          locked_at: null,
          error_message: null,
        })
        .eq("id", document.statement_id)
        .eq("household_id", householdId);
      if (statementError) throw new Error(statementError.message);
      return { queued: true, as: "statement" as const };
    }

    const { error } = await context.supabase
      .from("documents")
      .update({
        status: "queued",
        attempts: 0,
        next_attempt_at: null,
        locked_at: null,
        error_message: null,
        extracted_at: null,
      })
      .eq("id", data.documentId)
      .eq("household_id", householdId);
    if (error) throw new Error(error.message);
    return { queued: true, as: "document" as const };
  });


/** Stops a document being read, without touching anything it already produced. */
export const cancelDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("documents")
      .update({ status: "cancelled", locked_at: null, error_message: null })
      .eq("id", data.documentId)
      .eq("household_id", householdId)
      .in("status", ["queued", "extracting", "needs_type", "failed"]);
    if (error) throw new Error(error.message);
    return { cancelled: true };
  });

/**
 * Removes the file and its shelf entry.
 *
 * What the document produced — a policy, a tenancy, a payslip — is deliberately
 * left alone. Deleting a scan should not silently delete a year of pay history;
 * those records are removed on their own screens, where the consequence is
 * visible.
 */
export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);

    const { data: row } = await context.supabase
      .from("documents")
      .select("id, storage_bucket, file_path")
      .eq("id", data.documentId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (!row) throw new Error("That document is not part of this household.");

    await context.supabase.storage
      .from(row.storage_bucket ?? "documents")
      .remove([row.file_path])
      .catch(() => undefined);

    const { error } = await context.supabase
      .from("documents")
      .delete()
      .eq("id", data.documentId)
      .eq("household_id", householdId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });

/** A short-lived link to the original file, for reading it back. */
export const documentFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => documentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);

    const { data: row } = await context.supabase
      .from("documents")
      .select("storage_bucket, file_path")
      .eq("id", data.documentId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (!row) throw new Error("That document is not part of this household.");

    const { data: signed, error } = await context.supabase.storage
      .from(row.storage_bucket ?? "documents")
      .createSignedUrl(row.file_path, 120);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl as string };
  });
