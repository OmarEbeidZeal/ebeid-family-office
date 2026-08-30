import { useEffect, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/advisor/Markdown";

/** The household's own words, kept visually distinct from the advisor's. */
export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm border border-gold-line bg-gold-soft px-4 py-2.5 text-sm leading-relaxed text-foreground">
        {content}
      </div>
    </div>
  );
}

/**
 * The reasoning summary. Open while the model is still thinking so the wait is
 * legible, folded away once the answer starts — the answer is the point.
 */
function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(live);

  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);

  if (!text.trim()) return null;

  return (
    <div className="mb-3 rounded-md border border-border bg-surface-raised/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className={cn("h-3.5 w-3.5", live && "animate-pulse text-gold")} strokeWidth={1.6} />
        {live ? "Thinking" : "Thinking · how it got here"}
        <ChevronDown
          className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Markdown className="text-xs text-muted-foreground">{text}</Markdown>
        </div>
      )}
    </div>
  );
}

export function AssistantMessage({
  content,
  reasoning,
  live = false,
}: {
  content: string;
  reasoning?: string | null;
  live?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-[0.6rem] font-medium tracking-[0.08em] text-gold sm:flex">
        EFO
      </span>
      <div className="min-w-0 flex-1">
        {reasoning ? <Reasoning text={reasoning} live={live && !content} /> : null}
        {content ? (
          <Markdown>{content}</Markdown>
        ) : live ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
            Reading your position…
          </p>
        ) : null}
        {live && content ? (
          <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-gold align-middle" />
        ) : null}
      </div>
    </div>
  );
}
