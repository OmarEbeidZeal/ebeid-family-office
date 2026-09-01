import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Money } from "@/components/Money";
import { SelectNative } from "@/components/forms/FormField";
import type { Protection } from "@/hooks/useProtection";
import { cn } from "@/lib/utils";

const YEARS = [3, 5, 10, 15, 20];

/**
 * What the family would need if the worst happened, against what is actually
 * insured. Deliberately one sum: debts cleared, plus a chosen number of years
 * of income, less the life cover in force.
 */
export function ProtectionGap({
  protection,
  years,
  onYearsChange,
}: {
  protection: Protection;
  years: number;
  onYearsChange: (years: number) => void;
}) {
  const { gap, base } = protection;
  const covered = gap.need > 0 ? Math.min(1, gap.cover / gap.need) : 1;
  const shortfall = gap.gap > 0;

  return (
    <div className="hairline rounded-lg bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">If the worst happened</p>
          <p
            className={cn(
              "num mt-2 text-[1.7rem] font-light leading-tight",
              shortfall ? "text-loss" : "text-gain",
            )}
          >
            {shortfall ? (
              <Money amount={gap.gap} currency={base} decimals={0} align="left" hideConverted />
            ) : (
              "Fully covered"
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {shortfall ? "Uncovered need" : "Cover in force meets the need as measured here"}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Replace
          <span className="w-28">
            <SelectNative
              value={String(years)}
              onChange={(value) => onYearsChange(Number(value))}
              options={YEARS.map((value) => ({ value: String(value), label: `${value} years` }))}
            />
          </span>
          of income
        </label>
      </div>

      {/* The arithmetic, laid out so it can be argued with. */}
      <div className="mt-5 space-y-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn("h-full rounded-full", shortfall ? "bg-warn" : "bg-gain")}
            style={{ width: `${Math.round(covered * 100)}%` }}
          />
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <Line label="Everything owed" value={gap.liabilities} base={base} />
          <Line
            label={`${years} years of household income`}
            value={gap.incomeReplacement}
            base={base}
          />
          <Line label="Total need" value={gap.need} base={base} strong />
          <Line label="Life cover in force" value={gap.cover} base={base} strong tone="gain" />
        </dl>
      </div>

      {(gap.peopleWithoutLifeCover.length > 0 ||
        gap.peopleWithoutIncomeProtection.length > 0 ||
        gap.notInTrust.length > 0) && (
        <ul className="mt-5 space-y-2 border-t border-border pt-4">
          {gap.peopleWithoutLifeCover.map((person) => (
            <Flag
              key={`life-${person.id ?? person.name}`}
              tone="loss"
              text={`${person.name} has no life cover on file.`}
            />
          ))}
          {gap.peopleWithoutIncomeProtection.map((person) => (
            <Flag
              key={`ip-${person.id ?? person.name}`}
              tone="warn"
              text={`${person.name} has no income protection. Long-term illness is more likely than death before 60, and statutory sick pay stops after 28 weeks.`}
            />
          ))}
          {gap.notInTrust.length > 0 && (
            <Flag
              tone="warn"
              text={`${gap.notInTrust.length} life ${
                gap.notInTrust.length === 1 ? "policy is" : "policies are"
              } not written in trust. The payout lands in the estate, so it waits for probate and can be taxed at 40%.`}
            />
          )}
        </ul>
      )}

      <p className="mt-4 text-[0.7rem] leading-relaxed text-muted-foreground">
        Measured as debts cleared plus {years} years of gross household income, less life cover in
        force. It ignores savings deliberately — money earmarked for a goal is not protection.
        Income held jointly is split evenly between household members.
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  base,
  strong,
  tone,
}: {
  label: string;
  value: number;
  base: string;
  strong?: boolean;
  tone?: "gain";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
      <dt className={cn("text-muted-foreground", strong && "text-foreground")}>{label}</dt>
      <dd className={cn("num", tone === "gain" && "text-gain", strong && "text-foreground")}>
        <Money amount={value} currency={base} decimals={0} hideConverted />
      </dd>
    </div>
  );
}

function Flag({ tone, text }: { tone: "warn" | "loss"; text: string }) {
  const Icon = tone === "loss" ? AlertTriangle : ShieldCheck;
  return (
    <li className="flex items-start gap-2.5 text-xs leading-relaxed">
      <Icon
        className={cn("mt-0.5 size-3.5 shrink-0", tone === "loss" ? "text-loss" : "text-warn")}
      />
      <span className="text-muted-foreground">{text}</span>
    </li>
  );
}
