import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Home, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RentTrajectoryChart } from "@/components/charts/RentTrajectoryChart";
import { TenancyCard } from "@/components/documents/TenancyCard";
import { TenancySheet } from "@/components/forms/TenancySheet";
import { useTenancyInsights } from "@/hooks/useTenancyInsights";
import { formatDate, formatMoney } from "@/lib/format";
import type { TenancyRow } from "@/hooks/useDocuments";

export const Route = createFileRoute("/tenancy")({
  head: () => ({
    meta: [
      { title: "Tenancy — Ebeid Family Office" },
      {
        name: "description",
        content:
          "The rent, the deposit and the notice date from every tenancy agreement on file — wired into the five-year forecast, the balance sheet and the property goal.",
      },
      { property: "og:title", content: "Tenancy — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "What the lease costs each month, what rent has cost so far, and the last date notice can be given.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TenancyPage,
});

function TenancyPage() {
  const tenancy = useTenancyInsights();
  const [editing, setEditing] = useState<TenancyRow | null>(null);
  const [open, setOpen] = useState(false);

  const openSheet = (row: TenancyRow | null) => {
    setEditing(row);
    setOpen(true);
  };

  const decision = tenancy.nextDecision;

  return (
    <AppShell
      title="Tenancy"
      description="What the lease costs, and when the next decision has to be made."
      actions={
        <Button variant="outline" size="sm" onClick={() => openSheet(null)}>
          <Plus className="mr-1.5 size-3.5" />
          Add agreement
        </Button>
      }
    >
      <div className="space-y-8">
        {tenancy.loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : tenancy.views.length === 0 ? (
          <EmptyState
            icon={<Home className="h-4 w-4" />}
            title="No tenancy agreement on file"
            body="Upload the agreement and three things follow on their own: the rent becomes a recurring outgoing in the five-year forecast, the deposit is carried as a recoverable asset rather than money lost, and the notice date lands on the timeline so the decision to renew or buy is never made late."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link to="/documents">Upload an agreement</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openSheet(null)}>
                  Enter the terms by hand
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {/* The decision date, given the weight it deserves. */}
            {decision?.notice.decisionDate && (
              <div className="hairline flex flex-wrap items-center gap-4 rounded-lg bg-surface p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-gold">
                  <CalendarClock className="size-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">
                    {decision.notice.daysToDecision !== null && decision.notice.daysToDecision >= 0
                      ? `${decision.notice.daysToDecision} days to the ${decision.notice.decisionLabel}`
                      : `The date for ${decision.notice.decisionLabel} has passed`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {decision.row.property_address} ·{" "}
                    {formatDate(decision.notice.decisionDate, "medium")}
                    {decision.notice.termEnd &&
                      ` · term ends ${formatDate(decision.notice.termEnd, "short")}`}
                  </p>
                </div>
                {tenancy.propertyGoal && (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/goals">See {tenancy.propertyGoal.title}</Link>
                  </Button>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Rent going out"
                value={formatMoney(tenancy.monthlyRentOut, tenancy.base, { decimals: 0 })}
                definition="Monthly rent under every agreement running today where the household is the tenant, converted to base currency."
                sub="a month, live agreements"
              />
              {tenancy.monthlyRentIn > 0 && (
                <StatTile
                  label="Rent coming in"
                  value={formatMoney(tenancy.monthlyRentIn, tenancy.base, { decimals: 0 })}
                  definition="Monthly rent received under agreements where the household is the landlord. Gross, before letting costs and tax."
                  sub="a month, as landlord"
                />
              )}
              <StatTile
                label="Deposits held"
                value={formatMoney(tenancy.depositsHeld, tenancy.base, { decimals: 0 })}
                definition="Deposits lodged with landlords or protection schemes under live agreements. Recoverable, so it belongs on the balance sheet rather than counted as spent."
                sub="recoverable at the end of term"
              />
              <StatTile
                label="Rent paid to date"
                value={formatMoney(tenancy.rentPaidToDate, tenancy.base, { decimals: 0 })}
                definition="Rent across every year covered by the agreements on file. Only years with an agreement are counted — earlier tenancies not uploaded are not estimated."
                sub="across the agreements on file"
              />
            </div>

            {tenancy.trajectory.length > 1 && (
              <section>
                <SectionHeader
                  title="Rent trajectory"
                  description="Monthly rent by year, in base currency. The honest half of a rent-versus-buy conversation."
                />
                <div className="hairline rounded-lg bg-surface p-5">
                  <RentTrajectoryChart points={tenancy.trajectory} base={tenancy.base} />
                </div>
              </section>
            )}

            {tenancy.current.length > 0 && (
              <section>
                <SectionHeader title="Current" description="Agreements running today." />
                <div className="space-y-3">
                  {tenancy.current.map((view) => (
                    <TenancyCard key={view.row.id} view={view} onEdit={openSheet} />
                  ))}
                </div>
              </section>
            )}

            {tenancy.upcoming.length > 0 && (
              <section>
                <SectionHeader title="Starting soon" description="Signed, not yet begun." />
                <div className="space-y-3">
                  {tenancy.upcoming.map((view) => (
                    <TenancyCard key={view.row.id} view={view} onEdit={openSheet} />
                  ))}
                </div>
              </section>
            )}

            {tenancy.ended.length > 0 && (
              <section>
                <SectionHeader
                  title="Ended"
                  description="Kept for the rent history, and for the deposit still to come back."
                />
                <div className="space-y-3">
                  {tenancy.ended.map((view) => (
                    <TenancyCard key={view.row.id} view={view} onEdit={openSheet} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <TenancySheet open={open} onOpenChange={setOpen} tenancy={editing} />
    </AppShell>
  );
}
