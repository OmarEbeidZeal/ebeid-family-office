/**
 * Which model does which job.
 *
 * One gateway — Lovable AI — and three named jobs. Every AI call in the app
 * resolves its model here, so changing what reads a statement, what files a
 * transaction or what the advisor thinks with is a one-line edit in this file
 * and nowhere else.
 *
 * Client-safe: names and labels only, no keys and no network.
 */

export type AiJob = "extraction" | "categorisation" | "advisory";

/**
 * Statement text into structured transactions. The step where a quiet mistake
 * corrupts every figure downstream, so it runs on a strong reasoning model.
 */
export const EXTRACTION_MODEL = "openai/gpt-5.6-sol";

/**
 * Bulk transaction categorisation. Three years of statements across several
 * banks is tens of thousands of single-label calls, each one click to correct,
 * so this runs on the cheapest capable model the gateway's Responses endpoint
 * serves rather than on the reasoning model.
 */
export const CATEGORISATION_MODEL = "openai/gpt-5.4-nano";

/**
 * The advisor and the weekly briefing. It has to hold the twelve policy rules
 * in mind and refuse things the household wants, so it runs on the strongest
 * reasoning model available through the gateway.
 */
export const ADVISORY_MODEL = "openai/gpt-5.6-sol";

export const AI_MODELS: Record<AiJob, string> = {
  extraction: EXTRACTION_MODEL,
  categorisation: CATEGORISATION_MODEL,
  advisory: ADVISORY_MODEL,
};

export type ReasoningEffort = "low" | "medium" | "high";

/**
 * How hard each job thinks before answering. Reasoning tokens come out of the
 * same output budget as the answer, so the two structured-output jobs stay low
 * and leave room for long results; the advisor is given room to reason.
 */
export const AI_REASONING: Record<AiJob, ReasoningEffort> = {
  extraction: "low",
  categorisation: "low",
  advisory: "medium",
};

export const AI_JOB_LABELS: Record<AiJob, string> = {
  extraction: "Statement extraction",
  categorisation: "Categorisation",
  advisory: "Advisor",
};

export function modelFor(job: AiJob): string {
  return AI_MODELS[job];
}
