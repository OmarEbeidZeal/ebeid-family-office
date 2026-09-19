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

/**
 * Two people hold two ISA allowances. One heavily used while the other sits
 * untouched is worth a question — the second allowance expires on 5 April and
 * does not carry forward — but it is a question, not a finding of error.
 */
function fromIsaAsymmetry(context: HouseholdContext, base: string): Signal[] {
  const isa = context.allowances.isa_per_person;
  if (!isa?.asymmetry) return [];
  const days = context.allowances.days_to_5_april;
  return [
    {
      id: "isa-asymmetry",
      kind: "recommendation",
      severity: days <= 60 ? "urgent" : "action",
      summary: `${isa.asymmetry} Household ISA capacity is ${money(
        isa.household_capacity,
        base,
      )} across both people, of which ${money(isa.household_used, base)} is used and ${money(
        isa.household_remaining,
        base,
      )} remains with ${days} days of the year left. Raise it as a question about intent, not as a mistake.`,
      fingerprint: `isa:asymmetry:${context.allowances.tax_year}:${bucket(
        isa.household_remaining,
        2500,
      )}`,
    },
  ];
}

/**
 * Each person's own mandate. A drifted sleeve is a rebalancing question; a
 * holding that breaches a Shariah mandate is a compliance problem for the
 * person whose money it is, and belongs in the briefing every time.
 */
function fromMandates(context: HouseholdContext, base: string): Signal[] {
  const signals: Signal[] = [];
  const mandates = context.mandates;
  if (!mandates) return signals;

  for (const person of mandates.per_person) {
    if (!person.measurable) continue;

    if (person.mandate_type === "shariah" && person.shariah.non_compliant.length) {
      signals.push({
        id: `mandate-noncompliant-${person.person}`,
        kind: "alert",
        severity: "urgent",
        summary: `${person.person} invests under a Shariah mandate, and ${person.shariah.non_compliant.join(
          ", ",
        )} ${person.shariah.non_compliant.length === 1 ? "is" : "are"} recorded as non-compliant. Name the compliant equivalent and the size, not a bare instruction to sell.`,
        fingerprint: `mandate:${person.person}:noncompliant:${person.shariah.non_compliant
          .slice()
          .sort()
          .join("|")}`,
        ...(person.shariah.non_compliant[0]
          ? { relatedTicker: person.shariah.non_compliant[0] }
          : {}),
      });
    }

    if (person.mandate_type === "shariah" && person.shariah.unscreened.length) {
      signals.push({
        id: `mandate-unscreened-${person.person}`,
        kind: "briefing",
        severity: "info",
        summary: `${person.person} holds ${person.shariah.unscreened.length} position${
          person.shariah.unscreened.length === 1 ? "" : "s"
        } nobody has screened for Shariah compliance (${person.shariah.unscreened.join(
          ", ",
        )}). Unscreened means unknown — the household records its own determination; the app never guesses one.`,
        fingerprint: `mandate:${person.person}:unscreened:${person.shariah.unscreened
          .slice()
          .sort()
          .join("|")}`,
      });
    }

    const speculativeOver =
      person.speculative_actual_pct !== null &&
      person.speculative_actual_pct > person.speculative_cap_pct;
    if (speculativeOver) {
      signals.push({
        id: `mandate-speculative-${person.person}`,
        kind: "risk",
        severity: "urgent",
        summary: `${person.person}'s speculative sleeve is ${person.speculative_actual_pct}% of ${money(
          person.investable_base,
          base,
        )} investable against their own ${person.speculative_cap_pct}% cap. This is their mandate, not the household average.`,
        fingerprint: `mandate:${person.person}:speculative:${bucket(
          person.speculative_actual_pct,
          2,
        )}`,
      });
    }

    const drifted = person.targets.filter(
      (row) => row.status === "breach" && row.drift_pp !== null,
    );
    if (drifted.length) {
      const worst = drifted.reduce((a, b) =>
        Math.abs(b.drift_pp ?? 0) > Math.abs(a.drift_pp ?? 0) ? b : a,
      );
      signals.push({
        id: `mandate-drift-${person.person}`,
        kind: "recommendation",
        severity: "action",
        summary: `${person.person}'s ${worst.label} sleeve is ${worst.actual_pct}% against their ${worst.target_pct}% mandate target, ${Math.abs(
          worst.drift_pp ?? 0,
        )}pp adrift. Rebalance within their mandate — ${
          person.mandate_type === "shariah"
            ? "Shariah-compliant instruments only, no conventional bonds or money market funds"
            : "conventional instruments are available to them"
        }.`,
        fingerprint: `mandate:${person.person}:drift:${worst.sleeve}:${bucket(worst.drift_pp, 3)}`,
      });
    }
  }

  if (mandates.unassigned.holdings.length) {
    signals.push({
      id: "mandate-unassigned",
      kind: "briefing",
      severity: "info",
      summary: `${money(mandates.unassigned.investable_base, base)} of holdings have no owner recorded (${mandates.unassigned.holdings.join(
        ", ",
      )}), so they sit under no mandate and are excluded from every per-person allocation figure. Ask whose they are.`,
      fingerprint: `mandate:unassigned:${mandates.unassigned.holdings.slice().sort().join("|")}`,
    });
  }

  return signals;
}

/**
 * Realised results, and whether the tax system cares. An ISA loss is not a tax
 * asset; only a general investment account disposal reaches the exempt amount.
 */
function fromRealised(context: HouseholdContext, base: string): Signal[] {
  const realised = context.realised;
  if (!realised) return [];
  const signals: Signal[] = [];
  const cgt = realised.cgt_general_investment_accounts;
  const days = context.allowances.days_to_5_april;

  // "watch" is the summariser's word for a net gain above the exempt amount.
  if (cgt.status === "watch" && (cgt.taxable ?? 0) > 0) {
    signals.push({
      id: "cgt-over-exemption",
      kind: "alert",
      severity: "urgent",
      summary: `Realised gains in general investment accounts are ${money(
        cgt.net,
        base,
      )} for ${realised.tax_year}, above the ${money(
        cgt.exempt_amount,
        base,
      )} annual exempt amount — ${money(cgt.taxable, base)} is taxable at 18% or 24%. ${
        cgt.unknown_basis_disposals
          ? `${cgt.unknown_basis_disposals} disposals have no recorded cost, so the true figure is higher.`
          : ""
      }`,
      fingerprint: `cgt:${realised.tax_year}:over:${bucket(cgt.taxable, 1000)}`,
    });
  } else if (cgt.headroom !== null && cgt.headroom > 500 && days <= 90 && (cgt.net ?? 0) !== 0) {
    signals.push({
      id: "cgt-headroom",
      kind: "recommendation",
      severity: "action",
      summary: `${money(cgt.headroom, base)} of the ${money(
        cgt.exempt_amount,
        base,
      )} CGT exemption is unused with ${days} days of ${realised.tax_year} left, and it does not carry forward. It applies only to general investment accounts, never to ISA or pension disposals.`,
      fingerprint: `cgt:${realised.tax_year}:headroom:${bucket(cgt.headroom, 500)}`,
    });
  }

  if (realised.sheltered.net !== null && realised.sheltered.net < -100) {
    signals.push({
      id: "isa-realised-loss",
      kind: "briefing",
      severity: "info",
      summary: `${money(
        Math.abs(realised.sheltered.net),
        base,
      )} of realised losses sit inside sheltered accounts (ISA or pension) across ${realised.sheltered.disposals} disposals in ${realised.tax_year}. These carry no tax benefit — they cannot be set against gains and they do not carry forward. Only a general investment account loss can.`,
      fingerprint: `realised:sheltered:${realised.tax_year}:${bucket(realised.sheltered.net, 250)}`,
    });
  }

  if (cgt.unknown_basis_disposals > 0 && cgt.status !== "watch") {
    signals.push({
      id: "realised-unknown-basis",
      kind: "briefing",
      severity: "info",
      summary: `${cgt.unknown_basis_disposals} disposals in general investment accounts have no recorded purchase cost, so the realised position for ${realised.tax_year} is incomplete. Importing the earlier contract notes or activity export would settle it.`,
      fingerprint: `realised:unknown:${realised.tax_year}:${cgt.unknown_basis_disposals}`,
    });
  }

  return signals;
}


function fromLiquidity(context: HouseholdContext, base: string): Signal[] {
  const { gbp_cash, essential_monthly, months_covered, target_months } = context.liquidity;
  const unknown = context.liquidity.cash_balances_unknown ?? 0;
  // A reserve cannot be called short — or called excessive — out of cash that
  // has simply not been read yet. One unread current account can hold the whole
  // reserve, so the honest signal is that the figure is unmeasurable.
  if (unknown > 0) {
    return [
      {
        id: "cash-balances-unknown",
        kind: "alert",
        severity: "action",
        summary: `${unknown} account ${unknown === 1 ? "balance is" : "balances are"} unknown, so the cash reserve cannot be measured and is not being called short. Import a statement that prints a closing balance, or set the figure by hand.`,
        fingerprint: `cash:unknown:${unknown}`,
      },
    ];
  }
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

/** A person's name reduced to something safe to put in a signal id. */
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * What the paperwork says that the balance sheet cannot.
 *
 * Policies, tenancy agreements and payslips each carry a dated consequence: a
 * cover shortfall, a notice deadline, or an income figure closing on £100,000.
 * Nothing here fires from an absence of paper — an unuploaded policy is unknown
 * cover, not nil cover, and the one signal about missing paper says exactly that.
 */
function fromDocuments(context: HouseholdContext, base: string): Signal[] {
  const documents = context.documents;
  if (!("protection" in documents)) return [];
  const { protection, housing, pay } = documents;
  const signals: Signal[] = [];

  /* ------------------------------------------------------------ protection */

  if (protection.policies_on_file === 0) {
    signals.push({
      id: "protection-no-policies",
      kind: "briefing",
      severity: "info",
      summary: `No insurance policy schedules are on file, so life, critical illness and income protection cover is unknown rather than nil. The household owes ${money(
        protection.liabilities_base,
        base,
      )} and has chosen ${protection.replacement_years} years of income replacement, which is what any cover would have to meet.`,
      fingerprint: "protection:none-on-file",
    });
  } else if ((protection.shortfall_base ?? 0) > 0) {
    const shortfall = protection.shortfall_base ?? 0;
    const need = protection.need_base ?? 0;
    signals.push({
      id: "protection-shortfall",
      kind: "risk",
      // Uncovered more than half the need is a foundation problem, not a tidy-up.
      severity: need > 0 && shortfall / need >= 0.5 ? "urgent" : "action",
      summary: `Life cover on file is ${money(protection.life_cover_base, base)} against a need of ${money(
        need,
        base,
      )} — ${money(shortfall, base)} uncovered. The need is ${money(
        protection.liabilities_base,
        base,
      )} of liabilities plus ${protection.replacement_years} years of income at ${money(
        protection.income_replacement_base,
        base,
      )}.${
        protection.people_without_life_cover.length
          ? ` No life policy is on file for ${protection.people_without_life_cover.join(" or ")}.`
          : ""
      }`,
      fingerprint: `protection:shortfall:${bucket(shortfall, 50_000)}`,
    });
  }

  for (const person of protection.people_without_income_protection) {
    const cover = protection.cover_by_person.find((row) => row.person === person);
    if (!cover?.annual_income_base) continue;
    signals.push({
      id: `protection-ip-${slug(person)}`,
      kind: "risk",
      severity: "info",
      summary: `${person} earns ${money(
        cover.annual_income_base,
        base,
      )} a year with no income protection policy on file. Long-term illness would stop that income while the household's fixed commitments continue.`,
      fingerprint: `protection:ip:${person}`,
    });
  }

  for (const policy of protection.life_policies_not_in_trust) {
    signals.push({
      id: `protection-trust-${slug(policy.insurer)}`,
      kind: "recommendation",
      severity: "action",
      summary: `The ${policy.insurer} life policy (${money(
        policy.sum_assured_base,
        base,
      )}) is not written in trust. ${policy.note} Writing it in trust is paperwork with the insurer, not a new premium.`,
      fingerprint: `protection:trust:${policy.insurer}`,
    });
  }

  for (const renewal of protection.renewals_within_60_days) {
    signals.push({
      id: `protection-renewal-${slug(renewal.insurer)}-${slug(renewal.type)}`,
      kind: "alert",
      severity: renewal.days_away <= 30 ? "urgent" : "action",
      summary: `The ${renewal.insurer} ${renewal.type.replace(/_/g, " ")} policy renews on ${
        renewal.date
      }, ${renewal.days_away} days away, at ${money(
        renewal.premium_base,
        base,
      )}. Auto-renewal quotes are usually above the market — this is the window to re-quote.`,
      fingerprint: `protection:renewal:${renewal.insurer}:${renewal.date}`,
    });
  }

  /* --------------------------------------------------------------- housing */

  for (const tenancy of housing.agreements) {
    if (tenancy.status === "ended") continue;

    if (tenancy.days_to_decision !== null && tenancy.days_to_decision <= 120) {
      signals.push({
        id: `tenancy-decision-${slug(tenancy.address)}`,
        kind: "alert",
        severity: tenancy.days_to_decision <= 30 ? "urgent" : "action",
        summary: `${tenancy.address}: ${
          tenancy.decision ?? "the tenancy decision"
        } falls on ${tenancy.decision_date}, ${tenancy.days_to_decision} days away${
          tenancy.notice_months ? `, with ${tenancy.notice_months} months' notice required` : ""
        }. Rent is ${money(tenancy.monthly_rent_base, base)} a month${
          tenancy.term_end ? ` and the term ends ${tenancy.term_end}` : ""
        }.`,
        fingerprint: `tenancy:decision:${tenancy.address}:${tenancy.decision_date}`,
      });
    }

    if (
      tenancy.role === "tenant" &&
      tenancy.status === "current" &&
      (tenancy.monthly_rent_base ?? 0) > 0 &&
      !tenancy.rent_in_forecast
    ) {
      signals.push({
        id: `tenancy-forecast-${slug(tenancy.address)}`,
        kind: "briefing",
        severity: "action",
        summary: `Rent of ${money(
          tenancy.monthly_rent_base,
          base,
        )} a month on ${tenancy.address} is not in the forecast, so every projection and scenario understates committed spending by ${money(
          (tenancy.monthly_rent_base ?? 0) * 12,
          base,
        )} a year.`,
        fingerprint: `tenancy:forecast:${tenancy.address}`,
      });
    }

    if (
      tenancy.role === "tenant" &&
      (tenancy.deposit_base ?? 0) > 0 &&
      !tenancy.deposit_on_balance_sheet
    ) {
      signals.push({
        id: `tenancy-deposit-${slug(tenancy.address)}`,
        kind: "briefing",
        severity: "info",
        summary: `A deposit of ${money(
          tenancy.deposit_base,
          base,
        )} on ${tenancy.address} is recoverable at the end of the tenancy but is not on the balance sheet, so net worth and any deposit-funded purchase are understated by that amount.`,
        fingerprint: `tenancy:deposit:${tenancy.address}`,
      });
    }
  }

  /* ------------------------------------------------------------------- pay */

  for (const person of pay.people) {
    if (person.ani_status === "over" || person.ani_status === "close") {
      const over = person.ani_status === "over";
      signals.push({
        id: `pay-ani-${slug(person.person)}`,
        kind: over ? "alert" : "recommendation",
        severity: over ? "urgent" : "action",
        summary: `${person.person}'s adjusted net income for ${pay.tax_year} projects to ${money(
          person.ani_estimate_base,
          base,
        )} against the ${money(pay.cliff, base)} cliff — ${
          over
            ? `${money(Math.abs(person.headroom_to_100k_base ?? 0), base)} over`
            : `${money(person.headroom_to_100k_base, base)} of headroom`
        }. Above £100,000 the personal allowance tapers at 60% marginal rate and both the 30 funded childcare hours and Tax-Free Childcare are withdrawn entirely.${
          person.pension_contribution_to_clear_base
            ? ` A pension contribution of ${money(
                person.pension_contribution_to_clear_base,
                base,
              )} before 5 April brings it back under.`
            : ""
        } Projected from ${person.payslips_in_year} payslip${
          person.payslips_in_year === 1 ? "" : "s"
        } this year, so it moves with each new one.`,
        fingerprint: `pay:ani:${person.person}:${pay.tax_year}:${person.ani_status}:${bucket(
          person.ani_estimate_base,
          2500,
        )}`,
      });
    }

    const allowance = person.pension_allowance;
    if (allowance && (allowance.headroom_base ?? 0) < 0) {
      signals.push({
        id: `pay-pension-over-${slug(person.person)}`,
        kind: "alert",
        severity: "urgent",
        summary: `${person.person}'s projected pension contributions for ${pay.tax_year} are ${money(
          allowance.projected_total_base,
          base,
        )} against an annual allowance of ${money(allowance.allowance_base, base)}${
          allowance.taper_likely ? " (tapered by adjusted income)" : ""
        } — ${money(
          Math.abs(allowance.headroom_base ?? 0),
          base,
        )} over. The excess is charged at the marginal rate unless carry-forward from the three previous years covers it.`,
        fingerprint: `pay:pension-over:${person.person}:${pay.tax_year}:${bucket(
          allowance.headroom_base,
          2500,
        )}`,
      });
    }

    // Every historical code change is on the record; only the most recent one is
    // news, and a wrong code today matters whatever happened last year.
    const changes = person.tax_code_flags.filter((flag) => flag.kind === "changed");
    const codeFlags = [
      ...person.tax_code_flags.filter((flag) => flag.kind !== "changed"),
      ...(changes.length ? [changes[changes.length - 1]!] : []),
    ];

    for (const flag of codeFlags) {
      signals.push({
        id: `pay-taxcode-${flag.kind}-${slug(person.person)}`,
        kind: "alert",
        severity: flag.kind === "changed" ? "info" : "action",
        summary: `${person.person}'s tax code is ${flag.code}${
          flag.previous ? `, changed from ${flag.previous}` : ""
        } as of the payslip dated ${flag.since}. ${flag.note}`,
        fingerprint: `pay:taxcode:${person.person}:${flag.kind}:${flag.code}:${flag.since}`,
      });
    }
  }

  for (const gap of pay.months_missing) {
    if (gap.missing.length < 2) continue;
    signals.push({
      id: `pay-missing-${slug(gap.employer)}`,
      kind: "briefing",
      severity: "info",
      summary: `${gap.missing.length} of ${gap.expected} expected payslips from ${
        gap.employer
      } are not on file (${gap.seen} uploaded; missing ${gap.missing
        .slice(0, 6)
        .join(", ")}). The adjusted net income estimate runs off year-to-date figures, so it survives the gap, but net-pay reconciliation against the bank does not.`,
      fingerprint: `pay:missing:${gap.employer}:${gap.missing.join("|")}`,
    });
  }

  return signals;
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
    ...fromIsaAsymmetry(context, base),
    ...fromMandates(context, base),
    ...fromRealised(context, base),
    ...fromLiquidity(context, base),
    ...fromWatchlist(context),
    ...fromHoldings(context, base),
    ...fromSpending(context, base),
    ...fromCurrency(context),
    ...fromDocuments(context, base),
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
