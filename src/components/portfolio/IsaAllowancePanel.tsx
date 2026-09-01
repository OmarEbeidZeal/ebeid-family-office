import { Link } from "@tanstack/react-router";
import { SectionHeader } from "@/components/SectionHeader";
import { PolicyPill } from "@/components/portfolio/PolicyPill";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent } from "@/lib/format";
import type { IsaTracker } from "@/lib/isa";

/**
 * Two people, two £20,000 allowances, and the unused part of each expires on
 * 5 April. Where one is heavily used and the other is untouched, the panel
 * asks the question rather than assuming an error.
 */
export function IsaAllowancePanel({
  isa,
  base,
  loading,
}: {
  isa: IsaTracker;
  base: string;
  loading?: boolean;
}) {
  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title={`ISA allowances ${isa.taxYear}`}
        description={`${formatMoney(isa.allowanceBase, base, { decimals: 0 })} each, per person. Whatever is unused on 5 April is gone — ${isa.daysRemaining} day${isa.daysRemaining === 1 ? "" : "s"} left in this tax year.`}
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isa.people.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No members recorded, so there is no allowance to track yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {isa.people.map((person) => {
            const pct = Math.max(0, Math.min(100, person.usedPct ?? 0));
            return (
              <li key={person.profileId}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground/90">{person.person}</span>
                    {!person.recorded && <PolicyPill status="unknown" size="xs" label="Not recorded" />}
                    {person.status === "breach" && (
                      <PolicyPill status="breach" size="xs" label="Over allowance" />
                    )}
                  </div>
                  <span className="num text-xs text-muted-foreground">
                    <span className="text-foreground">
                      {formatMoney(person.usedBase, base, { decimals: 0 })}
                    </span>
                    {" of "}
                    {formatMoney(isa.allowanceBase, base, { decimals: 0 })}
                    {" · "}
                    {formatMoney(person.remainingBase, base, { decimals: 0 })} left
                  </span>
                </div>

                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      person.status === "breach"
                        ? "bg-loss"
                        : person.recorded && pct > 0
                          ? "bg-gold"
                          : "bg-border-strong",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                  {!person.recorded
                    ? "Nothing recorded for this tax year — that is not the same as nothing subscribed."
                    : person.usedPct !== null
                      ? `${formatPercent(person.usedPct, 0)} of the allowance used.`
                      : ""}
                  {person.observedCreditsBase !== null && person.observedCreditsBase > 0 && (
                    <>
                      {" "}
                      {formatMoney(person.observedCreditsBase, base, { decimals: 0 })} credited into{" "}
                      {person.observedAccounts.join(", ") || "their ISA"} since 6 April. Dividends
                      and refunds land there too, so check before recording it as a subscription.
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && isa.people.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
            <div>
              <p className="eyebrow mb-1">Household capacity</p>
              <p className="num text-sm text-foreground">
                {formatMoney(isa.householdCapacityBase, base, { decimals: 0 })}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-1">Used</p>
              <p className="num text-sm text-foreground">
                {formatMoney(isa.householdUsedBase, base, { decimals: 0 })}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-1">Still available</p>
              <p className="num text-sm text-gold">
                {formatMoney(isa.householdRemainingBase, base, { decimals: 0 })}
              </p>
            </div>
          </div>

          {isa.asymmetry && (
            <p className="mt-4 rounded-md border border-warn/35 bg-warn-soft/60 px-3 py-2 text-xs leading-relaxed text-warn">
              {isa.asymmetry.question}
            </p>
          )}

          <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
            An ISA belongs to whoever it is registered to, whichever account funded it — the
            subscription uses that person&rsquo;s allowance and the investments are legally theirs.
            Record subscriptions in{" "}
            <Link to="/settings" className="text-gold underline-offset-4 hover:underline">
              Settings
            </Link>
            .
          </p>
        </>
      )}
    </section>
  );
}
