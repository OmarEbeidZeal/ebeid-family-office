import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { daysUntil, toIso, type IsoDate } from "@/lib/planning/dates";
import type { babyKeyDates } from "@/lib/planning/baby-plan";

type KeyDates = ReturnType<typeof babyKeyDates>;

type Milestone = {
  date: IsoDate;
  label: string;
  detail: string;
  /** True where the date is a deadline rather than an event. */
  deadline: boolean;
};

function buildMilestones(dates: KeyDates): Milestone[] {
  const rows: Milestone[] = [
    {
      date: dates.qualifyingWeek,
      label: "Qualifying week",
      detail:
        "The fifteenth week before the baby is due. Employment and earnings on this date decide whether Statutory Maternity Pay is due at all.",
      deadline: false,
    },
    {
      date: dates.matb1From,
      label: "MATB1 available",
      detail: "The midwife can issue the maternity certificate from twenty weeks before the due date.",
      deadline: false,
    },
    {
      date: dates.notifyEmployerBy,
      label: "Tell the employer",
      detail:
        "Notice of the leave dates must reach the employer by the end of the qualifying week. Late notice can cost the pay.",
      deadline: true,
    },
    {
      date: dates.earliestLeaveStart,
      label: "Earliest leave start",
      detail: "Leave cannot begin more than eleven weeks before the expected week of childbirth.",
      deadline: false,
    },
    {
      date: dates.dueDate,
      label: "Due date",
      detail: "The expected date of birth. Everything above is measured back from it.",
      deadline: false,
    },
    {
      date: dates.registerBirthBy,
      label: "Register the birth",
      detail: "Within forty-two days in England and Wales.",
      deadline: true,
    },
    {
      date: dates.claimChildBenefitBy,
      label: "Claim Child Benefit",
      detail:
        "Claims are only backdated three months. Register even if the charge takes it all back — the National Insurance credits are the point.",
      deadline: true,
    },
  ];

  if (dates.taxFreeChildcareOpenBy) {
    rows.push({
      date: dates.taxFreeChildcareOpenBy,
      label: "Open Tax-Free Childcare",
      detail: "The account takes time to fund and reconfirm, so open it a month before the fees start.",
      deadline: false,
    });
  }

  if (dates.nurseryStart) {
    rows.push({
      date: dates.nurseryStart,
      label: "Nursery starts",
      detail: "The first month is usually a deposit plus fees in advance.",
      deadline: false,
    });
  }

  rows.push(
    {
      date: dates.fundedHoursApplyBy,
      label: "Apply for funded hours",
      detail:
        "The code has to be held before the term starts. Applying in the term itself pushes the funding back a full term.",
      deadline: true,
    },
    {
      date: dates.fundedHoursStart,
      label: "Funded hours begin",
      detail:
        "Thirty funded hours start the term after the child turns nine months: 1 January, 1 April or 1 September.",
      deadline: false,
    },
  );

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function relativeLabel(days: number) {
  if (days === 0) return "Today";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days < 60) return `In ${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `In ${months} month${months === 1 ? "" : "s"}`;
  return `In ${(days / 365.25).toFixed(1)} years`;
}

/**
 * The dates in order, with the ones that cost money if missed marked as such.
 * Nothing here is a reminder the household set — every row is derived from the
 * due date and the statutory rules.
 */
export function KeyDates({ dates }: { dates: KeyDates }) {
  const today = useMemo(() => toIso(new Date()), []);
  const milestones = useMemo(() => buildMilestones(dates), [dates]);
  const nextIndex = milestones.findIndex((row) => daysUntil(row.date, today) >= 0);

  return (
    <ol className="relative space-y-0">
      {milestones.map((row, index) => {
        const days = daysUntil(row.date, today);
        const past = days < 0;
        const isNext = index === nextIndex;
        return (
          <li key={`${row.label}-${row.date}`} className="relative flex gap-4 pb-5 last:pb-0">
            {/* The spine */}
            <div className="relative flex w-4 shrink-0 justify-center">
              {index < milestones.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-4 h-full w-px bg-border"
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                  past
                    ? "border-border bg-surface-raised text-muted-foreground"
                    : row.deadline
                      ? "border-loss/60 bg-loss/15"
                      : "border-gold-line bg-gold-soft",
                  isNext && "ring-2 ring-gold/30",
                )}
              >
                {past && <Check className="h-2 w-2" />}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p
                  className={cn(
                    "text-sm",
                    past ? "text-muted-foreground" : "text-foreground",
                    isNext && "font-medium",
                  )}
                >
                  {row.label}
                </p>
                {row.deadline && !past && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-loss/40 bg-loss/10 px-1.5 py-0.5 text-[0.62rem] uppercase tracking-wider text-loss">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Deadline
                  </span>
                )}
              </div>
              <p className="num mt-0.5 text-xs text-muted-foreground">
                {formatDate(row.date, "short")} · {relativeLabel(days)}
              </p>
              <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground/80">
                {row.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
