/**
 * The one route to a model: the Lovable AI gateway, Responses API.
 *
 * Two shapes of call, both streamed on the wire. Strict JSON for the jobs that
 * must come back in a fixed shape (statement extraction, categorisation, the
 * briefing), and a token stream with its reasoning for the advisor. Everything
 * streams because these calls run for minutes — a buffered request that sends
 * no bytes is severed by the platform long before the model finishes, and is
 * billed anyway.
 *
 * Which model runs which job lives in `./models`, not here.
 */
import { AI_REASONING, modelFor, type AiJob, type ReasoningEffort } from "./models";
import { AiGatewayError, describeGatewayFailure } from "./errors";

const RESPONSES_ENDPOINT = "https://ai.gateway.lovable.dev/v1/responses";

export type JsonRequest = {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Output cap, reasoning included. */
  maxTokens?: number;
  signal?: AbortSignal;
};

export type AdvisorInputItem = { role: "user" | "assistant"; text: string };

export type StreamRequest = {
  instructions: string;
  input: AdvisorInputItem[];
  reasoningEffort?: ReasoningEffort;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type AiStreamEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "usage"; outputTokens: number | null };

function gatewayKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || !key.trim()) {
    throw new AiGatewayError({
      status: 401,
      message:
        "Lovable AI is not configured for this app, so nothing can be read or written by a model right now.",
    });
  }
  return key;
}

async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const key = gatewayKey();

  let response: Response;
  try {
    response = await fetch(RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      ...(signal ? { signal } : {}),
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AiGatewayError({
      status: 0,
      retryable: true,
      message: "Lovable AI could not be reached. This retries on its own.",
    });
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw describeGatewayFailure({ status: response.status, body: text });
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

function requestBody(input: {
  model: string;
  instructions: string;
  items: AdvisorInputItem[];
  reasoning: ReasoningEffort | null;
  reasoningSummary: boolean;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxOutputTokens?: number;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    instructions: input.instructions,
    input: input.items.map((item) => ({
      role: item.role,
      content: [
        { type: item.role === "assistant" ? "output_text" : "input_text", text: item.text },
      ],
    })),
    stream: true,
    store: false,
  };
  if (input.reasoning) {
    body["reasoning"] = {
      effort: input.reasoning,
      ...(input.reasoningSummary ? { summary: "auto" } : {}),
    };
  }
  if (input.jsonSchema) {
    body["text"] = {
      format: {
        type: "json_schema",
        name: input.jsonSchema.name,
        strict: true,
        schema: input.jsonSchema.schema,
      },
    };
  }
  if (input.maxOutputTokens) body["max_output_tokens"] = input.maxOutputTokens;
  return body;
}

async function* streamEvents(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): AsyncGenerator<AiStreamEvent> {
  const response = await post(body, signal);

  for await (const event of sseJson(response)) {
    const type = String(event["type"] ?? "");

    if (type === "response.output_text.delta") {
      const delta = String(event["delta"] ?? "");
      if (delta) yield { type: "text", delta };
    } else if (type === "response.reasoning_summary_text.delta") {
      const delta = String(event["delta"] ?? "");
      if (delta) yield { type: "reasoning", delta };
    } else if (type === "response.reasoning_summary_part.done") {
      yield { type: "reasoning", delta: "\n\n" };
    } else if (type === "response.incomplete") {
      // The output cap was reached. Whatever arrived stands — a truncated
      // answer is still the model's answer, and a truncated JSON body fails
      // its own parse a moment later.
      const detail = event["response"] as { usage?: { output_tokens?: number } } | undefined;
      yield { type: "usage", outputTokens: detail?.usage?.output_tokens ?? null };
    } else if (type === "response.failed") {
      const detail = event["response"] as { error?: { message?: string } } | undefined;
      throw new AiGatewayError({
        status: 502,
        retryable: true,
        message: detail?.error?.message ?? "Lovable AI could not finish the answer.",
      });
    } else if (type === "error") {
      throw new AiGatewayError({
        status: 502,
        retryable: true,
        message: String(event["message"] ?? "Lovable AI returned an error."),
      });
    } else if (type === "response.completed") {
      const detail = event["response"] as { usage?: { output_tokens?: number } } | undefined;
      yield { type: "usage", outputTokens: detail?.usage?.output_tokens ?? null };
    }
  }
}

/* ------------------------------------------------------------------ retries */

const MAX_ATTEMPTS = 3;

async function withRetries<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    try {
      return await run();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      lastError = error;
      const retryable = error instanceof AiGatewayError ? error.retryable : false;
      if (!retryable) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiGatewayError({ status: 0, message: "Lovable AI could not be reached." });
}

/* --------------------------------------------------------------- public API */

/**
 * A strict-JSON answer for one of the named jobs. Streams on the wire, returns
 * the parsed object; rate limits and upstream wobbles retry with backoff, and
 * anything terminal is thrown for the caller to show.
 */
export async function completeJson<T>(job: AiJob, request: JsonRequest): Promise<T> {
  const model = modelFor(job);
  const body = requestBody({
    model,
    instructions: request.system,
    items: [{ role: "user", text: request.user }],
    reasoning: AI_REASONING[job],
    reasoningSummary: false,
    jsonSchema: { name: request.schemaName, schema: request.schema },
    ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
  });

  return withRetries(async () => {
    let text = "";
    for await (const event of streamEvents(body, request.signal)) {
      if (event.type === "text") text += event.delta;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new AiGatewayError({
        status: 502,
        retryable: true,
        message: "Lovable AI returned an empty response.",
      });
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throw new AiGatewayError({
        status: 502,
        retryable: true,
        message: "Lovable AI returned a response that could not be read.",
      });
    }
  });
}

/**
 * One advisor turn, yielding the reasoning summary and the answer as they
 * arrive. Never aborts on a timer — a reasoning run of a minute or two is
 * ordinary, and the caller's own signal is the only cancellation.
 */
export function streamAdvisor(request: StreamRequest): AsyncGenerator<AiStreamEvent> {
  const body = requestBody({
    model: modelFor("advisory"),
    instructions: request.instructions,
    items: request.input,
    reasoning: request.reasoningEffort ?? AI_REASONING["advisory"],
    reasoningSummary: true,
    ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
  });

  return streamEvents(body, request.signal);
}
