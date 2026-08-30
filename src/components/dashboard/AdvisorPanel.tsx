import { Link } from "@tanstack/react-router";
import { AlertTriangle, CircleAlert, Info, Sparkles } from "lucide-react";
import type { NetWorthSummary } from "@/hooks/useNetWorth";
import type { AdvisorNoteRow } from "@/hooks/useFinancials";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<string, { icon: typeof Info; tone: string }> = {
  urgent: { icon: AlertTriangle, tone: "text-loss" },
  action: { icon: CircleAlert, tone: "text-warn" },
  info: { icon: Info, tone: "text-muted-foreground" },
};

function ReadinessList({
  summary,
  holdingsCount,
}: {
  summary: NetWorthSummary;
  holdingsCount: number;
}) {
  const readiness = [
    {
      label: "Accounts recorded",
      done: summary.counts.accounts > 0,
      count: summary.counts.accounts,
    },
    { label: "Assets valued", done: summary.counts.assets > 0, count: summary.counts.assets },
    { label: "Income streams", done: summary.counts.income > 0, count: summary.counts.income },
    { label: "Listed holdings", done: holdingsCount > 0, count: holdingsCount },
  ];

  return (
    <ul className="mt-5 grid gap-2 sm:grid-cols-2">
      {readiness.map((item) => (
        <li
          key={item.label}
          className="flex items-center justify-between rounded-md border border-border bg-surface-raised px-3 py-2 text-xs"
        >
          <span className={item.done ? "text-foreground/85" : "text-muted-foreground"}>
            {item.label}
          </span>
          <span className={item.done ? "num text-gold" : "num text-muted-foreground"}>
            {item.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The advisor's presence on the dashboard: unread briefing notes when there
 * are any, and an honest account of what it is still waiting for when there
 * are not. It never improvises a recommendation here.
 */
export function AdvisorPanel({
  summary,
  holdingsCount,
  notes,
}: {
  summary: NetWorthSummary;
  holdingsCount: number;
  notes: AdvisorNoteRow[];
}) {
  const unread = notes.filter((note) => !note.is_read).slice(0, 3);
  const hasNotes = unread.length > 0;

  return (
    <section className="hairline relative overflow-hidden rounded-lg bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-gold">
          <Sparkles className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="eyebrow text-gold">Advisor briefing</p>
            {hasNotes && (
              <span className="rounded-full bg-gold px-1.5 py-px text-[0.58rem] tracking-[0.08em] text-background">
                {notes.filter((note) => !note.is_read).length} new
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground/85">
            {hasNotes
              ? "Findings from your stored position — reserve, allowances, concentration and goal pace."
              : "The advisor reasons only from your stored numbers — liquidity, concentration, goal timelines — and will not comment on a position it cannot price."}
          </p>
        </div>
      </div>

      {hasNotes ? (
        <ul className="mt-4 space-y-2">
          {unread.map((note) => {
            const severity = SEVERITY_TONE[note.severity] ?? SEVERITY_TONE["info"]!;
            const Icon = severity.icon;
            return (
              <li key={note.id}>
                <Link
                  to="/advisor"
                  className="flex items-start gap-2.5 rounded-md border border-border bg-surface-raised px-3 py-2.5 transition-colors hover:border-gold-line"
                >
                  <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", severity.tone)} />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/85">
                    {note.title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ReadinessList summary={summary} holdingsCount={holdingsCount} />
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to="/advisor"
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface-raised px-4 text-sm text-foreground transition-colors hover:border-gold-line hover:text-gold coarse:min-h-11"
        >
          {hasNotes ? "Read the briefing" : "Open the advisor"}
        </Link>
      </div>

      <p className="mt-5 border-t border-border pt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
        This is an information and modelling tool, not regulated financial advice. Confirm decisions
        with an FCA-authorised adviser.
      </p>
    </section>
  );
}
