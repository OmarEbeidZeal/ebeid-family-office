import { CheckCircle2, CircleDashed, AlertTriangle, XCircle } from "lucide-react";
import { SettingsCard } from "./SettingsCard";
import { SCHEDULED_JOBS, useLatestRuns, type AutomationRun } from "@/hooks/useAutomation";
import { relativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS = {
  ok: { icon: CheckCircle2, tone: "text-gain", label: "Ran" },
  partial: { icon: AlertTriangle, tone: "text-warn", label: "Ran with problems" },
  skipped: { icon: CircleDashed, tone: "text-muted-foreground", label: "Nothing to do" },
  failed: { icon: XCircle, tone: "text-loss", label: "Failed" },
} as const;

/**
 * Proof that the system works whether or not anyone is watching. Each job
 * reports its own last run, so a schedule that has quietly stopped is visible
 * here rather than only as a gap in the trend chart weeks later.
 */
export function AutomationCard() {
  const { latest, loading } = useLatestRuns();

  return (
    <SettingsCard
      title="Automatic updates"
      description="Six jobs keep the household's figures current on their own. The app still refreshes anything stale when you open it, so these are a floor, not the only path."
    >
      <ul className="space-y-3">
        {SCHEDULED_JOBS.map((job) => (
          <li
            key={job.key}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-[13rem] max-w-lg">
              <p className="text-sm text-foreground">{job.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{job.purpose}</p>
            </div>
            <div className="text-right">
              <p className="eyebrow text-muted-foreground">{job.cadence}</p>
              {loading ? (
                <Skeleton className="mt-1 h-3 w-24" />
              ) : (
                <RunLine run={latest.get(job.key)} overdueAfterHours={job.overdueAfterHours} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

function RunLine({
  run,
  overdueAfterHours,
}: {
  run: AutomationRun | undefined;
  overdueAfterHours: number;
}) {
  if (!run) {
    return (
      <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
        Not run yet. Publish the app once and the schedule starts calling it.
      </p>
    );
  }

  const status = STATUS[run.status as keyof typeof STATUS] ?? STATUS.skipped;
  const Icon = status.icon;
  // A schedule that has quietly stopped should be visible here, not weeks later
  // as a gap in the trend chart.
  const overdue = Date.now() - new Date(run.ran_at).getTime() > overdueAfterHours * 3_600_000;

  const needsExplaining = run.status === "failed" || run.status === "partial";

  return (
    <>
      <p className={cn("mt-1 flex items-center justify-end gap-1.5 text-xs", status.tone)}>
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span>
          {status.label} {relativeTime(run.ran_at)}
        </span>
      </p>
      {/* A failure is only useful if it says what went wrong and what to do. */}
      {needsExplaining && run.message && (
        <p className="ml-auto mt-1 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
          {run.message}
        </p>
      )}
      {overdue && !needsExplaining && (
        <p className="mt-0.5 text-xs text-warn">Overdue — it has missed at least one turn.</p>
      )}
    </>
  );
}
