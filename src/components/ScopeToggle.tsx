import { cn } from "@/lib/utils";
import { useScope } from "@/hooks/useScope";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Household / Me / partner perspective. Every page reads the active scope from
 * the same context, so switching here re-frames the whole system.
 */
export function ScopeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { scope, setScope, options } = useScope();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-surface p-0.5",
        className,
      )}
      role="tablist"
      aria-label="Perspective"
    >
      {options.map((option) => {
        const active = option.id === scope;
        const button = (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => !option.disabled && setScope(option.id)}
            className={cn(
              "flex min-h-11 items-center rounded-[4px] px-3 text-xs transition-colors lg:min-h-0 lg:px-2.5 lg:py-1",
              active
                ? "bg-gold-soft text-gold"
                : "text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-muted-foreground",
            )}
          >
            {compact ? option.short : option.label}
          </button>
        );

        if (!option.hint) return button;
        return (
          <Tooltip key={option.id}>
            <TooltipTrigger asChild>
              <span className="inline-flex">{button}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[15rem] text-xs leading-relaxed">
              {option.hint}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
