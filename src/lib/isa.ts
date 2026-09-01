/**
 * ISA allowances, per person.
 *
 * An ISA belongs to the person whose name is on it. Money moved from one
 * person's bank account into an ISA registered to the other still uses the
 * *account holder's* £20,000, and the investments inside are legally theirs.
 * A household that funds one ISA heavily while the other person's allowance
 * goes untouched is not doing anything wrong — but it is letting a second
 * £20,000 expire on 5 April, and that is worth asking about before it does.
 *
 * The app never assumes. A person with nothing recorded is reported as
 * unrecorded, not as having the full allowance available.
 */
import { POLICY_LIMITS, currentTaxYear, type PolicyStatus } from "@/lib/policy";

export type IsaPerson = {
  profileId: string;
  person: string;
  /** False when nothing has been recorded for this tax year. */
  recorded: boolean;
  usedBase: number;
  remainingBase: number;
  usedPct: number | null;
  status: PolicyStatus;
  /**
   * Credits into this person's ISA accounts since 6 April, read from imported
   * statements. Not the same thing as a subscription — dividends and refunds
   * credited inside the wrapper land here too — so it is offered as a
   * cross-check, never written into the recorded figure automatically.
   */
  observedCreditsBase: number | null;
  observedAccounts: string[];
};

export type IsaAsymmetry = {
  heavy: IsaPerson;
  light: IsaPerson;
  unusedBase: number;
  question: string;
};

export type IsaTracker = {
  taxYear: string;
  daysRemaining: number;
  allowanceBase: number;
  people: IsaPerson[];
  /** Two people, two allowances: what the household could still subscribe this year. */
  householdCapacityBase: number;
  householdUsedBase: number;
  householdRemainingBase: number;
  unrecordedCount: number;
  asymmetry: IsaAsymmetry | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);

export function buildIsaTracker(input: {
  members: { id: string; name: string }[];
  allowances: { profile_id: string | null; tax_year: string; isa_used: number | string }[];
  /** Credits into each person's ISA accounts this tax year, by profile id. */
  observed?: Record<string, { amount: number; accounts: string[] }>;
  now?: Date;
}): IsaTracker {
  const taxYear = currentTaxYear(input.now ?? new Date());
  const allowance = POLICY_LIMITS.isaAllowance;

  const people: IsaPerson[] = input.members.map((member) => {
    const row = input.allowances.find(
      (entry) => entry.profile_id === member.id && entry.tax_year === taxYear.label,
    );
    const used = Number(row?.isa_used ?? 0);
    const observed = input.observed?.[member.id];
    const usedPct = allowance > 0 ? (used / allowance) * 100 : null;
    return {
      profileId: member.id,
      person: member.name,
      recorded: !!row,
      usedBase: used,
      remainingBase: Math.max(allowance - used, 0),
      usedPct,
      status: !row
        ? "unknown"
        : used > allowance
          ? "breach"
          : used >= allowance
            ? "ok"
            : taxYear.daysRemaining <= 60
              ? "watch"
              : "ok",
      observedCreditsBase: observed ? observed.amount : null,
      observedAccounts: observed?.accounts ?? [],
    };
  });

  const householdUsed = people.reduce((sum, person) => sum + person.usedBase, 0);
  const capacity = allowance * people.length;

  // The question only makes sense with two allowances in play, and only when
  // one of them is genuinely being used.
  const recorded = people.filter((person) => person.recorded);
  const sorted = [...people].sort((a, b) => b.usedBase - a.usedBase);
  const heavy = sorted[0];
  const light = sorted[sorted.length - 1];

  let asymmetry: IsaAsymmetry | null = null;
  if (
    people.length >= 2 &&
    heavy &&
    light &&
    heavy.profileId !== light.profileId &&
    heavy.recorded &&
    heavy.usedBase >= allowance * 0.5 &&
    light.usedBase < allowance * 0.1
  ) {
    asymmetry = {
      heavy,
      light,
      unusedBase: light.remainingBase,
      question: `${heavy.person} has subscribed ${money(heavy.usedBase)} of a ${money(
        allowance,
      )} ISA allowance this year and ${light.person} ${
        light.recorded ? `has subscribed ${money(light.usedBase)}` : "has nothing recorded"
      }. Two people have two allowances, and ${light.person}'s ${money(
        light.remainingBase,
      )} expires on 5 April rather than carrying forward. Where one person's bank account funds an ISA registered in the other's name, the subscription uses the account holder's allowance and the investments are legally theirs — worth checking whether some of this year's saving belongs in ${light.person}'s own wrapper. ${taxYear.daysRemaining} days left.`,
    };
  }

  return {
    taxYear: taxYear.label,
    daysRemaining: taxYear.daysRemaining,
    allowanceBase: allowance,
    people,
    householdCapacityBase: capacity,
    householdUsedBase: householdUsed,
    householdRemainingBase: Math.max(capacity - householdUsed, 0),
    unrecordedCount: people.length - recorded.length,
    asymmetry,
  };
}
