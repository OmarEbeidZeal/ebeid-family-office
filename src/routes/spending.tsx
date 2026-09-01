import { createFileRoute, Link } from "@tanstack/react-router";
import { PiggyBank } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { IncomeExpenseChart } from "@/components/charts/IncomeExpenseChart";
import { SavingsTrendChart } from "@/components/charts/SavingsTrendChart";
import { CategoryBreakdown } from "@/components/spending/CategoryBreakdown";
import { EssentialSplitPanel } from "@/components/spending/EssentialSplitPanel";
import { GrossFlowsPanel } from "@/components/spending/GrossFlowsPanel";
import { MerchantsPanel } from "@/components/spending/MerchantsPanel";
import { RecurringPanel } from "@/components/spending/RecurringPanel";
import { useObservedSpending } from "@/hooks/useObservedSpending";
import { useScope } from "@/hooks/useScope";
import { formatMoney, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/spending")({
  head: () => ({
    meta: [
      { title: "Spending — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Income against expenses month by month, the essential monthly baseline, standing costs and savings rate — all from imported statements.",
      },
      { property: "og:title", content: "Spending — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Essential versus lifestyle spending, standing costs and savings-rate trend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpendingPage,
});

function SpendingPage() {
  const spending = useObservedSpending();
  const { activeLabel, isHousehold } = useScope();

  const chartMonths = spending.activeMonths;
  const withIncome = chartMonths.filter((month) => month.savingsRate !== null);

  return (
    <AppShell
      title="Spending"
      description={
        isHousehold
          ? "What actually left the accounts, month by month — the baseline every plan is built on."
          : `Spending on ${activeLabel}'s accounts, plus anything held jointly.`
      }
    >
      {spending.loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !spending.hasData ? (
        <EmptyState
          icon={<PiggyBank className="size-4" />}
          title="Spending starts with a statement"
          body="Nothing is estimated here. Import a statement — PDF, CSV or Excel from any UK, Egyptian, Jordanian or US account — and this page fills with your real monthly income, essential baseline, standing costs and savings rate."
          action={
            <Link
              to="/transactions"
              className="inline-flex h-9 items-center rounded-md border border-gold-line bg-gold-soft px-4 text-sm text-gold transition-colors hover:bg-gold/15"
            >
              Import a statement
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <EssentialSplitPanel spending={spending} />
          <GrossFlowsPanel spending={spending} />

          <section className="hairline rounded-lg bg-surface p-5">
            <SectionHeader
              title="Income against spending"
              description={`Each month over the last ${chartMonths.length} with activity. The line is what was left.`}
            />
            {chartMonths.length < 2 ? (
              <p className="py-6 text-sm leading-relaxed text-muted-foreground">
                One month of statements is imported so far. The comparison appears once a second
                month is in — no curve is drawn through a single point.
              </p>
            ) : (
              <>
                <IncomeExpenseChart data={chartMonths} base={spending.base} />
                <div className="mt-3 flex flex-wrap gap-4 text-[0.7rem] text-muted-foreground">
                  <Legend colour="bg-gain/60" label="Money in" />
                  <Legend colour="bg-muted-foreground/40" label="Money out" />
                  <Legend colour="bg-gold" label="Net" />
                </div>
              </>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <CategoryBreakdown spending={spending} />
            <div className="space-y-4">
              <RecurringPanel spending={spending} />
              <MerchantsPanel spending={spending} />
            </div>
          </div>

          <section className="hairline rounded-lg bg-surface p-5">
            <SectionHeader
              title="Burn rate and savings rate"
              description="The share of every month's income that survived it."
              action={
                spending.spendBaseline !== null ? (
                  <p className="num text-xs text-muted-foreground">
                    Typical burn{" "}
                    {formatMoney(spending.spendBaseline, spending.base, { decimals: 0 })}
                    /mo
                    {spending.incomeBaseline
                      ? ` · saving ${formatPercent(
                          ((spending.incomeBaseline - spending.spendBaseline) /
                            spending.incomeBaseline) *
                            100,
                          0,
                        )}`
                      : ""}
                  </p>
                ) : null
              }
            />
            {withIncome.length < 2 ? (
              <p className="py-6 text-sm leading-relaxed text-muted-foreground">
                A savings rate needs income landing in an imported account. Import the statement for
                the account salary is paid into and this trend fills in.
              </p>
            ) : (
              <SavingsTrendChart data={chartMonths} base={spending.base} />
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-4 rounded-full ${colour}`} />
      {label}
    </span>
  );
}
