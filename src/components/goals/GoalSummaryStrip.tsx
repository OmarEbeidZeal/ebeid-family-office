import { formatDate, formatMoney, formatReadableMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The household's whole wish list in four figures: what it all costs, what is
 * already there, what it asks of them every month, and when the last of it is
 * meant to be done.
 */
export function GoalSummaryStrip({
  allIn,
  funded,
  monthly,
  lastCompletion,
  base,
  monthlyNote,
  monthlyTone = "muted",
}: {
  allIn: number;
  funded: number;
  monthly: number;
  lastCompletion: string | null;
  base: string;
  monthlyNote: string;
  monthlyTone?: "muted" | "gain" | "loss" | "warn";
}) {
  const pct = allIn > 0 ? Math.min(100, (funded / allIn) * 100) : 0;

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        <Figure
          label="Everything costs"
          value={allIn > 0 ? formatReadableMoney(allIn, base) : "—"}
          exact={allIn > 0 ? formatMoney(allIn, base, { decimals: 0 }) : undefined}
          note={allIn > 0 ? "all-in, across every open goal" : "nothing priced yet"}
        />
        <Figure
          label="Already saved"
          value={formatReadableMoney(funded, base)}
          exact={formatMoney(funded, base, { decimals: 0 })}
          note={allIn > 0 ? `${pct.toFixed(0)}% of the way there` : "set aside so far"}
        />
        <Figure
          label="Every month"
          value={formatReadableMoney(monthly, base)}
          exact={formatMoney(monthly, base, { decimals: 0 })}
          note={monthlyNote}
          noteTone={monthlyTone}
          tone="gold"
        />
        <Figure
          label="Last goal lands"
          value={lastCompletion ? formatDate(lastCompletion, "short") : "—"}
          note={lastCompletion ? "the far end of the plan" : "add target dates to see this"}
        />
      </div>

      {allIn > 0 && (
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  exact,
  note,
  tone = "default",
  noteTone = "muted",
}: {
  label: string;
  value: string;
  exact?: string | undefined;
  note: string;
  tone?: "default" | "gold";
  noteTone?: "muted" | "gain" | "loss" | "warn";
}) {
  return (
    <div title={exact}>
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "num mt-2 text-2xl font-light tracking-tight",
          tone === "gold" ? "text-gold" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          "mt-1.5 text-xs",
          noteTone === "gain" && "text-gain",
          noteTone === "loss" && "text-loss",
          noteTone === "warn" && "text-warn",
          noteTone === "muted" && "text-muted-foreground",
        )}
      >
        {note}
      </p>
    </div>
  );
}
