/**
 * Everything the import screen asks the server to do.
 *
 * Uploading writes rows and returns; the reading happens in the queue, so a
 * closed laptop lid no longer loses an import. The browser "pumps" the queue
 * while it is open for immediate progress, and the five-minute scheduled run
 * finishes anything left.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ruleInput = z.object({ ruleId: z.string().uuid() });

const queueInput = z.object({
  accountId: z.string().uuid().nullable().optional(),
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
      }),
    )
    .min(1)
    .max(40),
});

const pumpInput = z.object({ limit: z.number().int().min(1).max(6).optional() }).optional();

const statementInput = z.object({ statementId: z.string().uuid() });

const assignInput = z.object({
  statementId: z.string().uuid(),
  accountId: z.string().uuid(),
});

const resolveInput = z.object({
  proposalId: z.string().uuid(),
  action: z.enum(["create", "link", "reject"]),
  accountId: z.string().uuid().nullable().optional(),
  nickname: z.string().min(1).max(80).nullable().optional(),
  accountType: z
    .enum([
      "current",
      "savings",
      "isa",
      "sipp",
      "gia",
      "crypto",
      "cash",
      "credit_card",
      "loan",
      "mortgage",
    ])
    .nullable()
    .optional(),
  currency: z.string().length(3).nullable().optional(),
  country: z.string().min(2).max(2).nullable().optional(),
  institution: z.string().max(120).nullable().optional(),
  // A profile id, or "joint". Required to confirm a new account — never
  // filled in from whoever happened to upload the statement.
  ownership: z.string().min(1).max(64).nullable().optional(),

});

/**
 * The household this person belongs to, and the member record they *are*.
 * A login is not a profile id any more — Haya can own accounts before she has
 * signed in, so the two are resolved rather than assumed equal.
 */
async function viewerOf(supabase: unknown, userId: string) {
  const { resolveViewer } = await import("./viewer.server");
  return resolveViewer(supabase, userId);
}


/**
 * Registers uploaded files as a batch of queued statements. No account is
 * required: the reader works out which account each file belongs to and asks
 * only when it genuinely cannot tell.
 */
export const queueStatements = createServerFn({ method: "POST" })
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

    if (data.accountId) {
      const { data: account } = await context.supabase
        .from("accounts")
        .select("id")
        .eq("id", data.accountId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (!account) throw new Error("That account is not part of this household.");
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
      .from("statements")
      .insert(
        data.files.map((file) => ({
          household_id: householdId,
          account_id: data.accountId ?? null,
          import_batch_id: batch.id,
          uploaded_by: profileId,
          file_path: file.path,
          file_name: file.name,
          file_size: file.size,
          status: "queued",
        })),
      )
      .select("id");
    if (error) throw new Error(error.message);

    return { batchId: batch.id as string, statementIds: (rows ?? []).map((row) => row.id) };
  });

/**
 * Reads a couple of queued statements now. The browser calls this in a loop so
 * progress is visible; the scheduled run does the same work unattended.
 */
export const pumpImportQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => pumpInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);
    const { runImportQueue } = await import("./import/worker.server");
    return runImportQueue(context.supabase, { householdId, limit: data?.limit ?? 2 });
  });

/**
 * Reads a file again — after a failure, or simply because the reader has since
 * learned something the first pass missed.
 *
 * Nothing is imported twice: every line is matched against what the account
 * already holds, and a second reading only fills in what was missing, such as a
 * running balance the earlier reader dropped.
 */
export const retryStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);

    // Retry means read the file again. The reader caches what it made of a file
    // beside the file itself, so without clearing that cache a retry would
    // replay the same misreading — which is exactly what happened to the files
    // that failed before the parser understood their format.
    const { data: statement } = await context.supabase
      .from("statements")
      .select("file_path, storage_bucket")
      .eq("id", data.statementId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (statement?.file_path) {
      const { removeCachedExtraction } = await import("@/lib/import/pipeline.server");
      await removeCachedExtraction(
        context.supabase,
        statement.file_path,
        statement.storage_bucket ?? "statements",
      ).catch(() => undefined);
    }

    const { error } = await context.supabase
      .from("statements")
      .update({
        status: "queued",
        attempts: 0,
        next_attempt_at: null,
        locked_at: null,
        error_message: null,
        parsed_at: null,
        // Clearing the fingerprint of the file makes the reader check again
        // whether this is the same file as one already held — the check that
        // keeps a second reading of a copy from importing it twice.
        file_hash: null,
      })
      .eq("id", data.statementId)
      .eq("household_id", householdId);
    if (error) throw new Error(error.message);
    return { queued: true };
  });

/**
 * Read a file again from nothing — for when the first reading was wrong, not
 * merely incomplete.
 *
 * A plain re-read keeps everything already imported and only fills gaps, which
 * is right when the reader has learnt to see more in the same file. It is wrong
 * when the reader has learnt the file is a different thing entirely: a Monzo
 * Flex credit line pooled into a current account cannot be corrected row by
 * row. So the transactions this file wrote are removed, the file lets go of the
 * account it was filed under, and it queues as if newly uploaded — asking again
 * which account it belongs to. Nothing any other file imported is touched.
 */
export const reimportStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);

    const { data: statement } = await context.supabase
      .from("statements")
      .select("file_path, storage_bucket")
      .eq("id", data.statementId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (statement?.file_path) {
      const { removeCachedExtraction } = await import("@/lib/import/pipeline.server");
      await removeCachedExtraction(
        context.supabase,
        statement.file_path,
        statement.storage_bucket ?? "statements",
      ).catch(() => undefined);
    }

    const { unfileStatement } = await import("@/lib/accounts/repair.server");
    return await unfileStatement(context.supabase, {
      householdId,
      statementId: data.statementId,
    });
  });





/** Stops a statement being read, without deleting what it already imported. */
export const cancelStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("statements")
      .update({ status: "cancelled", locked_at: null, error_message: null })
      .eq("id", data.statementId)
      .eq("household_id", householdId)
      .in("status", ["queued", "awaiting_account", "failed", "extracting"]);
    if (error) throw new Error(error.message);
    return { cancelled: true };
  });

/**
 * Files the one kind of statement nobody can identify for you.
 *
 * A QIF export names no bank and carries no account number, so there is nothing
 * to propose and nothing to remember — the household simply says which account
 * it is, and the file goes straight back into the queue.
 */
export const assignStatementAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId } = await viewerOf(context.supabase, context.userId);

    const { data: account } = await context.supabase
      .from("accounts")
      .select("id")
      .eq("id", data.accountId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (!account) throw new Error("That account is not part of this household.");

    const { error } = await context.supabase
      .from("statements")
      .update({
        account_id: data.accountId,
        status: "queued",
        attempts: 0,
        next_attempt_at: null,
        locked_at: null,
        error_message: null,
        parsed_at: null,
      })
      .eq("id", data.statementId)
      .eq("household_id", householdId)
      .in("status", ["awaiting_account", "failed", "cancelled"]);
    if (error) throw new Error(error.message);
    return { queued: true };
  });

/**
 * Answers "what account is this?" once, for every statement that shares the
 * proposal — create a new account, merge into one already held, or reject the
 * file outright.
 */
export const resolveAccountProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { householdId, profileId } = await viewerOf(context.supabase, context.userId);
    const { resolveProposal } = await import("./import/proposals.server");
    return resolveProposal(context.supabase, {
      householdId,
      profileId,
      ...data,
    });
  });

/** Applies a newly created category rule to transactions already imported. */
export const applyCategoryRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ruleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { applyRuleToExisting } = await import("./statement-import.server");
    const { householdId } = await viewerOf(context.supabase, context.userId);
    const updated = await applyRuleToExisting(context.supabase, householdId, data.ruleId);
    return { updated };
  });
