/**
 * The standing briefing.
 *
 * Two halves, deliberately separated: deterministic detection decides what is
 * true, the model only decides what is worth saying and how to say it. Notes
 * are fingerprinted so the same situation is not written up week after week.
 *
 * Two entry points, one body: a person pressing "generate" on `/advisor`, and
 * the Sunday-morning scheduler running for a household nobody is signed in to.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  loadAdvisorContext,
  loadAdvisorContextForHousehold,
  NoHouseholdError,
  type AdvisorContextResult,
} from "@/lib/advisor/context.server";
import { detectSignals, formatSignals, rankSignals } from "@/lib/advisor/signals";
import { BRIEFING_SCHEMA, briefingSystemPrompt, type BriefingPayload } from "@/lib/advisor/prompt";
import { AiGatewayError } from "@/lib/ai/errors";
import { completeJson } from "@/lib/ai/gateway.server";
import type { BriefingResult } from "@/lib/advisor.functions";

/** A situation already written up inside this window is not written up again. */
const DEDUPE_DAYS = 21;

const KINDS = new Set(["briefing", "recommendation", "alert", "risk"]);
const SEVERITIES = new Set(["info", "action", "urgent"]);

type Client = SupabaseClient<Database>;

/** On-demand: the signed-in person's own household. */
export async function runBriefing(client: Client, userId: string): Promise<BriefingResult> {
  const generatedAt = new Date().toISOString();

  let loaded: AdvisorContextResult;
  try {
    loaded = await loadAdvisorContext(client, userId);
  } catch (error) {
    if (error instanceof NoHouseholdError) {
      return {
        status: "unavailable",
        created: 0,
        skipped: 0,
        message: error.message,
        generatedAt,
      };
    }
    throw error;
  }

  return writeBriefing(client, loaded, generatedAt);
}

/** Scheduled: a named household, with nobody signed in. */
export async function runBriefingForHousehold(
  client: Client,
  householdId: string,
  generatedAt = new Date().toISOString(),
): Promise<BriefingResult> {
  const loaded = await loadAdvisorContextForHousehold(client, householdId);
  return writeBriefing(client, loaded, generatedAt);
}

async function writeBriefing(
  client: Client,
  loaded: AdvisorContextResult,
  generatedAt: string,
): Promise<BriefingResult> {
  const signals = rankSignals(
    detectSignals({ context: loaded.context, findings: loaded.findings, base: loaded.base }),
  );

  if (!signals.length) {
    return {
      status: "nothing_material",
      created: 0,
      skipped: 0,
      message:
        "Nothing material changed: no policy limit is under pressure, no allowance deadline is close, and no goal is off pace.",
      generatedAt,
    };
  }

  // Anything already said recently — or still sitting unread at any age — is
  // dropped before the model is asked.
  const since = new Date(Date.now() - DEDUPE_DAYS * 86_400_000).toISOString();
  const [{ data: recent }, { data: open }] = await Promise.all([
    client
      .from("advisor_notes")
      .select("fingerprint")
      .eq("household_id", loaded.householdId)
      .gte("generated_at", since),
    client
      .from("advisor_notes")
      .select("fingerprint")
      .eq("household_id", loaded.householdId)
      .eq("is_read", false),
  ]);

  const seen = new Set(
    [...(recent ?? []), ...(open ?? [])]
      .map((row) => row.fingerprint)
      .filter((value): value is string => !!value),
  );
  const fresh = signals.filter((signal) => !seen.has(signal.fingerprint));
  const skipped = signals.length - fresh.length;

  if (!fresh.length) {
    return {
      status: "nothing_material",
      created: 0,
      skipped,
      message: `Nothing new to report — the ${skipped} open finding${
        skipped === 1 ? " is" : "s are"
      } already in your notes.`,
      generatedAt,
    };
  }

  let payload: BriefingPayload;
  try {
    payload = await completeJson<BriefingPayload>("advisory", {
      system: briefingSystemPrompt({
        contextJson: JSON.stringify(loaded.context),
        householdName: loaded.householdName,
        today: generatedAt.slice(0, 10),
        signals: formatSignals(fresh),
      }),
      user: "Write this week's briefing from the detected signals. Return json matching the schema.",
      schemaName: "briefing",
      schema: BRIEFING_SCHEMA as Record<string, unknown>,
      maxTokens: 12000,
    });
  } catch (error) {
    if (error instanceof AiGatewayError) {
      return {
        status: "unavailable",
        created: 0,
        skipped,
        message: error.message,
        generatedAt,
      };
    }
    throw error;
  }

  const bySignal = new Map(fresh.map((signal) => [signal.id, signal]));
  const rows: Database["public"]["Tables"]["advisor_notes"]["Insert"][] = [];

  for (const note of payload.notes ?? []) {
    const signal = bySignal.get(note.signal_id);
    // A note without a detected signal behind it is a hallucination; drop it.
    if (!signal) continue;
    if (rows.some((row) => row.fingerprint === signal.fingerprint)) continue;
    const title = note.title?.trim();
    const body = note.body?.trim();
    if (!title || !body) continue;

    rows.push({
      household_id: loaded.householdId,
      kind: KINDS.has(note.kind) ? note.kind : signal.kind,
      severity: SEVERITIES.has(note.severity) ? note.severity : signal.severity,
      title: title.slice(0, 200),
      body,
      fingerprint: signal.fingerprint,
      generated_at: generatedAt,
      ...(signal.relatedGoalId ? { related_goal_id: signal.relatedGoalId } : {}),
      ...(signal.relatedTicker ? { related_ticker: signal.relatedTicker } : {}),
    });
  }

  if (!rows.length) {
    return {
      status: "nothing_material",
      created: 0,
      skipped: signals.length,
      message:
        "The advisor read the position and found nothing worth writing up beyond what you already know.",
      generatedAt,
    };
  }

  const { error } = await client.from("advisor_notes").insert(rows);
  if (error) throw new Error(`The briefing could not be saved: ${error.message}`);

  return {
    status: "written",
    created: rows.length,
    skipped,
    message: `${rows.length} new note${rows.length === 1 ? "" : "s"} from this briefing.`,
    generatedAt,
  };
}
