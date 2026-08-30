import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  HelpCircle,
  PauseCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GOAL_STATUS_LABELS, type GoalStatus } from "@/lib/goal-math";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STYLES: Record<GoalStatus, { className: string; icon: typeof CheckCircle2 }> = {
  achieved: { className: "border-gain/30 bg-gain/10 text-gain", icon: CheckCircle2 },
  on_track: { className: "border-gain/30 bg-gain/10 text-gain", icon: CheckCircle2 },
  behind: { className: "border-warn/30 bg-warn/10 text-warn", icon: Clock },
  at_risk: { className: "border-loss/30 bg-loss/10 text-loss", icon: AlertTriangle },
  unpriced: {
    className: "border-border-strong bg-surface-raised text-muted-foreground",
    icon: CircleDashed,
  },
  undated: {
    className: "border-border-strong bg-surface-raised text-muted-foreground",
    icon: HelpCircle,
  },
  paused: {
    className: "border-border-strong bg-surface-raised text-muted-foreground",
    icon: PauseCircle,
  },
};

export function GoalStatusPill({
  status,
  reason,
  className,
}: {
  status: GoalStatus;
  reason?: string;
  className?: string;
}) {
  const style = STYLES[status];
  const Icon = style.icon;
  const pill = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.08em]",
        style.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {GOAL_STATUS_LABELS[status]}
    </span>
  );

  if (!reason) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="cursor-help">
          {pill}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[18rem] text-xs leading-relaxed">
        {reason}
      </TooltipContent>
    </Tooltip>
  );
}
