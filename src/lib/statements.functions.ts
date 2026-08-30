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
        size: z.number().int().nonnegative().max(20 * 1024 * 1024),
      }),
    )
    .min(1)
    .max(40),
});

const pumpInput = z.object({ limit: z.number().int().min(1).max(6).optional() }).optional();

const statementInput = z.object({ statementId: z.string().uuid() });

const resolveInput = z.object({
  proposalId: z.string().uuid(),
  action: z.enum(["create", "link", "reject"]),
  accountId: z.string().uuid().nullable().optional(),
  nickname: z.string().min(1).max(80).nullable().optional(),
  accountType: z
    .enum(["current", "savings", "isa", "sipp", "gia", "crypto", "cash", "credit_card", "loan", "mortgage"])
    .nullable()
    .optional(),
  currency: z.string().length(3).nullable().optional(),
  country: z.string().min(2).max(2).nullable().optional(),
  institution: z.string().max(120).nullable().optional(),
  ownerProfileId: z.string().uuid().nullable().optional(),
  isJoint: z.boolean().optional(),
});

/** The household this user belongs to — every write below is scoped to it. */
async function householdOf(supabase: unknown, userId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("profiles")
    .select("household_id")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.household_id) throw new Error("No household is linked to this account.");
  return data.household_id as string;
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
    const householdId = await householdOf(context.supabase, context.userId);

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
        created_by: context.userId,
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
          uploaded_by: context.userId,
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
    const householdId = await householdOf(context.supabase, context.userId);
    const { runImportQueue } = await import("./import/worker.server");
    return runImportQueue(context.supabase, { householdId, limit: data?.limit ?? 2 });
  });

/** Puts a failed or cancelled statement back in the queue for another read. */
export const retryStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementInput.parse(data))
  .handler(async ({ data, context }) => {
    const householdId = await householdOf(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("statements")
      .update({
        status: "queued",
        attempts: 0,
        next_attempt_at: null,
        locked_at: null,
        error_message: null,
        parsed_at: null,
      })
      .eq("id", data.statementId)
      .eq("household_id", householdId);
    if (error) throw new Error(error.message);
    return { queued: true };
  });

/** Stops a statement being read, without deleting what it already imported. */
export const cancelStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statementInput.parse(data))
  .handler(async ({ data, context }) => {
    const householdId = await householdOf(context.supabase, context.userId);
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
 * Answers "what account is this?" once, for every statement that shares the
 * proposal — create a new account, merge into one already held, or reject the
 * file outright.
 */
export const resolveAccountProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolveInput.parse(data))
  .handler(async ({ data, context }) => {
    const householdId = await householdOf(context.supabase, context.userId);
    const { resolveProposal } = await import("./import/proposals.server");
    return resolveProposal(context.supabase, {
      householdId,
      userId: context.userId,
      ...data,
    });
  });

/** Applies a newly created category rule to transactions already imported. */
export const applyCategoryRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ruleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { applyRuleToExisting } = await import("./statement-import.server");
    const householdId = await householdOf(context.supabase, context.userId);
    const updated = await applyRuleToExisting(context.supabase, householdId, data.ruleId);
    return { updated };
  });
