/**
 * The advisor's route to a model.
 *
 * The provider itself lives in `@/lib/ai/providers.server` — this layer only
 * decides *which* provider the household chose for advisory work, streams
 * through it, and falls back to Lovable AI out loud if that choice cannot
 * answer. Every call streams: the advisor reasons before it speaks, so a
 * buffered request would sit silent for minutes and die on a platform timeout.
 */
import { FALLBACK_PROVIDER, PROVIDER_LABELS, defaultModel, type AiProviderId } from "@/lib/ai/catalog";
import { AiProviderError } from "@/lib/ai/errors";
import { providerKey, streamCompletion, type StreamRequest } from "@/lib/ai/providers.server";
import { resolveAiProvider } from "@/lib/ai/runner.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

/** Kept so existing callers keep branching on one advisor-shaped error. */
export { AiProviderError as AdvisorGatewayError } from "@/lib/ai/errors";

export type AdvisorInputItem = { role: "user" | "assistant"; text: string };

export type ResponsesRequest = Omit<StreamRequest, "input"> & { input: AdvisorInputItem[] };

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

/**
 * Streams one advisor turn, yielding the reasoning summary and the answer as
 * they arrive. Never aborts on a timer — a reasoning run of a minute or two is
 * ordinary, and the caller's own signal is the only cancellation. If the chosen
 * provider fails *before saying anything*, Lovable AI takes the turn and the
 * substitution is announced rather than hidden.
 */
export async function* streamAdvisor(
  request: ResponsesRequest & { provider?: AiProviderId; model: string; note?: string | null },
): AsyncGenerator<AdvisorStreamEvent> {
  const provider: AiProviderId = request.provider ?? FALLBACK_PROVIDER;
  const { provider: _provider, note, ...rest } = request;
  let announced = false;
  let produced = false;

  const run = async function* (
    activeProvider: AiProviderId,
    activeModel: string,
    activeNote: string | null,
  ): AsyncGenerator<AdvisorStreamEvent> {
    for await (const event of streamCompletion(activeProvider, activeModel, {
      ...rest,
      model: undefined,
    } as unknown as StreamRequest)) {
      if (!announced) {
        announced = true;
        yield { type: "model", provider: activeProvider, model: activeModel, note: activeNote };
      }
      if (event.type === "text" && event.delta) produced = true;
      yield event;
    }
    if (!announced) {
      announced = true;
      yield { type: "model", provider: activeProvider, model: activeModel, note: activeNote };
    }
  };

  try {
    yield* run(provider, request.model, note ?? null);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const canFallBack =
      !aborted &&
      !produced &&
      provider !== FALLBACK_PROVIDER &&
      providerKey(FALLBACK_PROVIDER) !== null;
    if (!canFallBack) throw error;

    const reason = error instanceof Error ? error.message : "it failed";
    announced = false;
    yield* run(
      FALLBACK_PROVIDER,
      defaultModel(FALLBACK_PROVIDER, "advisory"),
      `${PROVIDER_LABELS[provider]} could not answer, so Lovable AI did. ${reason}`,
    );
  }
}

/** One-shot structured call: streams, accumulates, parses. */
export async function advisorJson<T>(
  request: ResponsesRequest & { provider?: AiProviderId; model: string; note?: string | null },
): Promise<T> {
  let text = "";
  for await (const event of streamAdvisor(request)) {
    if (event.type === "text") text += event.delta;
  }
  const trimmed = text.trim();
  const provider = request.provider ?? FALLBACK_PROVIDER;
  if (!trimmed) {
    throw new AiProviderError({
      provider,
      status: 502,
      retryable: true,
      terminal: false,
      message: `${PROVIDER_LABELS[provider]} returned an empty response, so nothing was written.`,
    });
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new AiProviderError({
      provider,
      status: 502,
      retryable: true,
      terminal: false,
      message: `${PROVIDER_LABELS[provider]} returned a response that could not be read.`,
    });
  }
}
