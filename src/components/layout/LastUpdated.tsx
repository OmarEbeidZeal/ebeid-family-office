import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLastRefreshed } from "@/hooks/useAutomation";
import { relativeTime } from "@/lib/format";

/**
 * A stale screen and a current one look identical, which is how someone ends up
 * making a decision on last month's balance. This says, quietly and always,
 * when the figures behind the page were last refreshed — and what refreshed them.
 */
export function LastUpdated() {
  const { at, sources } = useLastRefreshed();
  if (!at) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="-mx-1 -my-0.5 flex items-center gap-1.5 rounded px-1 py-0.5 text-left text-[0.65rem] leading-none text-muted-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span aria-hidden className="h-1 w-1 rounded-full bg-gold/70" />
          <span className="whitespace-nowrap">Updated {relativeTime(at)}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[16rem] py-2">
        <p className="mb-1.5 font-medium text-[0.7rem]">Where these figures come from</p>
        <ul className="space-y-1">
          {sources.map((source) => (
            <li key={source.label} className="flex justify-between gap-4 text-[0.7rem]">
              <span className="text-primary-foreground/70">{source.label}</span>
              <span className="num">{relativeTime(source.at)}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
