import { Money } from "@/components/Money";
import type { Protection } from "@/hooks/useProtection";

/**
 * Cover held per person, alongside the income it is meant to stand in for.
 * A multiple is the fastest way to see whether a policy is a gesture or a plan.
 */
export function CoverByPerson({ protection }: { protection: Protection }) {
  const { cover, base, years } = protection;
  if (!cover.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cover.map((summary) => {
        const multiple =
          summary.person.annualIncome > 0 ? summary.lifeCover / summary.person.annualIncome : null;

        return (
          <div key={summary.person.id ?? summary.person.name} className="hairline rounded-lg bg-surface p-4">
            <p className="text-sm text-foreground">{summary.person.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {summary.person.annualIncome > 0 ? (
                <>
                  <Money
                    amount={summary.person.annualIncome}
                    currency={base}
                    decimals={0}
                    align="left"
                    hideConverted
                    className="text-xs"
                  />{" "}
                  a year, gross
                </>
              ) : (
                "No income recorded"
              )}
            </p>

            <dl className="mt-3 space-y-1.5 text-xs">
              <Row label="Life cover">
                {summary.lifeCover > 0 ? (
                  <Money amount={summary.lifeCover} currency={base} decimals={0} hideConverted />
                ) : (
                  <span className="text-loss">None on file</span>
                )}
              </Row>
              {multiple !== null && summary.lifeCover > 0 && (
                <Row label="As a multiple of income">
                  <span className="num">{multiple.toFixed(1)}×</span>
                </Row>
              )}
              <Row label="Critical illness">
                {summary.criticalIllnessCover > 0 ? (
                  <Money
                    amount={summary.criticalIllnessCover}
                    currency={base}
                    decimals={0}
                    hideConverted
                  />
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </Row>
              <Row label="Income protection">
                {summary.incomeProtectionMonthly > 0 ? (
                  <span className="flex items-baseline gap-1">
                    <Money
                      amount={summary.incomeProtectionMonthly}
                      currency={base}
                      decimals={0}
                      hideConverted
                    />
                    <span className="text-muted-foreground">a month</span>
                  </span>
                ) : (
                  <span className="text-warn">None</span>
                )}
              </Row>
            </dl>

            {summary.lifeCover > 0 && multiple !== null && multiple < years && (
              <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
                Below the {years}× the household has chosen to replace.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
