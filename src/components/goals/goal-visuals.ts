import type { GoalStatus } from "@/lib/goal-math";

/**
 * One place decides what a goal looks like, so the timeline marker, the
 * progress ring and the card edge never disagree about a goal's state.
 */
export const STATUS_TONE: Record<GoalStatus, "gain" | "warn" | "loss" | "muted"> = {
  achieved: "gain",
  on_track: "gain",
  behind: "warn",
  at_risk: "loss",
  unpriced: "muted",
  undated: "muted",
  paused: "muted",
};

export const STATUS_MARKER: Record<"gain" | "warn" | "loss" | "muted", string> = {
  gain: "bg-gain/15 border-gain text-gain",
  warn: "bg-warn/15 border-warn text-warn",
  loss: "bg-loss/15 border-loss text-loss",
  muted: "bg-surface-raised border-border-strong text-muted-foreground",
};

export const RING_TONE: Record<
  "gain" | "warn" | "loss" | "muted",
  "gain" | "gold" | "loss" | "muted"
> = {
  gain: "gain",
  warn: "gold",
  loss: "loss",
  muted: "muted",
};

export type PriorityKey = "must_have" | "want" | "nice_to_have";

export const PRIORITY_META: Record<
  PriorityKey,
  { label: string; short: string; edge: string; dot: string; badge: string }
> = {
  must_have: {
    label: "Must have",
    short: "Must",
    edge: "before:bg-gold",
    dot: "bg-gold",
    badge: "border-gold-line bg-gold-soft text-gold",
  },
  want: {
    label: "Want",
    short: "Want",
    edge: "before:bg-border-strong",
    dot: "bg-border-strong",
    badge: "border-border-strong bg-surface-raised text-foreground",
  },
  nice_to_have: {
    label: "Nice to have",
    short: "Nice",
    edge: "before:bg-transparent",
    dot: "border border-border-strong bg-transparent",
    badge: "border-border bg-transparent text-muted-foreground",
  },
};

export function priorityMeta(priority: string) {
  return PRIORITY_META[
    (priority as PriorityKey) in PRIORITY_META ? (priority as PriorityKey) : "want"
  ];
}
