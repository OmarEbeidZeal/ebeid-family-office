import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { NetWorthSummary } from "@/hooks/useNetWorth";

/**
 * A quiet placeholder until the advisor has real holdings and prices to
 * reason about. It states plainly what it is waiting for — it never
 * improvises a recommendation.
 */
export function AdvisorPanel({
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
    <section className="hairline relative overflow-hidden rounded-lg bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-line bg-gold-soft text-gold">
          <Sparkles className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-gold">Advisor briefing</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/85">
            The advisor activates once accounts and holdings are in. It reasons only from your
            stored numbers — liquidity, concentration, goal timelines — and will not comment on a
            position it cannot price.
          </p>
        </div>
      </div>

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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to="/advisor"
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface-raised px-4 text-sm text-foreground transition-colors hover:border-gold-line hover:text-gold"
        >
          How the advisor will work
        </Link>
      </div>

      <p className="mt-5 border-t border-border pt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
        This is an information and modelling tool, not regulated financial advice. Confirm decisions
        with an FCA-authorised adviser.
      </p>
    </section>
  );
}
