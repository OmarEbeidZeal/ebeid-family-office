/**
 * What kind of document is this?
 *
 * Nobody is asked up front. A structured banking format answers the question
 * outright; everything else is scored against the vocabulary each kind of
 * document actually uses, and only a genuinely ambiguous file costs a model
 * call. When even that is unsure, the household is asked — which is far better
 * than filing a payslip as an insurance policy and quietly getting the
 * £100,000 tracker wrong.
 */
import { completeJson } from "../ai/gateway.server";
import { DETERMINISTIC_FORMATS, type SourceFormat } from "../import/formats";
import type { DocType } from "./types";

export type ClassificationMethod = "format" | "keywords" | "model" | "hint" | "unknown";

export type DocClassification = {
  type: DocType | null;
  confidence: number;
  reason: string;
  method: ClassificationMethod;
};

/** Below this the household is asked to confirm rather than guessed at. */
export const CONFIRM_BELOW = 0.62;

type Signal = { pattern: RegExp; weight: number };

const SIGNALS: Record<DocType, Signal[]> = {
  bank_statement: [
    { pattern: /\bsort code\b/i, weight: 3 },
    { pattern: /\bstatement of account\b|\baccount statement\b/i, weight: 3 },
    { pattern: /\bopening balance\b/i, weight: 2.5 },
    { pattern: /\bclosing balance\b|\bbalance carried forward\b/i, weight: 2.5 },
    { pattern: /\bbalance brought forward\b/i, weight: 2 },
    { pattern: /\bmoney in\b|\bmoney out\b|\bpaid in\b|\bwithdrawn\b/i, weight: 2 },
    { pattern: /\bavailable balance\b/i, weight: 1.5 },
    { pattern: /\bstatement period\b|\bstatement date\b/i, weight: 1.5 },
    { pattern: /\bdirect debit\b|\bstanding order\b|\bfaster payment\b/i, weight: 1.5 },
    { pattern: /\bBIC\b|\bSWIFT\b/i, weight: 1 },
  ],
  payslip: [
    { pattern: /\bpay ?slip\b/i, weight: 4 },
    { pattern: /\bpayment advice\b|\bpay advice\b|\bremittance advice\b/i, weight: 3 },
    { pattern: /\bgross pay\b/i, weight: 3 },
    { pattern: /\bnet pay\b|\btake home pay\b/i, weight: 3 },
    { pattern: /\btaxable pay\b/i, weight: 2.5 },
    { pattern: /\btax code\b/i, weight: 3 },
    { pattern: /\bPAYE\b/i, weight: 2 },
    { pattern: /\byear to date\b|\bY\.?T\.?D\.?\b|\bthis employment\b/i, weight: 2 },
    { pattern: /\bpayroll (number|no|reference)\b|\bemployee (number|no)\b/i, weight: 2.5 },
    { pattern: /\bstudent loan\b/i, weight: 1.5 },
    { pattern: /\bsalary sacrifice\b/i, weight: 2 },
    { pattern: /\bemployer pension\b|\bemployee pension\b|\bpension contribution\b/i, weight: 1.5 },
    { pattern: /\bnational insurance\b|\bnot stored\b/i, weight: 1 },
  ],
  insurance_policy: [
    { pattern: /\bpolicy (schedule|summary|booklet|document)\b/i, weight: 4 },
    { pattern: /\bpolicy (number|no\.?)\b/i, weight: 3 },
    { pattern: /\bsum assured\b|\bsum insured\b/i, weight: 3.5 },
    { pattern: /\binsurer\b|\bunderwrit(ten|er)\b/i, weight: 2.5 },
    { pattern: /\blife (assurance|insurance|cover)\b/i, weight: 3 },
    { pattern: /\bincome protection\b/i, weight: 3.5 },
    { pattern: /\bcritical illness\b/i, weight: 3.5 },
    { pattern: /\b(buildings|contents|travel|home) insurance\b/i, weight: 3 },
    { pattern: /\bprivate medical\b|\bhealth (cover|insurance)\b/i, weight: 3 },
    { pattern: /\bdeferred period\b|\bbenefit period\b/i, weight: 3 },
    { pattern: /\bwritten in trust\b|\bin trust\b/i, weight: 2 },
    { pattern: /\bbeneficiar(y|ies)\b/i, weight: 2 },
    { pattern: /\brenewal (date|notice|premium)\b/i, weight: 2.5 },
    { pattern: /\bannual premium\b|\bmonthly premium\b|\bpremium payable\b/i, weight: 2.5 },
    { pattern: /\bexclusions?\b/i, weight: 1.5 },
    { pattern: /\bexcess\b/i, weight: 1 },
  ],
  tenancy: [
    { pattern: /\btenancy agreement\b/i, weight: 4.5 },
    { pattern: /\bassured shorthold\b/i, weight: 4.5 },
    { pattern: /\blandlord\b/i, weight: 2.5 },
    { pattern: /\btenant\b/i, weight: 2.5 },
    { pattern: /\bdeposit protection\b|\btenancy deposit scheme\b|\bmydeposits\b|\bDPS\b|\bTDS\b/i, weight: 3.5 },
    { pattern: /\bbreak clause\b/i, weight: 4 },
    { pattern: /\brent payable\b|\brent of\b|\bmonthly rent\b/i, weight: 3 },
    { pattern: /\brent review\b/i, weight: 2.5 },
    { pattern: /\bletting agent\b|\bmanaging agent\b/i, weight: 2.5 },
    { pattern: /\bthe premises\b|\bthe property\b/i, weight: 1.5 },
    { pattern: /\bnotice period\b|\bto quit\b|\bsection 21\b/i, weight: 2.5 },
    { pattern: /\bpermitted occupier\b/i, weight: 3 },
    { pattern: /\binventory\b|\bschedule of condition\b/i, weight: 2 },
    { pattern: /\bterm of the tenancy\b|\bfixed term\b/i, weight: 2 },
  ],
  other: [],
};

const NAME_HINTS: Array<{ pattern: RegExp; type: DocType; weight: number }> = [
  { pattern: /pay-?slip|payadvice|pay-?advice|payroll/i, type: "payslip", weight: 3 },
  { pattern: /tenanc|\bast\b|lease|letting/i, type: "tenancy", weight: 3 },
  { pattern: /polic|insur|cover-?note|renewal/i, type: "insurance_policy", weight: 3 },
  { pattern: /statement|camt|mt940|transactions?/i, type: "bank_statement", weight: 2 },
];

type Score = { type: DocType; score: number; hits: string[] };

function scoreText(text: string, fileName: string | null): Score[] {
  const sample = text.slice(0, 40_000);

  const scores = (Object.keys(SIGNALS) as DocType[])
    .filter((type) => type !== "other")
    .map((type) => {
      const hits: string[] = [];
      let score = 0;
      for (const signal of SIGNALS[type]) {
        if (signal.pattern.test(sample)) {
          score += signal.weight;
          hits.push(signal.pattern.source.replace(/\\b|\(|\)|\?:|\|/g, " ").trim().slice(0, 40));
        }
      }
      return { type, score, hits };
    });

  if (fileName) {
    for (const hint of NAME_HINTS) {
      if (!hint.pattern.test(fileName)) continue;
      const row = scores.find((entry) => entry.type === hint.type);
      if (row) {
        row.score += hint.weight;
        row.hits.push("the file name");
      }
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}

/** Score margin turned into something that reads as a confidence. */
function confidenceFrom(top: number, second: number): number {
  if (top <= 0) return 0;
  const strength = Math.min(top / 11, 1);
  const margin = Math.min((top - second) / Math.max(top, 1), 1);
  return Math.round(Math.min(0.35 + strength * 0.4 + margin * 0.3, 0.97) * 100) / 100;
}

const MODEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["doc_type", "confidence", "reason"],
  properties: {
    doc_type: {
      type: "string",
      enum: ["bank_statement", "insurance_policy", "tenancy", "payslip", "other"],
    },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
} as const;

const MODEL_SYSTEM = `You identify what kind of financial document a piece of text came from.

Answer with exactly one of:
- bank_statement — a list of transactions with balances for an account
- insurance_policy — a policy schedule, cover summary or renewal notice
- tenancy — a tenancy or lease agreement, either side of the deal
- payslip — a payslip, pay advice or payroll statement
- other — anything else, including letters, invoices and tax returns

Judge from the vocabulary and structure of the text, not from a single word.
Give a confidence between 0 and 1 that reflects how sure you actually are: a
document that could plausibly be two of these should score below 0.6. Explain
your answer in one short sentence.

The text may contain "[not stored]" where a National Insurance number was
removed before you saw it. That is expected; ignore it.`;

async function classifyWithModel(text: string, fileName: string | null): Promise<DocClassification> {
  const result = await completeJson<{ doc_type: DocType; confidence: number; reason: string }>(
    "categorisation",
    {
      system: MODEL_SYSTEM,
      user: `File name: ${fileName ?? "unknown"}\n\n---\n${text.slice(0, 12_000)}`,
      schemaName: "document_type",
      schema: MODEL_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 2_000,
    },
  );

  const confidence = Number.isFinite(result.confidence)
    ? Math.max(0, Math.min(1, result.confidence))
    : 0.5;

  return {
    type: result.doc_type,
    confidence,
    reason: result.reason?.slice(0, 300) || "Identified from the text.",
    method: "model",
  };
}

export type ClassifyInput = {
  format: SourceFormat;
  text: string;
  fileName: string | null;
  /** What the uploader said it was. Breaks ties; never overrides the content. */
  hint?: DocType | null;
};

export async function classifyDocument(input: ClassifyInput): Promise<DocClassification> {
  // A file that states its own structure has already answered the question.
  if (DETERMINISTIC_FORMATS.has(input.format)) {
    return {
      type: "bank_statement",
      confidence: 1,
      reason: "The file is a structured banking export, so it can only be a statement.",
      method: "format",
    };
  }

  const scores = scoreText(input.text, input.fileName);
  const top = scores[0];
  const second = scores[1];

  if (top && top.score >= 6) {
    const confidence = confidenceFrom(top.score, second?.score ?? 0);
    if (confidence >= CONFIRM_BELOW) {
      return {
        type: top.type,
        confidence,
        reason: `The wording matches ${top.hits.length} thing${top.hits.length === 1 ? "" : "s"} only this kind of document says.`,
        method: "keywords",
      };
    }
  }

  // Ambiguous. One cheap model call, then the household if it is still unsure.
  try {
    const model = await classifyWithModel(input.text, input.fileName);
    if (input.hint && model.type === input.hint) {
      return { ...model, confidence: Math.max(model.confidence, 0.8) };
    }
    return model;
  } catch {
    if (top && top.score > 0) {
      return {
        type: top.type,
        confidence: Math.min(confidenceFrom(top.score, second?.score ?? 0), CONFIRM_BELOW - 0.01),
        reason: "Read from the wording alone — worth confirming.",
        method: "keywords",
      };
    }
    return {
      type: input.hint ?? null,
      confidence: 0,
      reason: "Nothing in the file says what kind of document it is.",
      method: "unknown",
    };
  }
}
