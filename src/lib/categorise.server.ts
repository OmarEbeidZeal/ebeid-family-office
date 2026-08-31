/**
 * Categorisation, transfer detection and recurring detection.
 *
 * Household rules run first and win outright — a rule the household wrote is
 * more authoritative than a model. Only what is left goes to the AI, in
 * batches, and every AI answer carries a confidence that drives the review
 * queue.
 */
import { completeJson } from "./ai/gateway.server";
import { normaliseDescription, similarity } from "./text";

export type CategoryRef = {
  id: string;
  name: string;
  category_group: string;
  is_essential: boolean;
};

export type CategoryRule = {
  id: string;
  match_pattern: string;
  match_type: string;
  category_id: string;
  is_active?: boolean;
};

export type CategorisableTransaction = {
  description: string;
  merchant: string | null;
  amount: number;
  direction: string;
  currency: string;
};

export type CategoryAssignment = {
  category_id: string | null;
  ai_confidence: number | null;
  /** A rule the household wrote needs no review. */
  is_reviewed: boolean;
  merchant: string | null;
};

/** Returns the rule that claims this description, or null. */
export function matchRule(description: string, rules: CategoryRule[]): CategoryRule | null {
  const haystack = normaliseDescription(description);
  if (!haystack) return null;
  for (const rule of rules) {
    if (rule.is_active === false) continue;
    const needle = normaliseDescription(rule.match_pattern);
    if (!needle) continue;
    if (rule.match_type === "exact" && haystack === needle) return rule;
    if (rule.match_type === "starts_with" && haystack.startsWith(needle)) return rule;
    if (rule.match_type === "contains" && haystack.includes(needle)) return rule;
  }
  return null;
}

const CATEGORISE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          category: { type: "string" },
          merchant: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["index", "category", "merchant", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const CATEGORISE_SYSTEM = `You file bank transactions for a London household with accounts in the UK, Egypt, Jordan and the US. Every statement is in English.

Rules:
- category must be one of the allowed names, copied exactly and on its own — the name only, never the group it belongs to and never a name you invent. If nothing fits, return "Other".
- merchant is a short, clean trading name taken from the description (for example "TESCO STORES 3428 LONDON" becomes "Tesco"). Return "" when the description names no merchant.
- confidence is 0 to 1. Use below 0.7 whenever the description is ambiguous, cryptic or a bare reference number — a flagged row is far better than a confidently wrong one.
- Money arriving is usually Salary, Dividends or Rent Received; a transfer between the household's own accounts should be "Savings Transfer".`;

const BATCH_SIZE = 40;

/**
 * Match what the model returned back to a real category. Exact name first, then
 * the same name with the group it was shown alongside ("Groceries (Essential)")
 * — a model that helpfully echoes the group should not cost the household a
 * filed transaction.
 */
function resolveCategoryId(answer: string, byName: Map<string, string>): string | null {
  const cleaned = (answer ?? "").trim().toLowerCase();
  if (!cleaned) return null;
  const direct = byName.get(cleaned);
  if (direct) return direct;
  const withoutGroup = cleaned.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return withoutGroup ? (byName.get(withoutGroup) ?? null) : null;
}

export async function categoriseBatch(
  transactions: CategorisableTransaction[],
  categories: CategoryRef[],
): Promise<Array<{ category_id: string | null; confidence: number; merchant: string | null }>> {
  const results: Array<{
    category_id: string | null;
    confidence: number;
    merchant: string | null;
  }> = transactions.map(() => ({ category_id: null, confidence: 0, merchant: null }));

  if (!transactions.length || !categories.length) return results;

  const byName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
  const allowed = categories.map((category) => ({
    name: category.name,
    group: category.category_group,
  }));

  for (let start = 0; start < transactions.length; start += BATCH_SIZE) {
    const batch = transactions.slice(start, start + BATCH_SIZE);
    const payload = batch.map((transaction, index) => ({
      index,
      description: transaction.description.slice(0, 140),
      direction: transaction.direction,
      amount: Number(transaction.amount.toFixed(2)),
      currency: transaction.currency,
    }));

    const response = await completeJson<{
      items: Array<{ index: number; category: string; merchant: string; confidence: number }>;
    }>("categorisation", {
      system: CATEGORISE_SYSTEM,
      user: `Allowed categories (return the "name" value exactly):\n${JSON.stringify(allowed)}\n\nTransactions:\n${JSON.stringify(payload)}`,
      schemaName: "categorisation",
      schema: CATEGORISE_SCHEMA,
      maxTokens: 8000,
    });

    for (const item of response.items ?? []) {
      const target = start + item.index;
      if (target < 0 || target >= results.length) continue;
      const categoryId = resolveCategoryId(item.category ?? "", byName);
      const confidence = Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : 0;
      results[target] = {
        category_id: categoryId,
        // A category the model invented is no answer at all.
        confidence: categoryId ? confidence : 0,
        merchant: (item.merchant ?? "").trim() || null,
      };
    }
  }

  return results;
}

/* ------------------------------------------------------------- transfers */

export type TransferCandidate = {
  id: string;
  account_id: string | null;
  booked_date: string;
  amount: number;
  amount_base: number | null;
  direction: string;
  is_transfer: boolean;
};

const THREE_DAYS = 3 * 86_400_000;

/**
 * A payment out of one household account matched by a payment into another,
 * within three days, is an internal move — not spending. Counting these would
 * inflate expenses every time money is swept into savings.
 */
export function detectTransfers(candidates: TransferCandidate[]): Set<string> {
  const matched = new Set<string>();
  const debits = candidates.filter((row) => row.direction === "debit");
  const credits = candidates.filter((row) => row.direction === "credit");
  const usedCredits = new Set<string>();

  for (const debit of debits) {
    const debitValue = Math.abs(Number(debit.amount_base ?? debit.amount));
    if (debitValue <= 0) continue;
    const debitTime = new Date(debit.booked_date).getTime();

    for (const credit of credits) {
      if (usedCredits.has(credit.id)) continue;
      if (!credit.account_id || !debit.account_id) continue;
      if (credit.account_id === debit.account_id) continue;

      const gap = Math.abs(new Date(credit.booked_date).getTime() - debitTime);
      if (gap > THREE_DAYS) continue;

      const creditValue = Math.abs(Number(credit.amount_base ?? credit.amount));
      if (creditValue <= 0) continue;
      const drift = Math.abs(creditValue - debitValue) / Math.max(creditValue, debitValue);
      // Cross-currency moves lose a little to the spread, so allow 1.5%.
      if (drift > 0.015) continue;

      usedCredits.add(credit.id);
      matched.add(debit.id);
      matched.add(credit.id);
      break;
    }
  }

  return matched;
}

/* ------------------------------------------------------------- recurring */

export type RecurringCandidate = {
  id: string;
  merchant: string | null;
  description: string;
  booked_date: string;
  amount: number;
  direction: string;
};

function recurringKey(row: RecurringCandidate): string {
  const base = row.merchant ?? row.description;
  return normaliseDescription(base).split(" ").slice(0, 3).join(" ");
}

/**
 * Three or more payments to the same place, roughly monthly and roughly the
 * same size. Quarterly and annual charges are picked up too.
 */
export function detectRecurring(rows: RecurringCandidate[]): Set<string> {
  const recurring = new Set<string>();
  const groups = new Map<string, RecurringCandidate[]>();

  for (const row of rows) {
    if (row.direction !== "debit") continue;
    const key = recurringKey(row);
    if (!key || key.length < 3) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.booked_date.localeCompare(b.booked_date));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      const days =
        (new Date(sorted[i]!.booked_date).getTime() -
          new Date(sorted[i - 1]!.booked_date).getTime()) /
        86_400_000;
      if (days > 0) gaps.push(days);
    }
    if (!gaps.length) continue;

    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)]!;
    const cadence =
      (median >= 6 && median <= 8) ||
      (median >= 25 && median <= 35) ||
      (median >= 84 && median <= 96) ||
      (median >= 350 && median <= 380);
    if (!cadence) continue;

    const amounts = sorted.map((row) => Math.abs(Number(row.amount)));
    const mean = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
    if (mean <= 0) continue;
    const spread = Math.max(...amounts) - Math.min(...amounts);
    if (spread / mean > 0.35) continue;

    // Guard against unrelated payees collapsing into one key.
    const reference = sorted[0]!.merchant ?? sorted[0]!.description;
    const coherent = sorted.every(
      (row) => similarity(reference, row.merchant ?? row.description) > 0.55,
    );
    if (!coherent) continue;

    for (const row of sorted) recurring.add(row.id);
  }

  return recurring;
}
