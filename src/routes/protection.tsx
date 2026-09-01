import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/Money";
import { ProtectionGap } from "@/components/documents/ProtectionGap";
import { RenewalAlerts } from "@/components/documents/RenewalAlerts";
import { CoverByPerson } from "@/components/documents/CoverByPerson";
import { PolicyList } from "@/components/documents/PolicyList";
import { InsuranceSheet } from "@/components/forms/InsuranceSheet";
import { useProtection, useSetReplacementYears } from "@/hooks/useProtection";
import type { InsurancePolicyRow } from "@/hooks/useDocuments";

export const Route = createFileRoute("/protection")({
  head: () => ({
    meta: [
      { title: "Protection — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Every policy the household holds, measured against what it would actually need: debts cleared, income replaced, and renewals flagged before they roll over.",
      },
      { property: "og:title", content: "Protection — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Life, critical illness and income protection read from the policy schedules, with the uncovered gap stated in one figure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProtectionPage,
});

function ProtectionPage() {
  const protection = useProtection();
  const setYears = useSetReplacementYears();
  const [editing, setEditing] = useState<InsurancePolicyRow | null>(null);
  const [open, setOpen] = useState(false);

  const openSheet = (policy: InsurancePolicyRow | null) => {
    setEditing(policy);
    setOpen(true);
  };

  const { policies, loading, base, annualPremium, active } = protection;

  return (
    <AppShell
      title="Protection"
      description="What the household is insured for, against what it would need."
      actions={
        <Button variant="outline" size="sm" onClick={() => openSheet(null)}>
          <Plus className="mr-1.5 size-3.5" />
          Add policy
        </Button>
      }
    >
      <div className="space-y-8">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : policies.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-4 w-4" />}
            title="No policies on file"
            body="Drop the policy schedules onto the documents shelf — life, critical illness, income protection, home, travel. Each one is read for its insurer, cover, premium and renewal date, and the household's uncovered gap is worked out from there. A policy can also be typed in by hand if the paperwork is not to hand."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link to="/documents">Upload a policy schedule</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openSheet(null)}>
                  Enter one by hand
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <ProtectionGap
              protection={protection}
              years={protection.years}
              onYearsChange={(years) => setYears.mutate(years)}
            />

            {protection.renewals.length > 0 && (
              <section>
                <SectionHeader
                  title="Renewing soon"
                  description="Flagged at 60 days and again at 30, while there is still time to re-broke it."
                />
                <RenewalAlerts protection={protection} />
              </section>
            )}

            <section>
              <SectionHeader
                title="Cover by person"
                description="Life cover shown as a multiple of that person's gross income. Anything held jointly is split evenly."
              />
              <CoverByPerson protection={protection} />
            </section>

            <section>
              <SectionHeader
                title="Policies"
                description={`${active.length} active${
                  policies.length > active.length ? ` of ${policies.length} on file` : ""
                }.`}
                action={
                  annualPremium > 0 ? (
                    <div className="text-right">
                      <p className="eyebrow">Premiums a year</p>
                      <Money amount={annualPremium} currency={base} decimals={0} />
                    </div>
                  ) : null
                }
              />
              <PolicyList policies={policies} onEdit={openSheet} />
            </section>
          </>
        )}

        <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
          Cover figures are converted to {base} at today's rate for comparison; each policy keeps
          its own currency. This is a modelling tool, not regulated advice — confirm any change to
          cover with an FCA-authorised adviser.
        </p>
      </div>

      <InsuranceSheet open={open} onOpenChange={setOpen} policy={editing} />
    </AppShell>
  );
}
