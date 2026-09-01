import { CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/format";
import { premiumLabel, type Protection } from "@/hooks/useProtection";
import { formatMoney } from "@/lib/format";
import { INSURANCE_TYPE_LABELS, type InsuranceType } from "@/lib/documents/types";
import { cn } from "@/lib/utils";

/**
 * Renewals inside 60 days, and again inside 30.
 *
 * Auto-renewal is where a household quietly overpays; the only cure is being
 * told while there is still time to move.
 */
export function RenewalAlerts({ protection }: { protection: Protection }) {
  const { renewals } = protection;
  if (!renewals.length) return null;

  return (
    <ul className="space-y-2">
      {renewals.map((flag) => {
        const row = flag.row;
        const urgent = flag.band === 30;
        const type =
          INSURANCE_TYPE_LABELS[flag.policy.policy_type as InsuranceType] ??
          flag.policy.policy_type;
        const premium =
          row && row.premium_amount !== null
            ? `${formatMoney(row.premium_amount, row.currency, { decimals: 0 })} ${premiumLabel(row.premium_frequency).toLowerCase()}`
            : null;

        return (
          <li
            key={flag.policy.id}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3",
              urgent ? "border-warn/40 bg-warn/5" : "border-border bg-surface",
            )}
          >
            <CalendarClock
              className={cn("size-4 shrink-0", urgent ? "text-warn" : "text-muted-foreground")}
              strokeWidth={1.5}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                {flag.policy.insurer} · {type}
              </p>
              <p className="text-xs text-muted-foreground">
                {flag.daysAway === 0
                  ? "Renews today"
                  : `Renews in ${flag.daysAway} day${flag.daysAway === 1 ? "" : "s"}`}
                {" · "}
                {formatDate(flag.date, "short")}
                {premium ? ` · ${premium}` : ""}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-px text-[0.6rem] tracking-wide uppercase",
                urgent ? "border-warn/40 text-warn" : "border-border text-muted-foreground",
              )}
            >
              {urgent ? "30 days" : "60 days"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
