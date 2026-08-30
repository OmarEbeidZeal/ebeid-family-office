/**
 * Who runs the household's AI work.
 *
 * Reading the settings, listing what a provider actually offers, saving a
 * choice, and proving the choice works with a real call. Every model name comes
 * from the provider itself — nothing here guesses an id that may not exist.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_JOBS, type AiJob, type AiProviderId } from "@/lib/ai/catalog";

const jobEnum = z.enum(["extraction", "categorisation", "advisory"]);
const providerEnum = z.enum(["lovable", "anthropic", "openai"]);

const saveInput = z.object({
  job: jobEnum,
  provider: providerEnum,
  model: z.string().trim().max(120).nullable().optional(),
});

const modelsInput = z.object({ provider: providerEnum });
const testInput = z.object({ job: jobEnum });

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

export type AiJobSetting = {
  job: AiJob;
  /** What the household chose, or the default when they have not chosen. */
  provider: AiProviderId;
  model: string;
  /** What would actually run right now, once missing keys are accounted for. */
  effective: { provider: AiProviderId; model: string };
  note: string | null;
  configured: boolean;
};

export type AiSettingsView = {
  available: Record<AiProviderId, boolean>;
  jobs: AiJobSetting[];
};

/** The current per-job choice, and what would really answer if called now. */
export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiSettingsView> => {
    const householdId = await householdOf(context.supabase, context.userId);
    const { providerAvailability } = await import("./ai/providers.server");
    const { resolveAiProvider } = await import("./ai/runner.server");

    const { data: rows } = await context.supabase
      .from("ai_settings")
      .select("job, provider, model")
      .eq("household_id", householdId);

    const saved = new Map((rows ?? []).map((row) => [row.job as AiJob, row]));

    const jobs: AiJobSetting[] = [];
    for (const job of AI_JOBS) {
      const resolved = await resolveAiProvider(context.supabase, householdId, job.id);
      const row = saved.get(job.id);
      jobs.push({
        job: job.id,
        provider: resolved.requested.provider,
        model: row?.model ?? resolved.requested.model,
        effective: { provider: resolved.provider, model: resolved.model },
        note: resolved.note,
        configured: !!row,
      });
    }

    return { available: providerAvailability(), jobs };
  });

/** The provider's own catalogue, so the picker never invents a model id. */
export const listAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => modelsInput.parse(data))
  .handler(async ({ data }): Promise<{ models: string[]; error: string | null }> => {
    const { listProviderModels } = await import("./ai/providers.server");
    try {
      return { models: await listProviderModels(data.provider), error: null };
    } catch (error) {
      return {
        models: [],
        error: error instanceof Error ? error.message : "That provider could not be reached.",
      };
    }
  });

/** Saves one job's provider and model for this household. */
export const saveAiSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    const householdId = await householdOf(context.supabase, context.userId);
    const model = data.model?.trim() ? data.model.trim() : null;

    const { error } = await context.supabase.from("ai_settings").upsert(
      {
        household_id: householdId,
        job: data.job,
        provider: data.provider,
        model,
        updated_by: context.userId,
      },
      { onConflict: "household_id,job" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type AiTestResult = {
  ok: boolean;
  provider: AiProviderId;
  model: string;
  usedFallback: boolean;
  notes: string[];
  durationMs: number;
  reply: string | null;
  error: string | null;
};

/**
 * A real round trip on the household's own settings — the only honest way to
 * know a provider and model combination works before an import depends on it.
 */
export const testAiJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testInput.parse(data))
  .handler(async ({ data, context }): Promise<AiTestResult> => {
    const householdId = await householdOf(context.supabase, context.userId);
    const { createJsonRunner } = await import("./ai/runner.server");
    const runner = await createJsonRunner(context.supabase, householdId, data.job);
    const started = Date.now();

    try {
      const result = await runner.json<{ reply: string }>({
        system:
          "You are being checked for connectivity by a wealth-management app. Answer in the exact shape requested and nothing else.",
        user: 'Reply with json: {"reply":"ready"}',
        schemaName: "connectivity_check",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["reply"],
          properties: { reply: { type: "string" } },
        },
        maxTokens: 200,
      });

      return {
        ok: true,
        provider: runner.provider,
        model: runner.model,
        usedFallback: runner.usedFallback,
        notes: runner.notes,
        durationMs: Date.now() - started,
        reply: result?.reply ?? null,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        provider: runner.provider,
        model: runner.model,
        usedFallback: runner.usedFallback,
        notes: runner.notes,
        durationMs: Date.now() - started,
        reply: null,
        error: error instanceof Error ? error.message : "The call failed.",
      };
    }
  });
