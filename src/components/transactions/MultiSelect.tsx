import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string; hint?: string };

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  className,
  emptyLabel,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  emptyLabel?: string;
}) {
  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? label)
        : `${label} · ${selected.length}`;

  const toggle = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value],
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded border border-border bg-surface-raised px-2.5 text-xs text-foreground transition-colors hover:border-muted-foreground/40",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="max-w-40 truncate">{summary}</span>
          <ChevronDown className="size-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto p-1.5">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {emptyLabel ?? "Nothing to filter by yet."}
          </p>
        ) : (
          <>
            {selected.length > 0 && (
              <button
                type="button"
                className="mb-1 w-full rounded px-2 py-1 text-left text-[0.7rem] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                onClick={() => onChange([])}
              >
                Clear {label.toLowerCase()}
              </button>
            )}
            <ul className="space-y-0.5">
              {options.map((option) => (
                <li key={option.value}>
                  <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-surface-raised">
                    <Checkbox
                      checked={selected.includes(option.value)}
                      onCheckedChange={() => toggle(option.value)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{option.label}</span>
                      {option.hint && (
                        <span className="block truncate text-[0.65rem] text-muted-foreground">
                          {option.hint}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
