import type { HouseholdContext } from "@/lib/household-context";
import { formatMoney } from "@/lib/format";

/**
 * Prompts drawn from the household's actual position — never a generic list.
 * If nothing is stored yet, nothing is suggested: there is nothing to ask about.
 */
export function buildSuggestions(context: HouseholdContext, base: string): string[] {
  const suggestions: string[] = [];
  const money = (value: number) => formatMoney(value, base, { decimals: 0 });

  const breaches = context.policy.filter((finding) => finding.status === "breach");
  const watches = context.policy.filter((finding) => finding.status === "watch");
  /** Headlines can be long compound strings; a prompt reads better from the rule's label. */
  const rulePrompt = (finding: (typeof context.policy)[number], verb: string) =>
    `${verb} ${finding.label.toLowerCase()} — rule ${finding.rule}. Where do we actually stand, and what would you change?`;

  if (breaches.length) {
    suggestions.push(rulePrompt(breaches[0]!, "Walk me through the breach on"));
  }

  const liquidity = context.liquidity;
  if (liquidity.months_covered !== null && liquidity.months_covered < liquidity.target_months) {
    suggestions.push(
      `My GBP reserve covers ${liquidity.months_covered} months against a ${liquidity.target_months}-month target. How do I close that without stalling everything else?`,
    );
  }

  const allowances = context.allowances.per_person.filter(
    (person) => (person.isa_remaining ?? 0) > 0,
  );
  if (allowances.length && context.allowances.days_to_5_april <= 150) {
    suggestions.push(
      `There are ${context.allowances.days_to_5_april} days to 5 April and ${money(
        allowances.reduce((sum, person) => sum + (person.isa_remaining ?? 0), 0),
      )} of ISA allowance unused. What is the best use of it?`,
    );
  } else if (allowances.some((person) => !person.recorded)) {
    suggestions.push(
      `We have not recorded this year's ISA and pension contributions. What should I check before 5 April?`,
    );
  }

  const surplus = context.cashflow.monthly_surplus;
  if (surplus !== null && surplus > 0) {
    suggestions.push(`Where should this month's ${money(surplus)} surplus go, in what order?`);
  }

  const offPace = context.goals.find(
    (goal) => goal.monthly_required !== null && (goal.months_away ?? 0) > 0,
  );
  if (offPace) {
    suggestions.push(
      `Can we still fund "${offPace.title}" by ${offPace.target_date ?? "the target date"} on current savings?`,
    );
  }

  if ((context.soft_currency_pct ?? 0) > 10) {
    suggestions.push(
      `${context.soft_currency_pct}% of our assets sit in soft currencies. How much EGP and JOD exposure is defensible?`,
    );
  }

  const privateStake = context.net_worth.private_company_stake ?? 0;
  if (privateStake > 0) {
    suggestions.push(
      `The private stake is ${money(privateStake)} of net worth. How should that shape everything else we own?`,
    );
  }

  const speculative = context.holdings.filter((holding) => holding.speculative);
  if (speculative.length) {
    suggestions.push(
      `Size the satellite sleeve properly — is ${speculative
        .map((holding) => holding.ticker)
        .slice(0, 3)
        .join(", ")} within policy?`,
    );
  }

  if (watches.length && suggestions.length < 6) {
    suggestions.push(rulePrompt(watches[0]!, "We are drifting on"));
  }

  if (context.holdings.length && suggestions.length < 6) {
    suggestions.push(
      "Review the portfolio against the investment policy and tell me what to fix first.",
    );
  }

  return suggestions.slice(0, 6);
}

export function SuggestedPrompts({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="space-y-2">
      <p className="eyebrow text-muted-foreground">Ask about your actual position</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onPick(suggestion)}
            className="max-w-full rounded-full border border-border bg-surface-raised px-3.5 py-1.5 text-left text-xs text-foreground/85 transition-colors hover:border-gold-line hover:text-gold disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
