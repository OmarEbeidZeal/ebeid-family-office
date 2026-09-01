import { AlertTriangle, Info } from "lucide-react";
import { Money } from "@/components/Money";
import { ANI_CLIFF } from "@/lib/documents/analysis";
import type { PersonPay } from "@/hooks/usePayInsights";
import { cn } from "@/lib/utils";

const TONE = {
  clear: { bar: "bg-gain", text: "text-gain", label: "Clear of the line" },
  close: { bar: "bg-warn", text: "text-warn", label: "Close to the line" },
  over: { bar: "bg-loss", text: "text-loss", label: "Over the line" },
} as const;

/**
 * One person's running adjusted net income against £100,000.
 *
 * The line matters far more than it looks: crossing it withdraws the personal
 * allowance at 60p in the pound and, from April 2026, the household's funded
 * childcare hours with it. The card therefore always shows the contribution
 * that would bring it back under.
 */
export function AniCard({ person, base }: { person: PersonPay; base: string }) {
  const { ani } = person;

  if (!ani) {
    return (
      <div className="hairline rounded-lg bg-surface p-5">
        <p className="text-sm text-foreground">{person.name}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          No payslips on file for this tax year, so there is no income estimate. Upload a recent
          slip and the year-to-date figures on it do the rest.
        </p>
      </div>
    );
  }

  const tone = TONE[ani.status];
  const filled = Math.min(1, ani.ani / ANI_CLIFF);

  return (
    <div className="hairline rounded-lg bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">{person.name}</p>
          <p className="text-xs text-muted-foreground">
            Adjusted net income, {ani.taxYear} · estimate
          </p>
        </div>
        <span className={cn("text-[0.7rem] tracking-wide uppercase", tone.text)}>{tone.label}</span>
      </div>

      <p className={cn("num mt-3 text-[1.7rem] font-light leading-tight", tone.text)}>
        <Money amount={ani.ani} currency={base} decimals={0} align="left" hideConverted />
      </p>

      <div className="mt-3 space-y-1.5">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${filled * 100}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {ani.headroom >= 0 ? (
            <>
              <Money
                amount={ani.headroom}
                currency={base}
                decimals={0}
                align="left"
                hideConverted
                className="text-xs text-foreground"
              />{" "}
              of headroom below £100,000
            </>
          ) : (
            <>
              <Money
                amount={-ani.headroom}
                currency={base}
                decimals={0}
                align="left"
                hideConverted
                className="text-xs text-loss"
              />{" "}
              above £100,000
            </>
          )}
        </p>
      </div>

      {ani.contributionToClear > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-md border border-warn/40 bg-warn/5 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <p className="text-xs leading-relaxed text-foreground">
            A further{" "}
            <Money
              amount={ani.contributionToClear}
              currency={base}
              decimals={0}
              align="left"
              hideConverted
              className="text-xs text-warn"
            />{" "}
            into a pension before 5 April would bring the estimate back under £100,000. Between
            £100,000 and £125,140 the personal allowance tapers away, so income in that band is
            effectively taxed at 60%.
          </p>
        </div>
      )}

      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Info className="size-3" />
          How this figure was reached
        </summary>
        <ul className="mt-2.5 space-y-1.5 border-l border-border pl-3">
          {ani.basis.map((line) => (
            <li key={line} className="text-[0.7rem] leading-relaxed text-muted-foreground">
              {line}
            </li>
          ))}
          {ani.employers.length > 0 && (
            <li className="text-[0.7rem] leading-relaxed text-muted-foreground">
              Read from {ani.employers.join(", ")}.
            </li>
          )}
        </ul>
      </details>
    </div>
  );
}
