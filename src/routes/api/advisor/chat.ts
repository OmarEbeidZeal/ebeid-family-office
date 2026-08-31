/**
 * The advisor conversation.
 *
 * Streams because the model reasons before it answers: the thinking summary
 * arrives first, then the reply, and both are persisted so the conversation
 * survives a reload. Context is rebuilt server-side on every message, so the
 * advisor is always arguing from today's balance sheet.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest, UnauthorizedError } from "@/lib/api-auth.server";
import { loadAdvisorContext, NoHouseholdError } from "@/lib/advisor/context.server";
import { advisorSystemPrompt } from "@/lib/advisor/prompt";
import { AiGatewayError } from "@/lib/ai/errors";
import { streamAdvisor, type AdvisorInputItem } from "@/lib/ai/gateway.server";
import { ADVISORY_MODEL } from "@/lib/ai/models";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

/** Enough conversation to stay coherent without resending an essay every turn. */
const HISTORY_LIMIT = 24;

type Event =
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "done"; messageId: string | null; model: string }
  | { type: "error"; message: string };

function line(event: Event) {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

async function handlePost({ request }: { request: Request }) {
  let auth;
  try {
    auth = await authenticateRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Not signed in.";
    return new Response(JSON.stringify({ error: message }), {
      status: error instanceof UnauthorizedError ? 401 : 500,
      headers: { "content-type": "application/json" },
    });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Message was empty or too long." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { supabase, userId } = auth;

  let loaded;
  try {
    loaded = await loadAdvisorContext(supabase, userId);
  } catch (error) {
    const message =
      error instanceof NoHouseholdError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not read the household's position.";
    return new Response(JSON.stringify({ error: message }), {
      status: error instanceof NoHouseholdError ? 400 : 500,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: history } = await supabase
    .from("advisor_chat")
    .select("role, content, created_at")
    .eq("household_id", loaded.householdId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const priorTurns: AdvisorInputItem[] = (history ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      text: row.content,
    }));

  // The question is persisted before the answer exists: a failed generation
  // must not lose what they asked.
  await supabase.from("advisor_chat").insert({
    household_id: loaded.householdId,
    profile_id: loaded.profileId,
    role: "user",
    content: parsed.message,
  });

  const instructions = advisorSystemPrompt({
    contextJson: JSON.stringify(loaded.context),
    householdName: loaded.householdName,
    today: new Date().toISOString().slice(0, 10),
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let reasoning = "";

      try {
        for await (const event of streamAdvisor({
          instructions,
          input: [...priorTurns, { role: "user", text: parsed.message }],
          maxOutputTokens: 12000,
          ...(request.signal ? { signal: request.signal } : {}),
        })) {
          if (event.type === "reasoning") {
            reasoning += event.delta;
            controller.enqueue(line({ type: "reasoning", delta: event.delta }));
          } else if (event.type === "text") {
            answer += event.delta;
            controller.enqueue(line({ type: "text", delta: event.delta }));
          }
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        if (!aborted) {
          const message =
            error instanceof AiGatewayError
              ? error.message
              : error instanceof Error
                ? error.message
                : "The advisor could not answer.";
          controller.enqueue(line({ type: "error", message }));
        }
      }

      // Partial answers are kept: a stopped reply is still part of the record.
      let messageId: string | null = null;
      if (answer.trim()) {
        const { data } = await supabase
          .from("advisor_chat")
          .insert({
            household_id: loaded.householdId,
            profile_id: loaded.profileId,
            role: "assistant",
            content: answer,
            reasoning: reasoning.trim() || null,
            model: ADVISORY_MODEL,
            context_snapshot: JSON.parse(JSON.stringify(loaded.context)),
          })
          .select("id")
          .maybeSingle();
        messageId = data?.id ?? null;
      }

      controller.enqueue(line({ type: "done", messageId, model: ADVISORY_MODEL }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

export const Route = createFileRoute("/api/advisor/chat")({
  server: { handlers: { POST: handlePost } },
});
