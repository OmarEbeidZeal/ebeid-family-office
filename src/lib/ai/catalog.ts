/**
 * What the household can choose from.
 *
 * Three jobs, three possible providers. Lovable AI is the default everywhere
 * because it needs no key of Omar's; Anthropic and OpenAI become selectable the
 * moment their key exists as a project secret. Client-safe: no secrets, no
 * network, no server imports — the Settings screen reads straight from here.
 */

export type AiJob = "extraction" | "categorisation" | "advisory";
export type AiProviderId = "lovable" | "anthropic" | "openai";

export const AI_JOBS: Array<{ id: AiJob; label: string; description: string }> = [
  {
    id: "extraction",
    label: "Statement extraction",
    description:
      "Reads a PDF or spreadsheet into dated rows, and reads the institution, holder and account number off the statement itself.",
  },
  {
    id: "categorisation",
    label: "Categorisation",
    description:
      "Files imported transactions against your own categories. High volume, so a fast model is usually the right call.",
  },
  {
    id: "advisory",
    label: "Advisor",
    description:
      "The conversational advisor and the standing briefing. A reasoning model, working from the household's real numbers.",
  },
];

export const AI_PROVIDERS: Array<{
  id: AiProviderId;
  label: string;
  secretName: string;
  description: string;
}> = [
  {
    id: "lovable",
    label: "Lovable AI",
    secretName: "LOVABLE_API_KEY",
    description: "Built in. Gemini and GPT models through the Lovable gateway, billed in credits.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    secretName: "ANTHROPIC_API_KEY",
    description: "Claude models, called directly on your own Anthropic key.",
  },
  {
    id: "openai",
    label: "OpenAI",
    secretName: "OPENAI_API_KEY",
    description: "GPT models, called directly on your own OpenAI key.",
  },
];

export const PROVIDER_LABELS: Record<AiProviderId, string> = {
  lovable: "Lovable AI",
  anthropic: "Anthropic",
  openai: "OpenAI",
};

export const FALLBACK_PROVIDER: AiProviderId = "lovable";

/**
 * Lovable AI ships with a model per job. Anthropic and OpenAI deliberately do
 * not: their model names change with every release, so guessing one here would
 * mean a confident call to a model that may not exist. The Settings screen
 * fetches the live list from the provider and the household picks from it.
 */
export const DEFAULT_MODELS: Record<AiProviderId, Record<AiJob, string>> = {
  lovable: {
    extraction: "google/gemini-3.7-flash",
    categorisation: "google/gemini-3.1-flash-lite",
    advisory: "openai/gpt-5.6-sol",
  },
  anthropic: { extraction: "", categorisation: "", advisory: "" },
  openai: { extraction: "", categorisation: "", advisory: "" },
};

/** Offered when a provider has no live model list to give (Lovable AI). */
export const LOVABLE_MODEL_CHOICES: Record<AiJob, string[]> = {
  extraction: [
    "google/gemini-3.7-flash",
    "google/gemini-3.5-flash",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.1-flash-lite",
  ],
  categorisation: [
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.7-flash",
    "google/gemini-2.5-flash-lite",
  ],
  advisory: ["openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5.5", "openai/gpt-5.4"],
};

/** What a good pick looks like, shown next to the list rather than assumed. */
export const MODEL_GUIDANCE: Record<AiJob, string> = {
  extraction: "Reading a scanned-looking PDF rewards a stronger model; spreadsheets barely care.",
  categorisation: "Thousands of rows go through here. A fast, cheap model is usually right.",
  advisory: "Pick the strongest reasoning model you are willing to pay for.",
};

export function defaultModel(provider: AiProviderId, job: AiJob): string {
  return DEFAULT_MODELS[provider][job];
}

export function jobLabel(job: AiJob): string {
  return AI_JOBS.find((entry) => entry.id === job)?.label ?? job;
}
