import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeMeta } from "@/lib/themes";

/**
 * A theme, drawn rather than named. The tile is a miniature of the interface —
 * ground, a raised card on it, a hairline, the accent — so the choice is made
 * by looking rather than by reading a list of words.
 */
export function ThemeTile({
  label,
  note,
  swatch,
  secondSwatch,
  selected,
  onSelect,
}: {
  label: string;
  note: string;
  swatch: ThemeMeta["swatch"];
  /** Set for "Match system": the right half previews the light counterpart. */
  secondSwatch?: ThemeMeta["swatch"] | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-gold bg-gold-soft"
          : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <span className="relative block overflow-hidden rounded-md border" aria-hidden>
        <span className="flex h-[4.25rem]">
          <Preview swatch={swatch} wide={!secondSwatch} />
          {secondSwatch && <Preview swatch={secondSwatch} wide={false} />}
        </span>
      </span>

      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-sm text-foreground">{label}</span>
          <span className="mt-0.5 block text-[0.7rem] leading-snug text-muted-foreground">
            {note}
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-gold bg-gold text-primary-foreground" : "border-border-strong",
          )}
        >
          {selected && <Check className="size-2.5" strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}

function Preview({ swatch, wide }: { swatch: ThemeMeta["swatch"]; wide: boolean }) {
  return (
    <span
      className={cn("relative block h-full", wide ? "w-full" : "w-1/2")}
      style={{ background: swatch.ground }}
    >
      <span
        className="absolute inset-x-1.5 bottom-1.5 top-1.5 rounded-[3px] border"
        style={{ background: swatch.raised, borderColor: swatch.border }}
      >
        <span
          className="absolute left-1.5 right-1.5 top-1.5 block h-1 rounded-full"
          style={{ background: swatch.text, opacity: 0.85 }}
        />
        <span
          className="absolute left-1.5 top-3.5 block h-1 w-1/2 rounded-full"
          style={{ background: swatch.text, opacity: 0.35 }}
        />
        <span
          className="absolute bottom-1.5 left-1.5 block h-1.5 w-6 rounded-full"
          style={{ background: swatch.accent }}
        />
      </span>
    </span>
  );
}
