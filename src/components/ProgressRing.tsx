import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/useMotion";

type Tone = "gold" | "gain" | "loss" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  gold: "text-gold",
  gain: "text-gain",
  loss: "text-loss",
  muted: "text-muted-foreground",
};

/**
 * A goal's funding, drawn rather than tabulated. The ring is the first thing
 * the eye lands on in a goal card, so it carries the progress and nothing else;
 * the exact figures sit beside it in text.
 */
export function ProgressRing({
  value,
  size = 96,
  stroke = 6,
  tone = "gold",
  label,
  caption,
  className,
  ariaLabel,
}: {
  /** 0–100. Values above 100 fill the ring completely. */
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: string;
  caption?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const [drawn, setDrawn] = useState(reduced ? clamped : 0);

  useEffect(() => {
    if (reduced) {
      setDrawn(clamped);
      return;
    }
    const frame = requestAnimationFrame(() => setDrawn(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped, reduced]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - drawn / 100);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(clamped)}% funded`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-raised"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("stroke-current transition-[stroke-dashoffset] duration-700 ease-out", TONE_CLASS[tone])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && (
          <span className={cn("num text-sm font-light leading-none", TONE_CLASS[tone])}>
            {label}
          </span>
        )}
        {caption && (
          <span className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
