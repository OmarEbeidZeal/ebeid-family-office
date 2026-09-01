import { ArrowLeftRight } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ObservedSpending } from "@/hooks/useObservedSpending";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Gross flows against true spending.
 *
 * The statements show far more money moving than the household actually
 * spends: sweeps between their own accounts, Flex drawdowns and repayments,
 * Omar paying himself from an account that was never imported. Netting all of
 * that off is right for every plan built on this page — and it leaves a figure
 * that will not reconcile against a bank statement, which is unsettling when
 * nobody says why.
 *
 * So both are shown, with the difference named.
 */
export function GrossFlowsPanel({ spending }: { spending: ObservedSpending }) {
  const { grossOutBaseline, grossInBaseline, spendBaseline, incomeBaseline, base } = spending;

  if (grossOutBaseline === null || spendBaseline === null) return null;

  const internalOut = Math.max(0, grossOutBaseline - spendBaseline);
  const internalIn = Math.max(0, (grossInBaseline ?? 0) - (incomeBaseline ?? 0));
  const internal = internalOut + internalIn;
  const share = grossOutBaseline > 0 ? (internalOut / grossOutBaseline) * 100 : 0;

  return (
    <section className="hairline rounded-lg bg-surface p-5">
      <SectionHeader
        title="Gross flows and true spending"
        description="Typical month. The first is what the statements show moving; the second is what actually left the household."
      />

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
        <Flow
          label="Gross out"
          value={grossOutBaseline}
          base={base}
          tone="text-foreground/85"
          hint="Every debit on every imported account, including money moved to your own pots and Flex repayments."
        />
        <Flow
          label="True spending"
          value={spendBaseline}
          base={base}
          tone="text-foreground"
          hint="Gross out, less internal movement between your own accounts and less financing. This is the figure the runway, the baseline and the forecast use."
        />
        <Flow
          label="Internal movement"
          value={internal}
          base={base}
          tone="text-muted-foreground"
          hint="Transfers between your own accounts, self-payments recognised by name, and Monzo Flex drawdowns and repayments — counted as neither income nor spending."
        />
      </div>

      {share > 0 && (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ArrowLeftRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
          <span>
            {formatPercent(share, 0)} of everything leaving your accounts in a typical month is
            money moving between them, not money spent.
          </span>
        </p>
      )}
    </section>
  );
}

function Flow({
  label,
  value,
  base,
  tone,
  hint,
}: {
  label: string;
  value: number;
  base: string;
  tone: string;
  hint: string;
}) {
  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="cursor-help text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">{hint}</TooltipContent>
      </Tooltip>
      <p className={cn("num mt-1.5 text-2xl font-light tracking-tight", tone)}>
        {formatMoney(value, base, { decimals: 0 })}
        <span className="ml-1 text-xs text-muted-foreground">/mo</span>
      </p>
    </div>
  );
}
