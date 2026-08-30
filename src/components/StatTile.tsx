import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "gain" | "loss" | "gold";
  loading?: boolean;
}) {
  return (
    <div className="hairline rounded-lg bg-surface p-4">
      <p className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p
          className={cn(
            "num mt-2 text-2xl font-light",
            tone === "gain" && "text-gain",
            tone === "loss" && "text-loss",
            tone === "gold" && "text-gold",
          )}
        >
          {value}
        </p>
      )}
      {sub && !loading && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
