import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { ONBOARDING_STEPS } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export function OnboardingLayout({
  stepIndex,
  furthestStep,
  onJump,
  onDefer,
  children,
}: {
  stepIndex: number;
  furthestStep: number;
  onJump: (index: number) => void;
  onDefer: () => void;
  children: ReactNode;
}) {
  const current = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark />
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onDefer}
        >
          Finish later
        </Button>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-5 pb-24 pt-4 sm:px-8 lg:grid-cols-[13rem_1fr] lg:gap-14">
        <nav aria-label="Setup progress" className="min-w-0 lg:pt-2">
          <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0">

            {ONBOARDING_STEPS.map((step, index) => {
              const done = index < furthestStep;
              const active = index === stepIndex;
              const reachable = index <= furthestStep;
              return (
                <li key={step.key} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => onJump(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                      active
                        ? "bg-gold-soft text-gold"
                        : reachable
                          ? "text-muted-foreground hover:text-foreground"
                          : "text-muted-foreground/50",
                    )}
                  >
                    <span
                      className={cn(
                        "num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem]",
                        active
                          ? "border-gold text-gold"
                          : done
                            ? "border-gain text-gain"
                            : "border-border",
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span className="whitespace-nowrap">{step.title}</span>

                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-w-0">
          <p className="eyebrow text-muted-foreground">
            Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
          </p>
          <h1 className="mt-2 text-2xl font-light tracking-tight text-foreground sm:text-3xl">
            {current.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {current.blurb}
          </p>
          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function StepFooter({
  onBack,
  onNext,
  nextLabel = "Continue",
  submit,
  pending,
  hint,
}: {
  onBack?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  nextLabel?: string;
  submit?: boolean;
  pending?: boolean;
  hint?: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      <div>
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
        )}
        {hint && <p className="mt-1 text-[0.7rem] text-muted-foreground">{hint}</p>}
      </div>
      <Button
        type={submit ? "submit" : "button"}
        size="sm"
        onClick={submit ? undefined : onNext}
        disabled={pending}
      >
        {pending ? "Saving…" : nextLabel}
      </Button>
    </div>
  );
}

export function AddedList({
  items,
  emptyLabel,
  onRemove,
}: {
  items: { id: string; title: string; subtitle?: string; value?: ReactNode }[];
  emptyLabel: string;
  onRemove: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <p className="hairline rounded-lg bg-surface px-4 py-5 text-center text-xs text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="hairline divide-y divide-border overflow-hidden rounded-lg bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{item.title}</p>
            {item.subtitle && (
              <p className="truncate text-[0.7rem] text-muted-foreground">{item.subtitle}</p>
            )}
          </div>
          {item.value}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[0.7rem] text-muted-foreground hover:text-loss"
            onClick={() => onRemove(item.id)}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}
