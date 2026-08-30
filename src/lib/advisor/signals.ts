/**
 * Deterministic briefing signals.
 *
 * The model never goes looking for something to say. This file decides what is
 * materially true about the household's position right now; the model only
 * turns those facts into readable notes. A signal that isn't here cannot
 * become a note, which is what keeps briefings honest.
 */
import { POLICY_LIMITS, type PolicyFinding } from "@/lib/policy";
import type { HouseholdContext } from "@/lib/household-context";

export type Signal = {
  /** Stable within one briefing run; the model echoes it back. */
  id: string;
  kind: "briefing" | "recommendation" | "alert" | "risk";
  severity: "info" | "action" | "urgent";
  /** The fact, with its numbers, in one or two lines. */
  summary: string;
  /** Identity across runs — the same situation must not be written up twice. */
  fingerprint: string;
  relatedGoalId?: string;
  relatedTicker?: string;
};

const money = (value: number | null | undefined, base = "GBP") =>
  value === null || value === undefined
    ? "unknown"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: base,
        maximumFractionDigits: 0,
      }).format(value);

/** Buckets keep a fingerprint stable while the number wobbles slightly. */
const bucket = (value: number | null | undefined, size: number) =>
  value === null || value === undefined ? "na" : String(Math.round(value / size) * size);

function fromPolicy(findings: PolicyFinding[]): Signal[] {
  return findings
    .filter((finding) => finding.status === "breach" || finding.status === "watch")
    .map((finding) => ({
      id: `policy-${finding.id}`,
      kind: finding.rule === 10 || finding.rule === 3 || finding.rule === 7 ? "risk" : "alert",
      severity: finding.status === "breach" ? ("urgent" as const) : ("action" as const),
      summary: `Policy rule ${finding.rule} (${finding.label}) is ${
        finding.status === "breach" ? "breached" : "close to its limit"
      }: ${finding.headline}`,
      fingerprint: `policy:${finding.id}:${finding.status}:${bucket(
        finding.value,
        finding.unit === "pct" ? 2 : finding.unit === "months" ? 1 : 5000,
      )}`,
    })) as Signal[];
}

function fromGoals(context: HouseholdContext, base: string): Signal[] {
  const signals: Signal[] = [];
  const surplus = context.cashflow.monthly_surplus;

  for (const goal of context.goals) {
    if (goal.status !== "active") continue;

    if (!goal.target_base) {
      signals.push({
        id: `goal-unpriced-${goal.id}`,
        kind: "briefing",
        severity: "info",
        summary: `Goal "${goal.title}" has no target amount, so it cannot be funded or tested against the plan.`,
        fingerprint: `goal:${goal.id}:unpriced`,
        relatedGoalId: goal.id,
      });
      continue;
    }

    const required = goal.monthly_required;
    if (goal.months_away !== null && goal.months_away < 0 && (goal.shortfall_base ?? 0) > 0) {
      signals.push({
        id: `goal-overdue-${goal.id}`,
        kind: "alert",
        severity: "action",
        summary: `Goal "${goal.title}" passed its target date of ${goal.target_date} still ${money(
          goal.shortfall_base,
          base,
        )} short (${goal.funded_pct ?? 0}% funded). It needs a new date or a smaller target.`,
        fingerprint: `goal:${goal.id}:overdue`,
        relatedGoalId: goal.id,
      });
      continue;
    }

    if (required && surplus !== null && surplus > 0 && required > surplus * 0.6) {
      signals.push({
        id: `goal-pace-${goal.id}`,
        kind: "recommendation",
        severity: required > surplus ? "urgent" : "action",
        summary: `Goal "${goal.title}" needs ${money(required, base)} a month to reach ${money(
          goal.target_base,
          base,
        )} by ${goal.target_date}, against a monthly surplus of ${money(surplus, base)}. It is ${
          goal.funded_pct ?? 0
        }% funded and ${goal.priority} priority.`,
        fingerprint: `goal:${goal.id}:pace:${bucket(required, 250)}`,
        relatedGoalId: goal.id,
      });
    }
  }

  return signals;
}

function fromAllowances(context: HouseholdContext, base: string): Signal[] {
  const days = context.allowances.days_to_5_april;
  if (days > 120) return [];
  const signals: Signal[] = [];

  for (const person of context.allowances.per_person) {
    if (!person.recorded) {
      signals.push({
        id: `allowance-unknown-${person.person}`,
        kind: "briefing",
        severity: "info",
        summary: `Nothing is recorded against ${person.person}'s ${context.allowances.tax_year} ISA or pension allowances, and the year ends in ${days} days. Until it is recorded the app cannot tell what is left.`,
        fingerprint: `allowance:${context.allowances.tax_year}:${person.person}:unrecorded`,
      });
      continue;
    }
    if (person.isa_remaining && person.isa_remaining > 1000) {
      signals.push({
        id: `allowance-isa-${person.person}`,
        kind: "recommendation",
        severity: days <= 45 ? "urgent" : "action",
        summary: `${person.person} has ${money(person.isa_remaining, base)} of the ${money(
          context.allowances.isa_allowance,
          base,
        )} ISA allowance unused with ${days} days of the ${context.allowances.tax_year} tax year left. Unused allowance is lost on 6 April.`,
        fingerprint: `allowance:${context.allowances.tax_year}:${person.person}:isa:${bucket(
          person.isa_remaining,
          2500,
        )}`,
      });
    }
    if (!person.employer_match_secured) {
      signals.push({
        id: `allowance-match-${person.person}`,
        kind: "recommendation",
        severity: "action",
        summary: `${person.person}'s employer pension match is not recorded as secured. Policy rule 5 puts the match first in the capital ladder — it is the only guaranteed return available.`,
        fingerprint: `allowance:${context.allowances.tax_year}:${person.person}:match`,
      });
    }
  }

  return signals;
}

function fromLiquidity(context: HouseholdContext, base: string): Signal[] {
  const { gbp_cash, essential_monthly, months_covered, target_months } = context.liquidity;
  if (!essential_monthly || !months_covered || !gbp_cash) return [];

  // Rule 4 already covers a short reserve. This is the opposite problem.
  if (months_covered > target_months * 1.5 && gbp_cash > 0) {
    const excess = gbp_cash - target_months * essential_monthly;
    return [
      {
        id: "cash-drag",
        kind: "recommendation",
        severity: "action",
        summary: `GBP cash covers ${months_covered} months of essential spending against a ${target_months}-month target — ${money(
          excess,
          base,
        )} above the reserve is sitting in cash rather than being deployed down the capital ladder.`,
        fingerprint: `cash:excess:${bucket(excess, 10_000)}`,
      },
    ];
  }
  return [];
}

function fromSpending(context: HouseholdContext, base: string): Signal[] {
  if (context.cashflow.months_of_statement_data < 2) return [];
  return context.cashflow.movers
    .filter((mover) => (mover.change_pct ?? 0) >= 30 && (mover.this_month ?? 0) >= 300)
    .slice(0, 3)
    .map((mover) => ({
      id: `spend-${mover.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      kind: "briefing" as const,
      severity: "info" as const,
      summary: `${mover.name} spending is ${money(mover.this_month, base)} this month against ${money(
        mover.last_month,
        base,
      )} last month, up ${mover.change_pct}%.`,
      fingerprint: `spend:${mover.name}:${bucket(mover.this_month, 250)}`,
    }));
}

function fromHoldings(context: HouseholdContext, base: string): Signal[] {
  const signals: Signal[] = [];

  for (const holding of context.holdings) {
    if (holding.priced && holding.unrealised_pct !== null && holding.unrealised_pct <= -25) {
      signals.push({
        id: `holding-drawdown-${holding.ticker}`,
        kind: "risk",
        severity: "action",
        summary: `${holding.ticker} is ${Math.abs(holding.unrealised_pct)}% below average cost (${money(
          holding.value_base,
          base,
        )} against ${money(holding.cost_base, base)}).${
          holding.falsification
            ? ` The written falsification is: "${holding.falsification}".`
            : " No falsification condition is written for it."
        }`,
        fingerprint: `holding:${holding.ticker}:drawdown:${bucket(holding.unrealised_pct, 10)}`,
        relatedTicker: holding.ticker,
      });
    }
  }

  const unpriced = context.investable.unpriced_holdings;
  if (unpriced > 0) {
    signals.push({
      id: "holdings-unpriced",
      kind: "briefing",
      severity: "info",
      summary: `${unpriced} holding${unpriced === 1 ? " has" : "s have"} no live price, so ${
        unpriced === 1 ? "it is" : "they are"
      } excluded from every portfolio total and policy percentage. ${context.market_data.note}`,
      fingerprint: `market:unpriced:${unpriced}`,
    });
  }

  return signals;
}

function fromWatchlist(context: HouseholdContext): Signal[] {
  return context.watchlist
    .filter((item) => item.crossed_target === true)
    .map((item) => ({
      id: `watch-${item.ticker}`,
      kind: "alert" as const,
      severity: "action" as const,
      summary: `${item.ticker} has reached the written target of ${item.target_price} (last ${item.price}, as of ${item.price_as_of}). Conviction was recorded as ${item.conviction ?? "unset"}. Thesis: "${item.thesis}".`,
      fingerprint: `watch:${item.ticker}:target`,
      relatedTicker: item.ticker,
    }));
}

function fromStaleRecords(context: HouseholdContext): Signal[] {
  const signals: Signal[] = [];
  const assets = context.stale_records.assets_past_valuation_cadence;
  const accounts = context.stale_records.accounts_over_60_days;

  if (assets.length) {
    signals.push({
      id: "stale-assets",
      kind: "briefing",
      severity: "info",
      summary: `${assets.length} asset valuation${assets.length === 1 ? " is" : "s are"} past its review cadence (90 days, or 180 for a private shareholding that only reprices at a round or 409A): ${assets
        .slice(0, 4)
        .map(
          (asset) =>
            `${asset.name} — ${asset.asset_class}, last valued ${asset.last_valued_at ?? "never"}${
              asset.days_since_valued === null
                ? ""
                : ` (${asset.days_since_valued} days, cadence ${asset.threshold_days})`
            }`,
        )
        .join("; ")}. Net worth and every percentage limit rest on these figures.`,
      // Keyed on which assets are stale, so a newly stale one is a new note
      // while the same set stays quiet.
      fingerprint: `stale:assets:${assets
        .map((asset) => asset.name)
        .sort()
        .join("|")}`,
    });
  }

  if (accounts.length >= 2) {
    signals.push({
      id: "stale-accounts",
      kind: "briefing",
      severity: "info",
      summary: `${accounts.length} account balances have not been updated in over 60 days: ${accounts
        .slice(0, 5)
        .map((account) => account.name)
        .join(", ")}.`,
      fingerprint: `stale:accounts:${accounts.length}`,
    });
  }

  return signals;
}

function fromCurrency(context: HouseholdContext): Signal[] {
  const soft = context.soft_currency_pct;
  if (soft === null || soft < POLICY_LIMITS.softCurrencyCapPct * 0.6) return [];
  // A breach is already a policy signal; this is the approach warning below it.
  if (soft >= POLICY_LIMITS.softCurrencyCapPct) return [];
  return [
    {
      id: "soft-currency-drift",
      kind: "risk",
      severity: "info",
      summary: `Soft-currency (EGP, JOD) assets are ${soft}% of net worth against the ${POLICY_LIMITS.softCurrencyCapPct}% cap in policy rule 10.`,
      fingerprint: `currency:soft:${bucket(soft, 3)}`,
    },
  ];
}

export function detectSignals(input: {
  context: HouseholdContext;
  findings: PolicyFinding[];
  base: string;
}): Signal[] {
  const { context, findings, base } = input;
  return [
    ...fromPolicy(findings),
    ...fromGoals(context, base),
    ...fromAllowances(context, base),
    ...fromLiquidity(context, base),
    ...fromWatchlist(context),
    ...fromHoldings(context, base),
    ...fromSpending(context, base),
    ...fromCurrency(context),
    ...fromStaleRecords(context),
  ];
}

const SEVERITY_ORDER: Record<Signal["severity"], number> = { urgent: 0, action: 1, info: 2 };

export function rankSignals(signals: Signal[]) {
  return [...signals].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function formatSignals(signals: Signal[]) {
  return signals
    .map(
      (signal) =>
        `- id: ${signal.id} | suggested kind: ${signal.kind} | suggested severity: ${signal.severity}\n  ${signal.summary}`,
    )
    .join("\n");
}
