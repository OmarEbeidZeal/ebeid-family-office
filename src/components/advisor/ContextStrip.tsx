import { AlertTriangle, CheckCircle2, CircleAlert, Database } from "lucide-react";
import type { HouseholdContext } from "@/lib/household-context";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What the advisor can actually see. Trust in the answers depends on the
 * household knowing which numbers went in — and which are missing.
 */
export function ContextStrip({
  context,
  base,
  loading,
}: {
  context: HouseholdContext;
  base: string;
  loading: boolean;
}) {
  const money = (value: number | null) =>
    value === null ? "—" : formatMoney(value, base, { decimals: 0 });

  const breaches = context.policy.filter((finding) => finding.status === "breach").length;
  const watches = context.policy.filter((finding) => finding.status === "watch").length;
  const monthsOfData = context.cashflow.months_of_statement_data;

  const items: { label: string; value: string; tone?: string | undefined }[] = [
    { label: "Net worth", value: money(context.net_worth.total) },
    { label: "Investable", value: money(context.investable.total) },
    {
      label: "Reserve",
      value:
        context.liquidity.months_covered === null
          ? "Unknown"
          : `${context.liquidity.months_covered} mo`,
      tone:
        context.liquidity.months_covered === null
          ? "text-muted-foreground"
          : context.liquidity.months_covered >= context.liquidity.target_months
            ? "text-gain"
            : "text-warn",
    },
    { label: "Holdings", value: `${context.holdings.length}` },
    { label: "Goals", value: `${context.goals.length}` },
    {
      label: "Spending history",
      value: monthsOfData ? `${monthsOfData} mo` : "None",
      tone: monthsOfData ? undefined : "text-muted-foreground",
    },
  ];

  return (
    <section className="hairline rounded-lg bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
          <Database className="h-3.5 w-3.5" strokeWidth={1.6} />
          {loading ? "Reading your position…" : "The advisor is reading"}
        </span>
        {breaches > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-loss/50 bg-loss/15 px-2.5 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-loss">
            <AlertTriangle className="h-3 w-3" />
            {breaches} breach{breaches === 1 ? "" : "es"}
          </span>
        ) : watches > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-2.5 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-warn">
            <CircleAlert className="h-3 w-3" />
            {watches} to watch
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gain/30 bg-gain/10 px-2.5 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-gain">
            <CheckCircle2 className="h-3 w-3" />
            Within policy
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
              {item.label}
            </dt>
            <dd className={cn("num mt-0.5 text-sm text-foreground", item.tone)}>
              {loading ? <span className="skeleton block h-4 w-16 rounded" /> : item.value}
            </dd>
          </div>
        ))}
      </dl>

      {!context.market_data.available && (
        <p className="mt-3 border-t border-border pt-2.5 text-[0.7rem] leading-relaxed text-warn">
          {context.market_data.note} The advisor will reason from cost and weights, and will not
          quote a price.
        </p>
      )}
    </section>
  );
}
