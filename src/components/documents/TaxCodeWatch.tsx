import { AlertTriangle, ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { formatDate } from "@/lib/format";
import type { PersonPay } from "@/hooks/usePayInsights";
import { cn } from "@/lib/utils";

/**
 * Tax codes, watched rather than assumed correct.
 *
 * An emergency code or a silent change is the commonest reason a payslip is
 * wrong, and neither announces itself.
 */
export function TaxCodeWatch({ people }: { people: PersonPay[] }) {
  const withCodes = people.filter((person) => person.latestTaxCode || person.taxCodes.length);
  if (!withCodes.length) return null;

  return (
    <section>
      <SectionHeader
        title="Tax code"
        description="What HMRC currently has, and anything that changed underneath it."
      />
      <div className="space-y-3">
        {withCodes.map((person) => (
          <div key={person.profileId ?? "unassigned"} className="hairline rounded-lg bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm text-foreground">{person.name}</p>
              <p className="num text-sm text-foreground">{person.latestTaxCode ?? "Not stated"}</p>
            </div>

            {person.taxCodes.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                A standard code, unchanged across the slips on file.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {person.taxCodes.map((issue, index) => (
                  <li
                    key={`${issue.kind}-${issue.since}-${index}`}
                    className="flex items-start gap-2.5 text-xs leading-relaxed"
                  >
                    {issue.kind === "changed" ? (
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          issue.kind === "emergency" ? "text-warn" : "text-loss",
                        )}
                      />
                    )}
                    <span className="text-muted-foreground">
                      {issue.kind === "changed" ? (
                        <>
                          <span className="num text-foreground">{issue.previous}</span> became{" "}
                          <span className="num text-foreground">{issue.code}</span> on{" "}
                          {formatDate(issue.since, "short")}.
                        </>
                      ) : (
                        <>
                          <span className="num text-foreground">{issue.code}</span> since{" "}
                          {formatDate(issue.since, "short")}.
                        </>
                      )}{" "}
                      {issue.note}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
