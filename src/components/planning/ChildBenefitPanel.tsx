import { Info } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { HICBC_LOWER, HICBC_UPPER } from "@/lib/planning/uk-2026";
import { NI_CREDIT_NOTE } from "@/lib/planning/thresholds";
import type { ChildBenefitAssessment } from "@/lib/planning/thresholds";
import { cn } from "@/lib/utils";

/**
 * Child Benefit, and how much of it survives the High Income Child Benefit
 * Charge. The point that matters is not the money — above £80,000 there is
 * none — it is that the claim is still worth registering for the National
 * Insurance credits.
 */
export function ChildBenefitPanel({
  assessment,
  childCount,
  base,
  unrecorded,
}: {
  assessment: ChildBenefitAssessment | null;
  childCount: number;
  base: string;
  unrecorded: string[];
}) {
  if (!assessment) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-foreground">Child Benefit cannot be assessed yet</p>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
          The charge is tested on the higher of the two adjusted net incomes.
          {unrecorded.length
            ? ` Record ${unrecorded.join(" and ")}'s income above and this fills in.`
            : " Record an income above and this fills in."}
        </p>
      </div>
    );
  }

  const taperPosition = Math.max(
    0,
    Math.min(100, ((assessment.testedAni - HICBC_LOWER) / (HICBC_UPPER - HICBC_LOWER)) * 100),
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-foreground">
            {formatMoney(assessment.weekly, base)} a week
            {childCount > 1 ? ` for ${childCount} children` : ""}
          </p>
          <p className="num mt-0.5 text-xs text-muted-foreground">
            {formatMoney(assessment.annual, base, { decimals: 0 })} a year if none were clawed back
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">Kept</p>
          <p
            className={cn(
              "num text-xl font-light",
              assessment.fullyClawedBack ? "text-muted-foreground" : "text-gain",
            )}
          >
            {formatMoney(assessment.retained, base, { decimals: 0 })}
          </p>
        </div>
      </div>

      {/* The taper band, £60,000 to £80,000, with the household's position on it. */}
      <div className="mt-4">
        <div className="relative h-2.5 w-full overflow-hidden rounded-sm bg-gain/20">
          <div
            className="absolute inset-y-0 right-0 bg-loss/60"
            style={{ width: `${100 - taperPosition}%` }}
          />
          <div
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `${taperPosition}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[0.65rem] text-muted-foreground">
          <span className="num">£60,000 — kept in full</span>
          <span className="num">£80,000 — all clawed back</span>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-border pt-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Tested income</dt>
          <dd className="num mt-0.5 text-foreground">
            {formatMoney(assessment.testedAni, base, { decimals: 0 })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Charge rate</dt>
          <dd className="num mt-0.5 text-foreground">
            {(assessment.chargeRate * 100).toFixed(0)}%
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Clawed back a year</dt>
          <dd className="num mt-0.5 text-loss">
            {formatMoney(assessment.charge, base, { decimals: 0 })}
          </dd>
        </div>
      </dl>

      <p className="mt-3 flex items-start gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5 text-[0.7rem] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
        {NI_CREDIT_NOTE}
      </p>
    </div>
  );
}
