import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Receipt } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectNative } from "@/components/forms/FormField";
import { AniCard } from "@/components/documents/AniCard";
import { PensionAllowancePanel } from "@/components/documents/PensionAllowancePanel";
import { PayslipTable } from "@/components/documents/PayslipTable";
import { TaxCodeWatch } from "@/components/documents/TaxCodeWatch";
import { PayslipSheet } from "@/components/forms/PayslipSheet";
import { usePayInsights } from "@/hooks/usePayInsights";
import { formatDate } from "@/lib/format";
import type { PayslipRow } from "@/hooks/useDocuments";

export const Route = createFileRoute("/pay")({
  head: () => ({
    meta: [
      { title: "Pay and tax — Ebeid Family Office" },
      {
        name: "description",
        content:
          "A running adjusted net income estimate against the £100,000 cliff, pension annual allowance tracking and tax code monitoring, built from the payslips on file.",
      },
      { property: "og:title", content: "Pay and tax — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Payslips read once become a live view of the £100,000 threshold, the pension annual allowance and whether the tax code is right.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayPage,
});

function PayPage() {
  const pay = usePayInsights();
  const [editing, setEditing] = useState<PayslipRow | null>(null);
  const [open, setOpen] = useState(false);

  const openSheet = (payslip: PayslipRow | null) => {
    setEditing(payslip);
    setOpen(true);
  };

  const withEstimates = pay.people.filter((person) => person.ani);

  return (
    <AppShell
      title="Pay and tax"
      description="What the payslips say, and what they mean for the year."
      actions={
        <div className="flex items-center gap-2">
          <span className="w-32">
            <SelectNative
              value={pay.taxYear}
              onChange={pay.setTaxYear}
              options={pay.years.map((year) => ({ value: year, label: year }))}
            />
          </span>
          <Button variant="outline" size="sm" onClick={() => openSheet(null)}>
            <Plus className="mr-1.5 size-3.5" />
            Add payslip
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        {pay.loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : pay.all.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-4 w-4" />}
            title="No payslips on file"
            body="Drop a few months of payslips onto the documents shelf. The year-to-date columns are what matter: from them the app keeps a running adjusted net income estimate against £100,000, tracks the pension annual allowance including the employer's share, and watches for an emergency tax code. National Insurance numbers are stripped before anything is stored."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link to="/documents">Upload payslips</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openSheet(null)}>
                  Enter one by hand
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <section>
              <SectionHeader
                title={`The £100,000 line · ${pay.taxYear}`}
                description="Crossing it tapers the personal allowance away at 60p in the pound, and from April 2026 takes the funded childcare hours with it."
              />
              {withEstimates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payslips dated in {pay.taxYear}. Choose another year, or add a slip.
                </p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {withEstimates.map((person) => (
                    <AniCard key={person.profileId ?? "unassigned"} person={person} base={pay.base} />
                  ))}
                </div>
              )}
            </section>

            {withEstimates.some((person) => person.pension) && (
              <section>
                <SectionHeader
                  title="Pension annual allowance"
                  description="Yours and the employer's together, projected to the end of the tax year."
                />
                <div className="grid gap-3 lg:grid-cols-2">
                  {withEstimates.map((person) => (
                    <PensionAllowancePanel
                      key={person.profileId ?? "unassigned"}
                      person={person}
                      base={pay.base}
                    />
                  ))}
                </div>
              </section>
            )}

            <TaxCodeWatch people={pay.people} />

            {pay.coverage.length > 0 && (
              <section>
                <SectionHeader
                  title="Months with nothing on file"
                  description="The income estimate projects across a gap rather than ignoring it, but the figure is firmer with the slip itself."
                />
                <ul className="hairline space-y-2 rounded-lg bg-surface p-4">
                  {pay.coverage.map((entry) => (
                    <li key={`${entry.profileId}-${entry.employer}`} className="text-xs">
                      <span className="text-foreground">{entry.employer}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {pay.nameFor(entry.profileId)} · {entry.seen} of {entry.expected} months
                        between {formatDate(entry.first, "short")} and{" "}
                        {formatDate(entry.last, "short")}
                      </span>
                      <p className="num mt-0.5 text-[0.7rem] text-warn">
                        Missing {entry.missing.join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <SectionHeader
                title="Payslips"
                description={
                  pay.unassigned > 0
                    ? `${pay.inYear.length} in ${pay.taxYear}. ${pay.unassigned} not yet assigned to a person — assign them and they join that person's estimate.`
                    : `${pay.inYear.length} in ${pay.taxYear}.`
                }
              />
              {pay.inYear.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing dated in {pay.taxYear}.</p>
              ) : (
                <PayslipTable payslips={pay.inYear} onEdit={openSheet} />
              )}
            </section>
          </>
        )}

        <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
          Adjusted net income is estimated from payslips and the income streams on file. It is not a
          tax return: dividends, property income and reliefs a payslip never sees can move it.
          Confirm the figure with an accountant before acting on it.
        </p>
      </div>

      <PayslipSheet open={open} onOpenChange={setOpen} payslip={editing} />
    </AppShell>
  );
}
