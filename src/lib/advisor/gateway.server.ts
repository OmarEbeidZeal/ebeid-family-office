/**
 * Lovable AI gateway — Responses API.
 *
 * The advisor is a reasoning model, so every call streams: a buffered request
 * would sit silent for minutes and die on a platform timeout. One-shot callers
 * (the briefing) consume the stream server-side and take the final text.
 */

const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";

export class AdvisorGatewayError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "AdvisorGatewayError";
    this.status = status;
    this.retryable = retryable;
  }
}

/** Plain English for each terminal status, per the gateway's error contract. */
function describe(status: number, body: string): AdvisorGatewayError {
  const snippet = body.slice(0, 300);
  if (status === 401) {
    return new AdvisorGatewayError(
      "The advisor is not configured for this workspace — the AI key is missing or invalid.",
      status,
      false,
    );
  }
  if (status === 402) {
    return new AdvisorGatewayError(
      "The workspace has run out of AI credits, so the advisor cannot answer. Top up credits in Lovable and try again.",
      status,
      false,
    );
  }
  if (status === 403) {
    return new AdvisorGatewayError(
      "AI access is blocked for this workspace by an admin setting or credit limit. The advisor stays unavailable until that is lifted.",
      status,
      false,
    );
  }
  if (status === 429) {
    return new AdvisorGatewayError(
      "The AI service is rate limited right now. Wait a moment and send the message again — nothing was lost.",
      status,
      true,
    );
  }
  if (status >= 500) {
    return new AdvisorGatewayError(
      "The AI service had a temporary problem. Try again in a moment.",
      status,
      true,
    );
  }
  return new AdvisorGatewayError(
    `The AI service rejected the request (${status}). ${snippet}`,
    status,
    false,
  );
}

export type AdvisorInputItem = {
  role: "user" | "assistant";
  text: string;
};

export type ResponsesRequest = {
  instructions: string;
  input: AdvisorInputItem[];
  reasoningEffort?: "low" | "medium" | "high";
  /** Strict JSON schema for a structured answer. Omitted for chat. */
  jsonSchema?: { name: string; schema: unknown };
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type AdvisorStreamEvent =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "usage"; outputTokens: number | null };

function buildBody(request: ResponsesRequest & { model: string }) {
  const body: Record<string, unknown> = {
    model: request.model,
    instructions: request.instructions,
    input: request.input.map((item) => ({
      role: item.role,
      content: [
        {
          type: item.role === "assistant" ? "output_text" : "input_text",
          text: item.text,
        },
      ],
    })),
    stream: true,
    store: false,
  };
  if (request.reasoningEffort) {
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

/**
 * Streams one Responses call, yielding reasoning-summary and answer deltas as
 * they arrive. Never aborts on a timer — a reasoning run of a minute or two is
 * ordinary, and the caller's own signal is the only cancellation.
 */
export async function* streamAdvisor(
  request: ResponsesRequest & { model: string },
): AsyncGenerator<AdvisorStreamEvent> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new AdvisorGatewayError(
      "The advisor is not configured for this workspace — no AI key is available.",
      401,
      false,
    );
  }

  let response: Response;
  try {
    response = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify(buildBody(request)),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AdvisorGatewayError(
      "Could not reach the AI service. Check the connection and try again.",
      0,
      true,
    );
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw describe(response.status, body);
  }

  const reader = response.body.getReader();
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

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }

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
          throw new AdvisorGatewayError(
            detail?.error?.message ?? "The AI service could not complete the answer.",
            502,
            true,
          );
        } else if (type === "error") {
          throw new AdvisorGatewayError(
            String((event["message"] as string) ?? "The AI service returned an error."),
            502,
            true,
          );
        } else if (type === "response.completed") {
          const detail = event["response"] as { usage?: { output_tokens?: number } } | undefined;
          yield { type: "usage", outputTokens: detail?.usage?.output_tokens ?? null };
        }
      }
    }
  }
}

/** One-shot structured call: streams, accumulates, parses. */
export async function advisorJson<T>(request: ResponsesRequest & { model: string }): Promise<T> {
  let text = "";
  for await (const event of streamAdvisor(request)) {
    if (event.type === "text") text += event.delta;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AdvisorGatewayError(
      "The AI service returned an empty response, so nothing was written.",
      502,
      true,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new AdvisorGatewayError(
      "The AI service returned a response that could not be read.",
      502,
      true,
    );
  }
}
