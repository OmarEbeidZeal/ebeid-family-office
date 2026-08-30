import type { ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The control is nested inside the label so it carries an accessible name
 * without every call site inventing an id. Hints and errors stay outside, so
 * they are read as description rather than as part of the field's name.
 */
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="block font-normal">
        <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
        {children}
      </Label>
      {hint && !error && <p className="text-[0.7rem] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[0.7rem] text-loss">{error}</p>}
    </div>
  );
}

export function SelectNative({
  value,
  onChange,
  options,
  id,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  id?: string;
  disabled?: boolean | undefined;
  className?: string;
}) {
  return (
    <div className="relative w-full">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-7 text-sm text-foreground outline-none transition-colors hover:border-border focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground opacity-60" />
    </div>
  );
}
