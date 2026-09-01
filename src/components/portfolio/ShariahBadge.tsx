import { BadgeCheck, Check, CircleHelp, CircleSlash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SHARIAH_STATUSES, type ShariahStatus } from "@/lib/mandates";

const TONES: Record<ShariahStatus, string> = {
  compliant: "border-gain/30 bg-gain/10 text-gain",
  non_compliant: "border-loss/50 bg-loss/15 text-loss",
  unscreened: "border-dashed border-border-strong bg-surface-raised text-muted-foreground",
};

const ICONS: Record<ShariahStatus, typeof BadgeCheck> = {
  compliant: BadgeCheck,
  non_compliant: CircleSlash,
  unscreened: CircleHelp,
};

const SHORT: Record<ShariahStatus, string> = {
  compliant: "Compliant",
  non_compliant: "Not compliant",
  unscreened: "Unscreened",
};

/**
 * A recorded determination, never a computed one. Screening a security against
 * Shariah criteria is a specialist data problem, and a wrong answer here is
 * worse than an honest "unscreened" — so the app only ever shows what somebody
 * in the household actually wrote down.
 */
export function ShariahBadge({
  status,
  className,
  size = "xs",
}: {
  status: ShariahStatus;
  className?: string;
  size?: "sm" | "xs";
}) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium uppercase tracking-[0.1em]",
        size === "sm" ? "px-2.5 py-1 text-[0.62rem]" : "px-1.5 py-0.5 text-[0.58rem]",
        TONES[status],
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      {SHORT[status]}
    </span>
  );
}

/** The same badge, but editable where the household records its own view. */
export function ShariahControl({
  status,
  ticker,
  onChange,
  pending,
  size = "xs",
  className,
}: {
  status: ShariahStatus;
  ticker: string;
  onChange: (status: ShariahStatus) => void;
  pending?: boolean;
  size?: "sm" | "xs";
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={`Shariah status for ${ticker}`}
          className={cn(
            "rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
            className,
          )}
        >
          <ShariahBadge status={status} size={size} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal leading-relaxed text-muted-foreground">
          Your own determination for {ticker}. Nothing is screened automatically.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SHARIAH_STATUSES.map((entry) => (
          <DropdownMenuItem
            key={entry.value}
            onSelect={() => onChange(entry.value)}
            className="text-xs"
          >
            <Check
              className={cn(
                "mr-2 h-3.5 w-3.5",
                entry.value === status ? "text-gold" : "opacity-0",
              )}
            />
            {entry.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
