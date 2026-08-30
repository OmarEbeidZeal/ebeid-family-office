import { AlertTriangle } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { PolicyPill } from "@/components/portfolio/PolicyPill";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { POLICY_RULES, type ConcentrationRow } from "@/lib/policy";

function valueLabel(row: ConcentrationRow) {
  if (row.value === null) return "—";
  return row.unit === "pct"
    ? formatPercent(row.value)
    : `${row.value.toFixed(1)} month${row.value === 1 ? "" : "s"}`;
}

function limitLabel(row: ConcentrationRow) {
  if (row.limit === null) return null;
  return row.unit === "pct" ? `limit ${formatPercent(row.limit, 0)}` : `target ${row.limit} months`;
}

/**
 * The page's centre of gravity. Every position and sleeve measured against the
 * written policy, breaches first and impossible to skim past.
 */
export function ConcentrationPanel({
  rows,
  loading,
}: {
  rows: ConcentrationRow[];
  loading?: boolean;
}) {
  const breaches = rows.filter((row) => row.status === "breach");
  const watches = rows.filter((row) => row.status === "watch");
  const unmeasured = rows.filter((row) => row.status === "unknown");

  return (
    <section
      className={cn(
        "rounded-lg bg-surface p-5",
        breaches.length ? "border border-loss/40" : "hairline",
      )}
    >
      <SectionHeader
        title="Concentration against policy"
        description={`Every limit in the investment policy (${POLICY_RULES.length} rules), measured against liquid investable assets rather than total net worth.`}
        action={
          breaches.length > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-loss/50 bg-loss/15 px-3 py-1.5 text-xs font-medium text-loss">
              <AlertTriangle className="h-3.5 w-3.5" />
              {breaches.length} breach{breaches.length === 1 ? "" : "es"}
            </span>
          ) : watches.length > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn">
              {watches.length} approaching a limit
            </span>
          ) : unmeasured.length > 0 ? (
            // Nothing is breaching, but saying "all within policy" would be a
            // claim the missing prices do not support.
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {unmeasured.length} of {rows.length} limits not measurable
            </span>
          ) : rows.length > 0 ? (
            <PolicyPill status="ok" label="All within policy" />
          ) : null
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing to measure yet"
          body="Concentration limits are computed from real positions and real cash. Add holdings and account balances and every policy limit starts reporting here."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => {
            const fill =
              row.value !== null && row.limit
                ? Math.min(100, Math.max(2, (row.value / row.limit) * 100))
                : null;
            return (
              <li
                key={row.key}
                className={cn(
                  "rounded-md border px-3.5 py-3",
                  row.status === "breach"
                    ? "border-loss/45 bg-loss/[0.07]"
                    : row.status === "watch"
                      ? "border-warn/35 bg-warn-soft/60"
                      : "border-border bg-surface-raised/40",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="num text-sm text-foreground">
                      {row.label}
                      <span className="ml-2 text-xs text-muted-foreground">Rule {row.rule}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.sublabel}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num text-sm text-foreground">
                      {valueLabel(row)}
                      {limitLabel(row) && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          / {limitLabel(row)}
                        </span>
                      )}
                    </span>
                    <PolicyPill status={row.status} size="xs" />
                  </div>
                </div>

                {fill !== null && (
                  <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.status === "breach"
                          ? "bg-loss"
                          : row.status === "watch"
                            ? "bg-warn"
                            : "bg-gold",
                      )}
                      style={{ width: `${fill}%` }}
                    />
                  </div>
                )}

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{row.detail}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
