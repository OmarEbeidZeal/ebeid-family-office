import { CheckCircle2, CircleDashed, AlertTriangle, XCircle } from "lucide-react";
import { SettingsCard } from "./SettingsCard";
import { SCHEDULED_JOBS, useLatestRuns, type AutomationRun } from "@/hooks/useAutomation";
import { relativeTime } from "@/lib/format";
import { jobHealth, type JobHealth } from "@/lib/automation-status";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Presentation for each state the shared health rule can return. */
const LOOK: Record<JobHealth["state"], { icon: typeof CheckCircle2; tone: string }> = {
  failing: { icon: XCircle, tone: "text-loss" },
  problem: { icon: AlertTriangle, tone: "text-warn" },
  overdue: { icon: AlertTriangle, tone: "text-warn" },
  ok: { icon: CheckCircle2, tone: "text-gain" },
  quiet: { icon: CircleDashed, tone: "text-muted-foreground" },
  never: { icon: CircleDashed, tone: "text-muted-foreground" },
};

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
  // The job's own last recorded run decides, never the scheduler's opinion of
  // the HTTP call: a route that answered 404 for a fortnight was reported as
  // succeeding throughout.
  const health = jobHealth(run, overdueAfterHours);
  const look = LOOK[health.state];
  const Icon = look.icon;

  return (
    <>
      <p className={cn("mt-1 flex items-center justify-end gap-1.5 text-xs", look.tone)}>
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span>
          {health.label}
          {run ? ` ${relativeTime(run.ran_at)}` : ""}
        </span>
      </p>
      {health.message && (
        <p
          className={cn(
            "ml-auto mt-1 max-w-[18rem] text-xs leading-relaxed",
            health.state === "failing" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {health.message}
        </p>
      )}
    </>
  );
}
