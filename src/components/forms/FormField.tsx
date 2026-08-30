import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

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
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
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
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  id?: string;
  disabled?: boolean | undefined;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
