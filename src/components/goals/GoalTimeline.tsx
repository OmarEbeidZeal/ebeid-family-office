import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatReadableMoney } from "@/lib/format";
import { GOAL_STATUS_LABELS, type GoalPlanRow } from "@/lib/goal-math";
import { STATUS_MARKER, STATUS_TONE, priorityMeta } from "./goal-visuals";

const SPAN_MONTHS = 60;

type Placed = {
  row: GoalPlanRow;
  months: number;
  left: number;
  size: number;
  lane: number;
};

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/**
 * The five years ahead, as one picture. Each goal sits at its target date,
 * sized by what it costs and coloured by whether it is going to land. Goals
 * without a date — or beyond the window — are listed alongside rather than
 * placed somewhere invented.
 */
export function GoalTimeline({
  rows,
  base,
  selectedId,
  onSelect,
}: {
  rows: GoalPlanRow[];
  base: string;
  selectedId: string | null;
  onSelect: (goalId: string) => void;
}) {
  const today = useMemo(() => new Date(), []);

  const { placed, beyond, undated, ticks } = useMemo(() => {
    const dated = rows.filter((row) => row.monthsRemaining !== null);
    const within = dated.filter((row) => (row.monthsRemaining ?? 0) <= SPAN_MONTHS);
    const later = dated.filter((row) => (row.monthsRemaining ?? 0) > SPAN_MONTHS);
    const none = rows.filter((row) => row.monthsRemaining === null);

    const maxCost = Math.max(1, ...within.map((row) => row.allIn));

    const ordered = [...within].sort(
      (a, b) => (a.monthsRemaining ?? 0) - (b.monthsRemaining ?? 0),
    );

    // Two lanes, alternating when markers would collide, so labels stay legible.
    let lastLeft = -100;
    let lane = 0;
    const items: Placed[] = ordered.map((row) => {
      const months = Math.max(0, row.monthsRemaining ?? 0);
      const left = (months / SPAN_MONTHS) * 100;
      const ratio = row.allIn > 0 ? row.allIn / maxCost : 0;
      const size = row.allIn > 0 ? 22 + Math.sqrt(ratio) * 30 : 18;
      lane = left - lastLeft < 14 ? (lane === 0 ? 1 : 0) : 0;
      lastLeft = left;
      return { row, months, left, size, lane };
    });

    const tickList = [0, 12, 24, 36, 48, 60].map((month) => {
      const date = new Date(today);
      date.setMonth(date.getMonth() + month);
      return {
        month,
        left: (month / SPAN_MONTHS) * 100,
        label: month === 0 ? "Today" : String(date.getFullYear()),
      };
    });

    return { placed: items, beyond: later, undated: none, ticks: tickList };
  }, [rows, today]);

  if (!rows.length) return null;

  return (
    <section aria-label="Goal timeline" className="panel overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="text-sm text-foreground">The next five years</h2>
        <p className="text-xs text-muted-foreground">
          Each marker is a goal at its target date, sized by cost.
        </p>
      </div>

      <div className="snap-x snap-mandatory overflow-x-auto px-5 pb-5 pt-8">
        <div className="relative min-w-[44rem]">
          {/* Lane one: the earlier of any two colliding goals. */}
          <div className="relative h-[4.75rem]">
            {placed
              .filter((item) => item.lane === 1)
              .map((item) => (
                <Marker
                  key={item.row.goal.id}
                  item={item}
                  base={base}
                  selected={selectedId === item.row.goal.id}
                  onSelect={onSelect}
                  above
                />
              ))}
          </div>

          <div className="relative h-px w-full bg-border">
            {ticks.map((tick) => (
              <div
                key={tick.month}
                className="absolute top-0 -translate-x-1/2"
                style={{ left: `${tick.left}%` }}
              >
                <div
                  className={cn("h-2 w-px", tick.month === 0 ? "bg-gold" : "bg-border-strong")}
                />
                <span
                  className={cn(
                    "mt-1.5 block whitespace-nowrap text-[0.62rem] tracking-[0.12em]",
                    tick.month === 0 ? "text-gold" : "text-muted-foreground",
                  )}
                >
                  {tick.label}
                </span>
              </div>
            ))}
            <div className="absolute -top-16 bottom-0 w-px bg-gold/30" style={{ left: 0 }} />
          </div>

          <div className="relative mt-7 h-[4.75rem]">
            {placed
              .filter((item) => item.lane === 0)
              .map((item) => (
                <Marker
                  key={item.row.goal.id}
                  item={item}
                  base={base}
                  selected={selectedId === item.row.goal.id}
                  onSelect={onSelect}
                />
              ))}
          </div>
        </div>
      </div>

      {(beyond.length > 0 || undated.length > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
          {beyond.map((row) => (
            <OffTimeline
              key={row.goal.id}
              row={row}
              base={base}
              note="beyond five years"
              onSelect={onSelect}
            />
          ))}
          {undated.map((row) => (
            <OffTimeline
              key={row.goal.id}
              row={row}
              base={base}
              note="no target date"
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Marker({
  item,
  base,
  selected,
  onSelect,
  above,
}: {
  item: Placed;
  base: string;
  selected: boolean;
  onSelect: (goalId: string) => void;
  above?: boolean;
}) {
  const tone = STATUS_TONE[item.row.status];
  const priority = priorityMeta(item.row.goal.priority);
  const targetDate = item.row.goal.target_date
    ? new Date(`${item.row.goal.target_date}T00:00:00Z`)
    : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.row.goal.id)}
      style={{ left: `${item.left}%` }}
      className={cn(
        "absolute top-0 flex w-28 -translate-x-1/2 snap-center flex-col items-center gap-1.5 rounded-md p-1 text-center transition-transform hover:-translate-y-0.5 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        above && "flex-col-reverse",
      )}
      aria-label={`${item.row.goal.title}, ${targetDate ? monthLabel(targetDate) : "no date"}, ${
        item.row.allIn > 0 ? formatReadableMoney(item.row.allIn, base) : "unpriced"
      }, ${GOAL_STATUS_LABELS[item.row.status]}`}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full border transition-shadow",
          STATUS_MARKER[tone],
          selected && "ring-2 ring-gold ring-offset-2 ring-offset-surface",
        )}
        style={{ width: item.size, height: item.size }}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", priority.dot)} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="line-clamp-2 text-[0.68rem] leading-tight text-foreground">
          {item.row.goal.title}
        </span>
        <span className="num text-[0.62rem] text-muted-foreground">
          {targetDate ? monthLabel(targetDate) : "—"}
        </span>
      </span>
    </button>
  );
}

function OffTimeline({
  row,
  base,
  note,
  onSelect,
}: {
  row: GoalPlanRow;
  base: string;
  note: string;
  onSelect: (goalId: string) => void;
}) {
  const tone = STATUS_TONE[row.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(row.goal.id)}
      className="hairline flex min-h-9 items-center gap-2 rounded-full bg-surface-raised px-3 text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn("h-2 w-2 rounded-full border", STATUS_MARKER[tone])} />
      <span className="text-foreground">{row.goal.title}</span>
      <span className="num">
        {row.allIn > 0 ? formatReadableMoney(row.allIn, base) : "unpriced"}
      </span>
      <span>· {note}</span>
    </button>
  );
}
