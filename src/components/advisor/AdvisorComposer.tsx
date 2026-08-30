import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The composer. Enter sends, Shift+Enter breaks the line, and the box grows
 * with the question rather than hiding it behind a scrollbar.
 */
export function AdvisorComposer({
  onSend,
  onStop,
  busy,
  disabled,
  placeholder,
  draft,
  onDraftChange,
}: {
  onSend: (message: string) => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  draft: string;
  onDraftChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [draft]);

  const submit = () => {
    const value = draft.trim();
    if (!value || busy || disabled) return;
    onSend(value);
    onDraftChange("");
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface transition-colors",
        focused ? "border-gold-line" : "border-border",
      )}
    >
      <textarea
        ref={ref}
        value={draft}
        rows={1}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1.5">
        <p className="hidden text-[0.68rem] text-muted-foreground sm:block">
          Grounded in your stored balances, holdings and goals — never in guessed prices.
        </p>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3 text-xs text-foreground transition-colors hover:border-loss/50 hover:text-loss"
          >
            <Square className="h-3 w-3" fill="currentColor" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || disabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gold text-background transition-opacity disabled:opacity-30"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
