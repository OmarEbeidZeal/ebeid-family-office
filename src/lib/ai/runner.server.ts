/**
 * Choosing who runs a job, and being honest about who actually ran it.
 *
 * The household picks a provider and model per job in Settings. This resolves
 * that choice against the keys that actually exist, runs the call, and — if the
 * chosen provider cannot do it — falls back to Lovable AI and records that it
 * did. A silent fallback would make the setting a lie.
 */
import { defaultModel, FALLBACK_PROVIDER, type AiJob, type AiProviderId } from "./catalog";
import { AiProviderError } from "./errors";
import { completeJson, providerKey, providerLabel, type JsonRequest } from "./providers.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type ResolvedProvider = {
  job: AiJob;
  provider: AiProviderId;
  model: string;
  /** What the household asked for, before availability was taken into account. */
  requested: { provider: AiProviderId; model: string };
  /** Set when the chosen provider has no key and Lovable AI stood in. */
  unavailable: boolean;
  note: string | null;
};

export async function resolveAiProvider(
  supabase: Client,
  householdId: string | null,
  job: AiJob,
): Promise<ResolvedProvider> {
  let provider: AiProviderId = FALLBACK_PROVIDER;
  let model: string | null = null;

  if (householdId) {
    const { data } = await supabase
      .from("ai_settings")
      .select("provider, model")
      .eq("household_id", householdId)
      .eq("job", job)
      .maybeSingle();
    if (data?.provider) provider = data.provider as AiProviderId;
    if (data?.model) model = data.model as string;
  }

  const requested = { provider, model: model ?? defaultModel(provider, job) };

  if (provider !== FALLBACK_PROVIDER) {
    const reason = !providerKey(provider)
      ? `${providerLabel(provider)} has no key`
      : !requested.model
        ? `no ${providerLabel(provider)} model has been chosen`
        : null;
    if (reason) {
      return {
        job,
        provider: FALLBACK_PROVIDER,
        model: defaultModel(FALLBACK_PROVIDER, job),
        requested,
        unavailable: true,
        note: `${reason}, so Lovable AI ran this instead.`,
      };
    }
  }


  return {
    job,
    provider,
    model: requested.model,
    requested,
    unavailable: false,
    note: null,
  };
}

export type JsonRunner = {
  readonly job: AiJob;
  /** Who was configured. */
  readonly requested: { provider: AiProviderId; model: string };
  /** Who actually answered the most recent call. */
  readonly provider: AiProviderId;
  readonly model: string;
  readonly usedFallback: boolean;
  readonly notes: string[];
  json<T>(request: JsonRequest): Promise<T>;
};

const RETRYABLE_ATTEMPTS = 3;

async function attempt<T>(
  provider: AiProviderId,
  model: string,
  request: JsonRequest,
): Promise<T> {
  let lastError: unknown = null;

  for (let index = 0; index < RETRYABLE_ATTEMPTS; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, index * 1500));
    try {
      return await completeJson<T>(provider, model, request);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      lastError = error;
      const retryable = error instanceof AiProviderError ? error.retryable : false;
      if (!retryable) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiProviderError({
        provider,
        status: 0,
        retryable: false,
        message: `${providerLabel(provider)} could not be reached.`,
      });
}

/**
 * A runner bound to one job for the length of one piece of work, so an import
 * can report "read by Claude Sonnet 5" or "Anthropic was down, Lovable AI read
 * it instead" rather than leaving the household guessing.
 */
export async function createJsonRunner(
  supabase: Client,
  householdId: string | null,
  job: AiJob,
): Promise<JsonRunner> {
  const resolved = await resolveAiProvider(supabase, householdId, job);

  const state = {
    provider: resolved.provider,
    model: resolved.model,
    usedFallback: resolved.unavailable,
    notes: resolved.note ? [resolved.note] : [],
  };

  return {
    job,
    requested: resolved.requested,
    get provider() {
      return state.provider;
    },
    get model() {
      return state.model;
    },
    get usedFallback() {
      return state.usedFallback;
    },
    get notes() {
      return state.notes;
    },
    async json<T>(request: JsonRequest): Promise<T> {
      try {
        return await attempt<T>(state.provider, state.model, request);
      } catch (error) {
        const canFallBack =
          state.provider !== FALLBACK_PROVIDER && providerKey(FALLBACK_PROVIDER) !== null;
        if (!canFallBack || (error instanceof Error && error.name === "AbortError")) throw error;

        const reason = error instanceof Error ? error.message : "it failed";
        const fallbackModel = defaultModel(FALLBACK_PROVIDER, job);
        const result = await attempt<T>(FALLBACK_PROVIDER, fallbackModel, request);

        state.usedFallback = true;
        state.provider = FALLBACK_PROVIDER;
        state.model = fallbackModel;
        const note = `${providerLabel(resolved.provider)} could not run this, so Lovable AI did. ${reason}`;
        if (!state.notes.includes(note)) state.notes.push(note);
        return result;
      }
    },
  };
}
