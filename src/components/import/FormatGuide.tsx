import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FORMAT_GUIDE } from "@/lib/import/formats";
import { cn } from "@/lib/utils";

const VERDICT_TONE: Record<string, string> = {
  Best: "border-gold-line bg-gold-soft text-gold",
  "Very good": "border-border text-gain",
  Good: "border-border text-foreground",
  Workable: "border-border text-muted-foreground",
  "Last resort": "border-border text-warn",
};

/**
 * Which export to ask the bank for.
 *
 * Worth being blunt about: the format chosen at the bank's download screen
 * decides whether this app holds an exact ledger or a careful reconstruction.
 * Everything imports — but CAMT.053 imports without a single inference.
 */
export function FormatGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={cn("hairline rounded-lg bg-surface", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-xs text-foreground">
          Which export to choose
          <span className="ml-2 text-muted-foreground">
            CAMT.053 if your bank offers it — it needs no guesswork
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ol className="border-t border-border">
          {FORMAT_GUIDE.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 last:border-0"
            >
              <span className="min-w-32 text-xs text-foreground">{entry.name}</span>
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-px text-[0.6rem] tracking-wide uppercase",
                  VERDICT_TONE[entry.verdict] ?? "border-border text-muted-foreground",
                )}
              >
                {entry.verdict}
              </span>
              <span className="min-w-48 flex-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                {entry.why}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
