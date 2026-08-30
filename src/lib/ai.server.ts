/**
 * Thin wrapper around the Lovable AI gateway.
 *
 * Every call asks for a strict JSON schema so the parser never has to guess at
 * prose. Model choice is deliberate: the cheap model does column mapping and
 * categorisation (high volume, low ambiguity), the stronger one turns PDF text
 * into structured rows.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const AI_MODELS = {
  /** Column mapping, categorisation — cheap, fast, high volume. */
  cheap: "google/gemini-3.1-flash-lite",
  /** PDF text → structured transactions. Harder task, worth the tokens. */
  strong: "google/gemini-3.7-flash",
} as const;

export class AiUnavailableError extends Error {}

type JsonSchema = Record<string, unknown>;

type ChatChoice = {
  message?: { content?: string | null };
  finish_reason?: string;
};

function friendlyError(status: number, body: string) {
  if (status === 429) {
    return new AiUnavailableError(
      "The AI service is rate limited right now. Wait a minute and retry the import — nothing was lost.",
    );
  }
  if (status === 402) {
    return new AiUnavailableError(
      "The workspace AI credits are exhausted, so the statement could not be read. Top up credits and retry.",
    );
  }
  return new AiUnavailableError(
    `The AI service returned ${status} while reading the statement. ${body.slice(0, 200)}`,
  );
}

/** One JSON-schema-constrained completion. Throws AiUnavailableError on gateway failure. */
export async function aiJson<T>(options: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  maxTokens?: number;
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new AiUnavailableError(
      "AI is not configured for this workspace, so statements cannot be read automatically.",
    );
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));

    let response: Response;
    try {
      response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: "system", content: options.system },
            { role: "user", content: options.user },
          ],
          max_tokens: options.maxTokens ?? 8000,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: options.schemaName,
              strict: true,
              schema: options.schema,
            },
          },
        }),
      });
    } catch (error) {
      lastError = error;
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = friendlyError(response.status, body);
      // 429 and 5xx are worth another go; everything else is terminal.
      if (response.status === 429 || response.status >= 500) {
        lastError = error;
        continue;
      }
      throw error;
    }

    const payload = (await response.json()) as { choices?: ChatChoice[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      lastError = new AiUnavailableError("The AI service returned an empty response.");
      continue;
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      lastError = new AiUnavailableError("The AI service returned a response that wasn't valid.");
    }
  }

  throw lastError instanceof AiUnavailableError
    ? lastError
    : new AiUnavailableError(
        "The AI service could not be reached while reading the statement. Retry the import.",
      );
}
