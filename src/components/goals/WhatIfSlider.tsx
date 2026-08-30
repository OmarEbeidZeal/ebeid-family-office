import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The only control on the goals page that changes anything: move the monthly
 * contribution and every completion date moves with it. Nothing is saved —
 * this is a question, not a plan change.
 */
export function WhatIfSlider({
  value,
  onChange,
  max,
  base,
  actual,
  actualLabel,
  effect,
  effectTone = "muted",
  dirty,
  onReset,
}: {
  value: number;
  onChange: (value: number) => void;
  max: number;
  base: string;
  actual: number | null;
  actualLabel: string;
  effect: string;
  effectTone?: "muted" | "gain" | "warn" | "loss";
  dirty: boolean;
  onReset: () => void;
}) {
  const step = max > 20000 ? 250 : max > 5000 ? 50 : 25;

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">What if we put aside</p>
          <p className="num mt-2 text-3xl font-light tracking-tight text-gold">
            {formatMoney(value, base, { decimals: 0 })}
            <span className="text-base text-muted-foreground">/mo</span>
          </p>
        </div>
        {dirty && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset} className="min-h-11">
            Back to {actualLabel.toLowerCase()}
          </Button>
        )}
      </div>

      <Slider
        value={[Math.min(value, max)]}
        min={0}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next ?? 0)}
        aria-label="Monthly contribution to goals"
        className="mt-6"
      />

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="num text-muted-foreground">{formatMoney(0, base, { decimals: 0 })}</span>
        <span
          className={cn(
            effectTone === "gain" && "text-gain",
            effectTone === "warn" && "text-warn",
            effectTone === "loss" && "text-loss",
            effectTone === "muted" && "text-muted-foreground",
          )}
        >
          {effect}
        </span>
        <span className="num text-muted-foreground">{formatMoney(max, base, { decimals: 0 })}</span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {actual === null
          ? `${actualLabel} is unknown — import statements or record income and outgoings to anchor this against real cashflow.`
          : `${actualLabel} today is ${formatMoney(actual, base, { decimals: 0 })} a month. Moving this slider only models the plan; nothing is saved.`}
      </p>
    </section>
  );
}
