import { CalendarClock, CheckCircle2, CircleDashed, Home, KeyRound } from "lucide-react";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { formatDate } from "@/lib/format";
import { referenceLabel } from "@/lib/documents/redact";
import {
  RENT_FREQUENCY_LABELS,
  TENANCY_ROLE_LABELS,
  type RentFrequency,
  type TenancyRole,
} from "@/lib/documents/types";
import type { TenancyView } from "@/hooks/useTenancyInsights";
import type { TenancyRow } from "@/hooks/useDocuments";
import { cn } from "@/lib/utils";

/**
 * One agreement, read as the household reads it: what it costs, when the
 * decision has to be made, and whether the money is already accounted for
 * elsewhere in the app.
 */
export function TenancyCard({
  view,
  onEdit,
}: {
  view: TenancyView;
  onEdit: (tenancy: TenancyRow) => void;
}) {
  const remove = useDeleteRow("tenancies", "tenancies", "Tenancy");
  const { row, notice } = view;
  const isTenant = row.role === "tenant";
  const days = notice.daysToDecision;
  const urgent = days !== null && days >= 0 && days <= 60;

  return (
    <div className="hairline rounded-lg bg-surface p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-muted-foreground">
          {isTenant ? (
            <Home className="size-4" strokeWidth={1.5} />
          ) : (
            <KeyRound className="size-4" strokeWidth={1.5} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">{row.property_address}</p>
          <p className="text-xs text-muted-foreground">
            {[
              TENANCY_ROLE_LABELS[row.role as TenancyRole] ?? row.role,
              row.term_start ? `From ${formatDate(row.term_start, "short")}` : null,
              row.term_end ? `to ${formatDate(row.term_end, "short")}` : "no end date recorded",
              referenceLabel(row.reference_last4),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {view.monthlyRent !== null ? (
            <>
              <Money amount={view.monthlyRent} currency={row.currency} decimals={0} />
              <p className="text-[0.7rem] text-muted-foreground">
                a month
                {row.rent_frequency !== "monthly" &&
                  ` · ${RENT_FREQUENCY_LABELS[row.rent_frequency as RentFrequency] ?? row.rent_frequency} in the agreement`}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Rent not stated</p>
          )}
        </div>

        <RowActions
          label={row.property_address}
          onEdit={() => onEdit(row)}
          onDelete={() => remove.mutate(row.id)}
          deleteDescription="The agreement stays on the documents shelf. The rent already in the forecast is left alone — remove it there if it no longer applies."
        />
      </div>

      {/* The date that actually decides when the household can move. */}
      {notice.decisionDate && (
        <div
          className={cn(
            "mt-4 flex items-start gap-2.5 rounded-md border px-3 py-2.5",
            urgent ? "border-warn/40 bg-warn/5" : "border-border bg-surface-raised",
          )}
        >
          <CalendarClock
            className={cn("mt-0.5 size-3.5 shrink-0", urgent ? "text-warn" : "text-muted-foreground")}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {days !== null && days >= 0 ? (
              <>
                <span className={cn(urgent ? "text-warn" : "text-foreground")}>
                  {days === 0 ? "Today" : `${days} days`}
                </span>{" "}
                until the last date for {notice.decisionLabel} —{" "}
                {formatDate(notice.decisionDate, "short")}.
              </>
            ) : (
              <>
                The date for {notice.decisionLabel} passed on{" "}
                {formatDate(notice.decisionDate, "short")}.
              </>
            )}
            {notice.noticeMonths !== null &&
              ` ${notice.noticeMonths} month${notice.noticeMonths === 1 ? "" : "s"} of notice is required.`}
          </p>
        </div>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        {row.deposit_amount !== null && (
          <Row label="Deposit">
            <span className="flex items-center gap-2">
              <Money amount={row.deposit_amount} currency={row.currency} decimals={0} />
            </span>
          </Row>
        )}
        {row.deposit_scheme && <Row label="Protected in">{row.deposit_scheme}</Row>}
        {row.break_clause_date && (
          <Row label="Break clause">{formatDate(row.break_clause_date, "short")}</Row>
        )}
        {row.landlord_name && <Row label="Landlord">{row.landlord_name}</Row>}
        {row.agent_name && <Row label="Agent">{row.agent_name}</Row>}
        {row.rent_review_terms && <Row label="Rent review">{row.rent_review_terms}</Row>}
      </dl>

      {/* Where the money has already been wired in — stated, not assumed. */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3">
        <Wired
          on={view.inForecast}
          onText="Rent is in the forecast"
          offText="Rent is not yet an outgoing in the forecast"
        />
        {isTenant && row.deposit_amount !== null && (
          <Wired
            on={view.depositTracked}
            onText="Deposit carried as a recoverable asset"
            offText="Deposit not yet on the balance sheet"
          />
        )}
      </div>

      {row.break_clause_notes && (
        <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
          {row.break_clause_notes}
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}

function Wired({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[0.7rem]">
      {on ? (
        <CheckCircle2 className="size-3 text-gain" />
      ) : (
        <CircleDashed className="size-3 text-muted-foreground" />
      )}
      <span className={on ? "text-muted-foreground" : "text-warn"}>{on ? onText : offText}</span>
    </span>
  );
}
