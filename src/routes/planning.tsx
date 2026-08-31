import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Baby, Pencil } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BabyCosts } from "@/components/planning/BabyCosts";
import { BabyEventSheet } from "@/components/planning/BabyEventSheet";
import { ChildBenefitPanel } from "@/components/planning/ChildBenefitPanel";
import { ChildcarePlanner } from "@/components/planning/ChildcarePlanner";
import { CliffTracker } from "@/components/planning/CliffTracker";
import { KeyDates } from "@/components/planning/KeyDates";
import { LeavePlanner } from "@/components/planning/LeavePlanner";
import { TaskChecklist } from "@/components/planning/TaskChecklist";
import { useBabyPlan, upcomingTasks } from "@/hooks/useBabyPlan";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/planning")({
  head: () => ({
    meta: [
      { title: "Planning — Ebeid Family Office" },
      {
        name: "description",
        content:
          "The new baby priced properly: maternity pay week by week, funded childcare hours, the £100,000 income cliff, Child Benefit and every statutory date.",
      },
      { property: "og:title", content: "Planning — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Life events modelled against the household's real numbers — statutory pay, childcare funding and the dates that carry money with them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningPage,
});

const DATE_LABEL: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

function countdown(days: number | null) {
  if (days === null) return "—";
  if (days === 0) return "Today";
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 70) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
}

function PlanningPage() {
  const plan = useBabyPlan();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState("dates");

  const { event, keyDates, childcare, income, base } = plan;

  const dueLabel = event
    ? new Date(`${event.expected_date}T00:00:00Z`).toLocaleDateString("en-GB", DATE_LABEL)
    : "—";

  // The single number the leave question turns on: what the household stops
  // being paid across both parents' leave.
  const leaveShortfall = plan.leave.reduce((sum, entry) => sum + entry.summary.shortfall, 0);

  const soon = useMemo(() => upcomingTasks(plan.tasks), [plan.tasks]);
  const openTasks = plan.tasks.filter((task) => task.status !== "done").length;

  const cliffLoud = income.anyOverCeiling || income.anyClose;

  return (
    <AppShell
      title="Planning"
      description="Life events, priced against the household's real numbers."
      actions={
        event ? (
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)} className="min-h-11">
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit event
          </Button>
        ) : null
      }
    >
      {plan.loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="h-80 w-full rounded-lg" />
        </div>
      ) : !event ? (
        <EmptyState
          icon={<Baby className="h-4 w-4" />}
          title="No life event planned yet"
          body="A new baby changes income, outgoings and childcare for years, all hanging off one date. Add the due date and the system works out maternity pay week by week, when funded hours start, what the £100,000 income ceiling would cost you, and every statutory deadline in between."
          action={
            <Button size="sm" onClick={() => setSheetOpen(true)} className="min-h-11">
              <Baby className="mr-1.5 h-3.5 w-3.5" />
              Plan a new baby
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* The four figures the whole plan turns on. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Due date"
              value={<span className="text-base font-light">{dueLabel}</span>}
              definition="Every derived date on this page — qualifying week, MATB1, leave start, funded hours — is calculated from this one date. Change it and they all move."
              sub={countdown(plan.daysToDue)}
              tone="gold"
            />
            <StatTile
              label="Income given up on leave"
              value={formatMoney(leaveShortfall, base, { decimals: 0 })}
              definition="Normal take-home across the leave period, less statutory or enhanced pay actually received. Nought until leave is planned."
              sub={
                plan.leave.length
                  ? `${plan.leave.length} leave plan${plan.leave.length === 1 ? "" : "s"}`
                  : "No leave planned yet"
              }
              tone={leaveShortfall > 0 ? "loss" : "neutral"}
            />
            <StatTile
              label="Childcare, first full year"
              value={
                childcare ? formatMoney(childcare.annual.net, base, { decimals: 0 }) : "Not modelled"
              }
              definition="Nursery fees for twelve months after funded hours begin, less funded hours and Tax-Free Childcare top-up, where the household still qualifies."
              sub={
                childcare
                  ? childcare.eligible
                    ? "After funded hours"
                    : "No funding — income over the ceiling"
                  : "Add a nursery plan"
              }
              tone={childcare && !childcare.eligible ? "loss" : "neutral"}
            />
            <StatTile
              label="Funded hours start"
              value={
                <span className="text-base font-light">
                  {keyDates?.nurseryStart
                    ? new Date(`${keyDates.fundedHoursStart}T00:00:00Z`).toLocaleDateString(
                        "en-GB",
                        { month: "short", year: "numeric" },
                      )
                    : "—"}
                </span>
              }
              definition="England's 30 funded hours begin the term after the child turns nine months, not on the birthday itself. The months between nursery starting and funding beginning are paid in full."
              sub={openTasks ? `${openTasks} tasks outstanding` : "Checklist complete"}
            />
          </div>

          {cliffLoud && (
            <div className="flex items-start gap-3 rounded-lg border border-loss/40 bg-loss/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {income.anyOverCeiling
                    ? "Adjusted net income is over £100,000"
                    : "Adjusted net income is close to £100,000"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {income.anyOverCeiling
                    ? "Funded hours and Tax-Free Childcare are withdrawn entirely at that line — there is no taper. "
                    : "A bonus or a pay rise could cross the line, and there is no taper on the other side. "}
                  {childcare
                    ? `${formatMoney(childcare.atRisk.total, base, { decimals: 0 })} of childcare support turns on it.`
                    : "Model the nursery plan to see what it is worth."}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => setTab("income")}
                  >
                    Open the income tracker
                  </button>
                </p>
              </div>
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="dates" className="gap-1.5">
                Dates
                {soon.length > 0 && (
                  <span className="num rounded-full border border-warn/40 px-1.5 text-[0.6rem] text-warn">
                    {soon.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="leave">Leave</TabsTrigger>
              <TabsTrigger value="childcare">Childcare</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="costs">Costs</TabsTrigger>
            </TabsList>

            <TabsContent value="dates" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <section>
                  <SectionHeader
                    title="Key dates"
                    description="Derived from the due date. The ones marked matter because missing them costs money."
                  />
                  {keyDates ? (
                    <KeyDates dates={keyDates} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Add a due date to see the timeline.</p>
                  )}
                </section>

                <section>
                  <SectionHeader
                    title="What has to be done"
                    description="Statutory paperwork and the deadlines attached to it."
                  />
                  <TaskChecklist
                    event={event}
                    tasks={plan.tasks}
                    nurseryStart={keyDates?.nurseryStart ?? null}
                  />
                </section>
              </div>
            </TabsContent>

            <TabsContent value="leave" className="space-y-4">
              <SectionHeader
                title="Parental leave and pay"
                description="Statutory Maternity Pay is 90% of average weekly earnings for six weeks, then the flat rate for thirty-three. Maternity Allowance is flat throughout. Employer enhancement sits on top."
              />
              <LeavePlanner event={event} leave={plan.leave} base={base} />
            </TabsContent>

            <TabsContent value="childcare" className="space-y-4">
              <SectionHeader
                title="Nursery and funded hours"
                description="Modelled on the real timeline: full fees from the day nursery starts, funding only from the term after the child turns nine months."
              />
              {keyDates ? (
                <ChildcarePlanner
                  event={event}
                  childcare={childcare}
                  childcareRow={plan.childcareRow}
                  keyDates={keyDates}
                  base={base}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="income" className="space-y-6">
              <section>
                <SectionHeader
                  title="The £100,000 line"
                  description="Adjusted net income, not salary. Cross it and funded hours and Tax-Free Childcare go entirely."
                />
                <CliffTracker
                  people={income.people}
                  base={base}
                  taxYear={income.taxYear.label}
                  supportAtRisk={childcare?.atRisk.total ?? 0}
                  anyOverCeiling={income.anyOverCeiling}
                />
              </section>

              <section>
                <SectionHeader
                  title="Child Benefit"
                  description="Worth claiming even when it is fully clawed back — the National Insurance credits come with the claim, not the payment."
                />
                <ChildBenefitPanel
                  assessment={plan.childBenefit}
                  childCount={event.child_count ?? 1}
                  base={base}
                  unrecorded={income.unrecorded}
                />
              </section>
            </TabsContent>

            <TabsContent value="costs" className="space-y-4">
              <SectionHeader
                title="What the baby costs"
                description="Bought-once items become a joint goal; monthly items become outgoings in the forecast, each ending when it actually ends."
              />
              <BabyCosts event={event} base={base} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      <BabyEventSheet open={sheetOpen} onOpenChange={setSheetOpen} event={event} />
    </AppShell>
  );
}
