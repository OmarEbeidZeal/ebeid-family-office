import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PolicyPill } from "@/components/portfolio/PolicyPill";
import { ShariahBadge } from "@/components/portfolio/ShariahBadge";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  MANDATE_PRESETS,
  type MandateEvaluation,
  type MandateSleeveRow,
} from "@/lib/mandates";
import type { PolicyStatus } from "@/lib/policy";

const BAR_TONE: Record<PolicyStatus, string> = {
  ok: "bg-gold",
  watch: "bg-warn",
  breach: "bg-loss",
  unknown: "bg-border-strong",
  not_applicable: "bg-border-strong",
};

function SleeveBar({ row, base, measurable }: { row: MandateSleeveRow; base: string; measurable: boolean }) {
  const actual = row.actualPct ?? 0;
  const underTarget = row.driftPp !== null && row.driftPp < 0;
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground/90">{row.label}</span>
          {measurable && row.status !== "ok" && row.status !== "not_applicable" && (
            <PolicyPill
              status={row.status}
              size="xs"
              {...(underTarget && row.status !== "unknown" ? { label: "Below target" } : {})}
            />
          )}
        </div>
        <span className="num text-xs text-muted-foreground">
          <span className="text-foreground">
            {row.actualPct === null ? "—" : formatPercent(row.actualPct)}
          </span>
          {" · target "}
          {formatPercent(row.targetPct, 0)}
          {" · "}
          {formatMoney(row.valueBase, base, { decimals: 0 })}
        </span>
      </div>

      <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className={cn("h-full rounded-full", BAR_TONE[row.status])}
          style={{ width: `${Math.max(0, Math.min(100, actual))}%` }}
        />
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-foreground/50"
          style={{ left: `${Math.max(0, Math.min(100, row.targetPct))}%` }}
        />
      </div>

      <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
        {measurable && row.driftPp !== null && Math.abs(row.driftPp) >= 5
          ? `${Math.abs(row.driftPp).toFixed(1)}pp ${row.driftPp > 0 ? "above" : "below"} target — the next contribution should correct it.`
          : row.note}
      </p>
    </li>
  );
}

function Cap({
  label,
  value,
  capPct,
  status,
  prohibitionNote,
}: {
  label: string;
  value: number | null;
  capPct: number;
  status: PolicyStatus;
  prohibitionNote: string;
}) {
  const tone =
    status === "breach" ? "text-loss" : status === "watch" ? "text-warn" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-surface-raised/50 px-3 py-2">
      <p className="eyebrow mb-1">{label}</p>
      <p className={cn("num text-sm", tone)}>{value === null ? "—" : formatPercent(value)}</p>
      <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted-foreground">
        {capPct <= 0 ? prohibitionNote : `Cap ${formatPercent(capPct, 0)}`}
      </p>
    </div>
  );
}

/**
 * One person's mandate: their targets, their caps, their compliance position —
 * measured against their own investable assets. A household average would say
 * nothing useful about a portfolio that cannot hold bonds at all.
 */
export function MandateCard({
  evaluation,
  base,
  onEdit,
}: {
  evaluation: MandateEvaluation;
  base: string;
  onEdit?: (() => void) | undefined;
}) {
  const { mandate, compliance } = evaluation;
  const preset = MANDATE_PRESETS[evaluation.type];
  const shariah = evaluation.type === "shariah";
  const hasHoldings = evaluation.holdingCount > 0;

  return (
    <section className="hairline flex flex-col rounded-lg bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{evaluation.person}</h3>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-medium uppercase tracking-[0.12em]",
                shariah
                  ? "border-gold-line bg-gold-soft text-gold"
                  : "border-border-strong bg-surface-raised text-muted-foreground",
              )}
            >
              {preset.label}
            </span>
            {hasHoldings && <PolicyPill status={evaluation.allocationStatus} size="xs" />}
          </div>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            {preset.summary}
          </p>
        </div>

        {onEdit && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3 w-3" />
            {mandate.recorded ? "Edit" : "Set mandate"}
          </Button>
        )}
      </header>

      {!mandate.recorded && (
        <p className="mt-4 rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          No mandate recorded for {evaluation.person}. The targets below are the household's written
          default, not their own choice — set the mandate so drift is judged against the rules they
          actually invest by.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Measured against{" "}
        <span className="num text-foreground/85">
          {formatMoney(evaluation.investableBase, base, { decimals: 0 })}
        </span>{" "}
        of {evaluation.person}&rsquo;s liquid investable assets ·{" "}
        {evaluation.holdingCount === 0
          ? "no holdings recorded"
          : `${evaluation.holdingCount} holding${evaluation.holdingCount === 1 ? "" : "s"} worth ${formatMoney(evaluation.holdingsValueBase, base, { decimals: 0 })}`}
      </p>

      {evaluation.investableBase <= 0 && hasHoldings && (
        <p className="mt-3 rounded-md border border-warn/35 bg-warn-soft/60 px-3 py-2 text-xs leading-relaxed text-warn">
          Nothing in the household&rsquo;s liquid investable assets is recorded against{" "}
          {evaluation.person}, so their weights cannot be worked out. Set an owner on their accounts
          and holdings.
        </p>
      )}

      {!evaluation.measurable && evaluation.unpricedCount > 0 && (
        <p className="mt-3 rounded-md border border-warn/35 bg-warn-soft/60 px-3 py-2 text-xs leading-relaxed text-warn">
          {evaluation.unpricedCount} of {evaluation.holdingCount} holding
          {evaluation.holdingCount === 1 ? "" : "s"} has no price, so the weights below cover cash
          and priced assets only.
        </p>
      )}

      <ul className="mt-4 space-y-3.5">
        {evaluation.rows.map((row) => (
          <SleeveBar
            key={row.sleeve}
            row={row}
            base={base}
            measurable={evaluation.measurable && evaluation.investableBase > 0}
          />
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Cap
          label="Speculative"
          value={evaluation.speculative.pct}
          capPct={evaluation.speculative.capPct}
          status={evaluation.speculative.status}
          prohibitionNote="No speculative sleeve"
        />
        <Cap
          label="Largest name"
          value={evaluation.largestSingleNamePct}
          capPct={mandate.singleNameCapPct}
          status={
            evaluation.singleNames.find((entry) => entry.status === "breach")
              ? "breach"
              : evaluation.singleNames.find((entry) => entry.status === "watch")
                ? "watch"
                : "ok"
          }
          prohibitionNote="No single speculative names"
        />
        <Cap
          label="Crypto"
          value={evaluation.crypto.pct}
          capPct={evaluation.crypto.capPct}
          status={evaluation.crypto.status}
          prohibitionNote="Not permitted"
        />
      </div>

      {shariah && (
        <div className="mt-4 rounded-md border border-border bg-surface-raised/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Shariah screening</p>
            <PolicyPill status={compliance.status} size="xs" />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {compliance.headline}
          </p>

          {(compliance.nonCompliant.length > 0 || compliance.unscreened.length > 0) && (
            <ul className="mt-2.5 space-y-1.5">
              {[...compliance.nonCompliant, ...compliance.unscreened].map((flag) => (
                <li key={flag.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="num text-foreground/85">{flag.ticker}</span>
                  <span className="flex items-center gap-2">
                    <span className="num text-muted-foreground">
                      {flag.pct === null ? "—" : formatPercent(flag.pct)}
                    </span>
                    <ShariahBadge status={flag.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2.5 text-[0.68rem] leading-relaxed text-muted-foreground">
            Statuses are recorded by hand on each holding. The app never screens a security for you.
          </p>
        </div>
      )}

      {mandate.constraints.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-1.5">Written constraints</p>
          <ul className="space-y-1">
            {mandate.constraints.map((line) => (
              <li
                key={line}
                className="flex gap-2 text-xs leading-relaxed text-muted-foreground before:text-gold before:content-['·']"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mandate.notes && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{mandate.notes}</p>
      )}
    </section>
  );
}
