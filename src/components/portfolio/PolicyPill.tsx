import { AlertTriangle, CircleHelp, Minus, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type PolicyStatus } from "@/lib/policy";

const TONES: Record<PolicyStatus, string> = {
  ok: "border-gain/30 bg-gain/10 text-gain",
  watch: "border-warn/40 bg-warn-soft text-warn",
  breach: "border-loss/50 bg-loss/15 text-loss",
  unknown: "border-border-strong bg-surface-raised text-muted-foreground",
  not_applicable: "border-border bg-surface-raised text-muted-foreground",
};

const ICONS: Record<PolicyStatus, typeof ShieldCheck> = {
  ok: ShieldCheck,
  watch: TriangleAlert,
  breach: AlertTriangle,
  unknown: CircleHelp,
  not_applicable: Minus,
};

export const POLICY_TEXT_TONE: Record<PolicyStatus, string> = {
  ok: "text-gain",
  watch: "text-warn",
  breach: "text-loss",
  unknown: "text-muted-foreground",
  not_applicable: "text-muted-foreground",
};

/** The one visual language for policy status across portfolio, advisor and briefing. */
export function PolicyPill({
  status,
  label,
  className,
  size = "sm",
}: {
  status: PolicyStatus;
  label?: string;
  className?: string;
  size?: "sm" | "xs";
}) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium uppercase tracking-[0.1em]",
        size === "sm" ? "px-2.5 py-1 text-[0.62rem]" : "px-2 py-0.5 text-[0.58rem]",
        TONES[status],
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
