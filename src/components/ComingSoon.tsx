import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

/**
 * Sections that are scheduled but not built. Honest about what is coming
 * rather than showing an empty shell or invented data.
 */
export function ComingSoon({
  headline,
  body,
  bullets,
  requires,
}: {
  headline: string;
  body: string;
  bullets: string[];
  requires?: string;
}) {
  return (
    <div className="hairline rounded-lg bg-surface p-6 sm:p-10">
      <div className="max-w-2xl">
        <p className="eyebrow text-gold">Next build</p>
        <h2 className="mt-3 text-lg font-light tracking-tight text-foreground sm:text-xl">
          {headline}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>

        <ul className="mt-6 space-y-2.5">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 text-sm text-foreground/85">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.6} />
              <span className="leading-relaxed">{bullet}</span>
            </li>
          ))}
        </ul>

        {requires && (
          <p className="mt-6 rounded-md border border-border bg-surface-raised px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {requires}
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface-raised px-4 text-sm text-foreground transition-colors hover:border-gold-line hover:text-gold"
          >
            Back to dashboard
          </Link>
          <Link
            to="/balance-sheet"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Keep the balance sheet current
          </Link>
        </div>
      </div>
    </div>
  );
}
