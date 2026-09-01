import { Money } from "@/components/Money";
import { PENSION_TAPER_THRESHOLD } from "@/lib/documents/analysis";
import type { PersonPay } from "@/hooks/usePayInsights";
import { cn } from "@/lib/utils";

/**
 * Pension contributions against the annual allowance, employer's included —
 * the part households routinely forget, and the reason a charge arrives.
 */
export function PensionAllowancePanel({ person, base }: { person: PersonPay; base: string }) {
  const pension = person.pension;
  if (!pension || pension.projectedTotal <= 0) return null;

  const allowance = pension.taperedAllowance;
  const used = Math.min(1, pension.projectedTotal / allowance);
  const over = pension.headroom < 0;

  return (
    <div className="hairline rounded-lg bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">{person.name}</p>
          <p className="text-xs text-muted-foreground">Pension annual allowance</p>
        </div>
        <p className={cn("num text-lg font-light", over ? "text-loss" : "text-foreground")}>
          <Money amount={pension.projectedTotal} currency={base} decimals={0} hideConverted />
        </p>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full", over ? "bg-loss" : "bg-gold")}
          style={{ width: `${used * 100}%` }}
        />
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        <Row label="Yours, to date">
          <Money amount={pension.ytdEmployee} currency={base} decimals={0} hideConverted />
        </Row>
        <Row label="Employer's, to date">
          <Money amount={pension.ytdEmployer} currency={base} decimals={0} hideConverted />
        </Row>
        <Row label={pension.taperLikely ? "Tapered allowance" : "Annual allowance"}>
          <Money amount={allowance} currency={base} decimals={0} hideConverted />
        </Row>
        <Row label={over ? "Over the allowance" : "Room left"}>
          <span className={over ? "text-loss" : "text-gain"}>
            <Money
              amount={Math.abs(pension.headroom)}
              currency={base}
              decimals={0}
              hideConverted
            />
          </span>
        </Row>
      </dl>

      <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
        {pension.taperLikely
          ? `Adjusted income looks to be above £${PENSION_TAPER_THRESHOLD.toLocaleString("en-GB")}, so the allowance tapers by £1 for every £2 over, down to a £10,000 floor. Carry-forward from the previous three years is not counted here.`
          : "Projected from the year-to-date figures on the latest slip per employer, at the current rate. Carry-forward from the previous three years is not counted."}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
