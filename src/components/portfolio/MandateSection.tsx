import { Link } from "@tanstack/react-router";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { MandateCard } from "@/components/portfolio/MandateCard";
import { formatMoney } from "@/lib/format";
import type { MandateEvaluation } from "@/lib/mandates";

/**
 * Household rules apply to both people. What they may hold, and in what
 * proportion, does not — so allocation and compliance are judged per person
 * against their own mandate, and only then rolled up.
 */
export function MandateSection({
  evaluations,
  base,
  scoped,
  unassignedCount,
  unassignedValue,
  loading,
  onEdit,
}: {
  evaluations: MandateEvaluation[];
  base: string;
  /** True when the perspective toggle has a single person selected. */
  scoped: boolean;
  unassignedCount: number;
  unassignedValue: number;
  loading?: boolean;
  onEdit: (evaluation: MandateEvaluation) => void;
}) {
  return (
    <section>
      <SectionHeader
        title={scoped ? "Investment mandate" : "Investment mandates"}
        description={
          scoped
            ? "Targets, caps and compliance for this person, measured against their own investable assets."
            : "The household rules — reserve, capital priority, currency limits — apply to both. Allocation and compliance are judged per person against their own mandate."
        }
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      ) : evaluations.length === 0 ? (
        <EmptyState
          title={scoped ? "No mandate for this view" : "No mandates recorded"}
          body="A mandate belongs to a person. Add the household's members, then record what each of them may hold and in what proportion."
          action={
            <Link
              to="/settings"
              className="rounded-md border border-gold-line bg-gold-soft px-3 py-1.5 text-xs text-gold transition-colors hover:bg-gold-soft/70"
            >
              Manage members
            </Link>
          }
        />
      ) : (
        <div
          className={
            evaluations.length > 1 ? "grid items-start gap-4 lg:grid-cols-2" : ""
          }
        >

          {evaluations.map((evaluation) => (
            <MandateCard
              key={evaluation.profileId}
              evaluation={evaluation}
              base={base}
              onEdit={() => onEdit(evaluation)}
            />
          ))}
        </div>
      )}

      {!loading && unassignedCount > 0 && (
        <p className="mt-3 rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {unassignedCount} holding{unassignedCount === 1 ? "" : "s"} worth{" "}
          <span className="num text-foreground/85">
            {formatMoney(unassignedValue, base, { decimals: 0 })}
          </span>{" "}
          {unassignedCount === 1 ? "has" : "have"} no owner recorded, so{" "}
          {unassignedCount === 1 ? "it sits" : "they sit"} under no mandate. Set an owner on each
          holding to bring {unassignedCount === 1 ? "it" : "them"} under one.
        </p>
      )}

      {!loading && !scoped && evaluations.length === 1 && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Only {evaluations[0]?.person} is a member of this household.{" "}
          <Link to="/settings" className="text-gold underline-offset-4 hover:underline">
            Invite the other person
          </Link>{" "}
          to record their own mandate and track their ISA allowance separately.
        </p>
      )}
    </section>
  );
}
