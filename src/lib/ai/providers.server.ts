/**
 * The three provider adapters, behind one shape.
 *
 * Every provider answers two questions: give me strict JSON back (extraction,
 * categorisation), and stream me an answer with its reasoning (the advisor).
 * Swapping provider therefore changes one row in `ai_settings` and nothing in
 * the calling code.
 *
 * Every call streams. A statement of a few thousand rows or an advisor turn on
 * a reasoning model both run for minutes, and a buffered request that sends no
 * bytes gets cut by the platform long before the model finishes.
 */
import { AI_PROVIDERS, type AiProviderId } from "./catalog";
import { AiProviderError, describeAiFailure } from "./errors";

const ENDPOINTS = {
  lovableChat: "https://ai.gateway.lovable.dev/v1/chat/completions",
  lovableResponses: "https://ai.gateway.lovable.dev/v1/responses",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
} as const;

export type JsonRequest = {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type StreamRequest = {
  instructions: string;
  input: Array<{ role: "user" | "assistant"; text: string }>;
  reasoningEffort?: "low" | "medium" | "high";
  jsonSchema?: { name: string; schema: unknown };
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type AiStreamEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "usage"; outputTokens: number | null };

export function providerLabel(provider: AiProviderId): string {
  return AI_PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider;
}

export function providerSecretName(provider: AiProviderId): string {
  return AI_PROVIDERS.find((entry) => entry.id === provider)?.secretName ?? "LOVABLE_API_KEY";
}

export function providerKey(provider: AiProviderId): string | null {
  const value = process.env[providerSecretName(provider)];
  return value && value.trim().length > 0 ? value : null;
}

export function providerAvailability(): Record<AiProviderId, boolean> {
  return {
    lovable: providerKey("lovable") !== null,
    anthropic: providerKey("anthropic") !== null,
    openai: providerKey("openai") !== null,
  };
}

function requireKey(provider: AiProviderId): string {
  const key = providerKey(provider);
  if (!key) {
    throw new AiProviderError({
      provider,
      status: 401,
      terminal: true,
      message: `${providerLabel(provider)} has no key. Add ${providerSecretName(provider)} in Project Settings → Secrets, or choose another provider for this job.`,
    });
  }
  return key;
}

/* ------------------------------------------------------------------- wire */

async function post(
  provider: AiProviderId,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AiProviderError({
      provider,
      status: 0,
      retryable: true,
      terminal: false,
      message: `${providerLabel(provider)} could not be reached. This retries on its own.`,
    });
  }
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw describeAiFailure({
      provider,
      label: providerLabel(provider),
      status: response.status,
      body,
    });
  }
  return response;
}

/** Server-sent events, one parsed JSON payload at a time. */
async function* sseJson(response: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // A half-written frame is not an error; the next read completes it.
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- Lovable */

async function* lovableChatStream(
  model: string,
  request: JsonRequest,
): AsyncGenerator<AiStreamEvent> {
  const key = requireKey("lovable");
  const response = await post("lovable", ENDPOINTS.lovableChat, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      max_tokens: request.maxTokens ?? 8000,
      response_format: {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      },
    }),
  });

  for await (const event of sseJson(response)) {
    const choices = event["choices"] as
      | Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>
      | undefined;
    const delta = choices?.[0]?.delta?.content;
    if (delta) yield { type: "text", delta };
    const usage = event["usage"] as { completion_tokens?: number } | undefined;
    if (usage) yield { type: "usage", outputTokens: usage.completion_tokens ?? null };
  }
}

/* -------------------------------------------------- OpenAI-shaped Responses */

function responsesBody(
  model: string,
  request: StreamRequest,
  options: { reasoning: boolean },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    instructions: request.instructions,
    input: request.input.map((item) => ({
      role: item.role,
      content: [
        { type: item.role === "assistant" ? "output_text" : "input_text", text: item.text },
      ],
    })),
    stream: true,
    store: false,
  };
  if (options.reasoning && request.reasoningEffort) {
    body["reasoning"] = { effort: request.reasoningEffort, summary: "auto" };
  }
  if (request.jsonSchema) {
    body["text"] = {
      format: {
        type: "json_schema",
        name: request.jsonSchema.name,
        strict: true,
        schema: request.jsonSchema.schema,
      },
    };
  }
  if (request.maxOutputTokens) body["max_output_tokens"] = request.maxOutputTokens;
  return body;
}

async function* responsesStream(
  provider: "lovable" | "openai",
  model: string,
  request: StreamRequest,
  options: { reasoning: boolean },
): AsyncGenerator<AiStreamEvent> {
  const key = requireKey(provider);
  const url = provider === "lovable" ? ENDPOINTS.lovableResponses : `${ENDPOINTS.openai}/responses`;
  const headers: Record<string, string> =
    provider === "lovable"
      ? {
          "content-type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        }
      : { "content-type": "application/json", Authorization: `Bearer ${key}` };

  const response = await post(provider, url, {
    method: "POST",
    headers,
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify(responsesBody(model, request, options)),
  });

  for await (const event of sseJson(response)) {
    const type = String(event["type"] ?? "");
    if (type === "response.reasoning_summary_text.delta") {
      const delta = String(event["delta"] ?? "");
      if (delta) yield { type: "reasoning", delta };
    } else if (type === "response.output_text.delta") {
      const delta = String(event["delta"] ?? "");
      if (delta) yield { type: "text", delta };
    } else if (type === "response.reasoning_summary_part.done") {
      yield { type: "reasoning", delta: "\n\n" };
    } else if (type === "response.failed" || type === "response.incomplete") {
      const detail = event["response"] as { error?: { message?: string } } | undefined;
      throw new AiProviderError({
        provider,
        status: 502,
        retryable: true,
        terminal: false,
        message: detail?.error?.message ?? `${providerLabel(provider)} could not finish the answer.`,
      });
    } else if (type === "error") {
      throw new AiProviderError({
        provider,
        status: 502,
        retryable: true,
        terminal: false,
        message: String(event["message"] ?? `${providerLabel(provider)} returned an error.`),
      });
    } else if (type === "response.completed") {
      const detail = event["response"] as { usage?: { output_tokens?: number } } | undefined;
      yield { type: "usage", outputTokens: detail?.usage?.output_tokens ?? null };
    }
  }
}

/* -------------------------------------------------------------- Anthropic */

const THINKING_BUDGET: Record<"low" | "medium" | "high", number> = {
  low: 2048,
  medium: 6144,
  high: 12288,
};

async function* anthropicStream(
  model: string,
  request: StreamRequest & { tool?: { name: string; schema: Record<string, unknown> } },
): AsyncGenerator<AiStreamEvent> {
  const key = requireKey("anthropic");
  const thinking = request.reasoningEffort ? THINKING_BUDGET[request.reasoningEffort] : 0;
  const maxTokens = Math.max(request.maxOutputTokens ?? 8000, thinking + 2048);

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    stream: true,
    system: request.instructions,
    messages: request.input.map((item) => ({ role: item.role, content: item.text })),
  };
  if (thinking) body["thinking"] = { type: "enabled", budget_tokens: thinking };
  if (request.tool) {
    // Claude has no JSON-schema response format; a single forced tool call is
    // the supported way to get a strictly shaped object back.
    body["tools"] = [
      {
        name: request.tool.name,
        description: "Return the result in this exact shape.",
        input_schema: request.tool.schema,
      },
    ];
    body["tool_choice"] = { type: "tool", name: request.tool.name };
    delete body["thinking"];
  }

  const response = await post("anthropic", `${ENDPOINTS.anthropic}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify(body),
  });

  for await (const event of sseJson(response)) {
    const type = String(event["type"] ?? "");
    if (type === "content_block_delta") {
      const delta = event["delta"] as
        | { type?: string; text?: string; thinking?: string; partial_json?: string }
        | undefined;
      if (delta?.type === "text_delta" && delta.text) yield { type: "text", delta: delta.text };
      else if (delta?.type === "thinking_delta" && delta.thinking)
        yield { type: "reasoning", delta: delta.thinking };
      else if (delta?.type === "input_json_delta" && delta.partial_json)
        yield { type: "text", delta: delta.partial_json };
    } else if (type === "message_delta") {
      const usage = event["usage"] as { output_tokens?: number } | undefined;
      if (usage) yield { type: "usage", outputTokens: usage.output_tokens ?? null };
    } else if (type === "error") {
      const detail = event["error"] as { message?: string } | undefined;
      throw new AiProviderError({
        provider: "anthropic",
        status: 502,
        retryable: true,
        terminal: false,
        message: detail?.message ?? "Anthropic returned an error.",
      });
    }
  }
}

/* -------------------------------------------------------------- public API */

/** Strict-JSON completion. Streams on the wire, returns the parsed object. */
export async function completeJson<T>(
  provider: AiProviderId,
  model: string,
  request: JsonRequest,
): Promise<T> {
  let text = "";

  const consume = async (events: AsyncGenerator<AiStreamEvent>) => {
    for await (const event of events) if (event.type === "text") text += event.delta;
  };

  if (provider === "lovable") {
    await consume(lovableChatStream(model, request));
  } else if (provider === "openai") {
    await consume(
      responsesStream(
        "openai",
        model,
        {
          instructions: request.system,
          input: [{ role: "user", text: request.user }],
          jsonSchema: { name: request.schemaName, schema: request.schema },
          maxOutputTokens: request.maxTokens ?? 8000,
          ...(request.signal ? { signal: request.signal } : {}),
        },
        { reasoning: false },
      ),
    );
  } else {
    await consume(
      anthropicStream(model, {
        instructions: request.system,
        input: [{ role: "user", text: request.user }],
        maxOutputTokens: request.maxTokens ?? 8000,
        tool: { name: request.schemaName, schema: request.schema },
        ...(request.signal ? { signal: request.signal } : {}),
      }),
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new AiProviderError({
      provider,
      status: 502,
      retryable: true,
      terminal: false,
      message: `${providerLabel(provider)} returned an empty response.`,
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
      message: `${providerLabel(provider)} returned a response that could not be read.`,
    });
  }
}

/** Streamed answer with its reasoning, for the advisor. */
export function streamCompletion(
  provider: AiProviderId,
  model: string,
  request: StreamRequest,
): AsyncGenerator<AiStreamEvent> {
  if (provider === "anthropic") return anthropicStream(model, request);
  return responsesStream(provider === "openai" ? "openai" : "lovable", model, request, {
    reasoning: true,
  });
}

/** The provider's own model list, so the picker never invents an id. */
export async function listProviderModels(provider: AiProviderId): Promise<string[]> {
  if (provider === "lovable") return [];
  const key = requireKey(provider);

  const url =
    provider === "anthropic" ? `${ENDPOINTS.anthropic}/models?limit=100` : `${ENDPOINTS.openai}/models`;
  const headers: Record<string, string> =
    provider === "anthropic"
      ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${key}` };

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw new AiProviderError({
      provider,
      status: 0,
      retryable: true,
      terminal: false,
      message: `${providerLabel(provider)} could not be reached.`,
    });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw describeAiFailure({
      provider,
      label: providerLabel(provider),
      status: response.status,
      body,
    });
  }

  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  return (payload.data ?? [])
    .map((entry) => entry.id ?? "")
    .filter((id) => id.length > 0)
    .sort();
}
