/**
 * The advisor's route to a model.
 *
 * The provider adapters live in `@/lib/ai/providers.server` — this layer only
 * decides *which* provider the household chose for advisory work, streams
 * through it, and falls back to Lovable AI out loud if that choice cannot
 * answer. Every call streams: the advisor reasons before it speaks, so a
 * buffered request would sit silent for minutes and die on a platform timeout.
 */
import {
  FALLBACK_PROVIDER,
  PROVIDER_LABELS,
  defaultModel,
  type AiProviderId,
} from "@/lib/ai/catalog";
import { providerKey, streamCompletion, type StreamRequest } from "@/lib/ai/providers.server";
import { resolveAiProvider } from "@/lib/ai/runner.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/** Kept so callers keep branching on one advisor-shaped error. */
export { AiProviderError as AdvisorGatewayError } from "@/lib/ai/errors";

export type AdvisorInputItem = { role: "user" | "assistant"; text: string };

export type AdvisorStreamEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "usage"; outputTokens: number | null }
  /** Who is actually answering, emitted before the first token. */
  | { type: "model"; provider: AiProviderId; model: string; note: string | null };

export type AdvisorModelChoice = {
  provider: AiProviderId;
  model: string;
  /** Set when the household's choice was unusable and Lovable AI stood in. */
  note: string | null;
};

/** Which model the household has chosen for advisory work, if it can run. */
export async function resolveAdvisorModel(
  supabase: Client,
  householdId: string | null,
): Promise<AdvisorModelChoice> {
  const resolved = await resolveAiProvider(supabase, householdId, "advisory");
  return { provider: resolved.provider, model: resolved.model, note: resolved.note };
}

export type AdvisorStreamRequest = {
  provider: AiProviderId;
  model: string;
  note?: string | null;
  instructions: string;
  input: AdvisorInputItem[];
  reasoningEffort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

/**
 * Streams one advisor turn, yielding the reasoning summary and the answer as
 * they arrive. Never aborts on a timer — a reasoning run of a minute or two is
 * ordinary, and the caller's own signal is the only cancellation. If the chosen
 * provider fails *before saying anything*, Lovable AI takes the turn and the
 * substitution is announced rather than hidden.
 */
export async function* streamAdvisor(
  request: AdvisorStreamRequest,
): AsyncGenerator<AdvisorStreamEvent> {
  const payload: StreamRequest = {
    instructions: request.instructions,
    input: request.input,
    ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
    ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  };

  let produced = false;

  const run = async function* (
    provider: AiProviderId,
    model: string,
    note: string | null,
  ): AsyncGenerator<AdvisorStreamEvent> {
    let announced = false;
    for await (const event of streamCompletion(provider, model, payload)) {
      if (!announced) {
        announced = true;
        yield { type: "model", provider, model, note };
      }
      if (event.type === "text" && event.delta) produced = true;
      yield event;
    }
    if (!announced) yield { type: "model", provider, model, note };
  };

  try {
    yield* run(request.provider, request.model, request.note ?? null);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const canFallBack =
      !aborted &&
      !produced &&
      request.provider !== FALLBACK_PROVIDER &&
      providerKey(FALLBACK_PROVIDER) !== null;
    if (!canFallBack) throw error;

    const reason = error instanceof Error ? error.message : "it failed";
    yield* run(
      FALLBACK_PROVIDER,
      defaultModel(FALLBACK_PROVIDER, "advisory"),
      `${PROVIDER_LABELS[request.provider]} could not answer, so Lovable AI did. ${reason}`,
    );
  }
}
