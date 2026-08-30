import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  size = "md",
  /** Narrow surfaces (the mobile top bar) only have room for the family name. */
  compact = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "wordmark block",
        size === "sm" && "text-[0.6rem]",
        size === "md" && "text-[0.7rem]",
        size === "lg" && "text-xs",
        compact && "whitespace-nowrap",
        className,
      )}
    >
      {compact ? "Ebeid" : "Ebeid Family Office"}
    </span>
  );
}
