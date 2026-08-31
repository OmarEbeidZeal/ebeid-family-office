import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Pencil, Plus, TrendingDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useOwners, memberName } from "@/hooks/useOwners";
import { useIncomeStreams, type LifeEventRow } from "@/hooks/useFinancials";
import { SCHEME_TO_DB, type BabyPlan } from "@/hooks/useBabyPlan";
import { db } from "@/lib/db";
import { formatDate, formatMoney, monthlyEquivalent } from "@/lib/format";
import {
  LEAVE_SCHEME_LABELS,
  entitlementWeeks,
  type LeaveScheme,
  type LeaveWeek,
} from "@/lib/planning/parental-leave";
import { addWeeks } from "@/lib/planning/dates";
import { cn } from "@/lib/utils";

type LeaveEntry = BabyPlan["leave"][number];

const SCHEME_OPTIONS: { value: LeaveScheme; label: string }[] = [
  { value: "smp", label: LEAVE_SCHEME_LABELS.smp },
  { value: "maternity_allowance", label: LEAVE_SCHEME_LABELS.maternity_allowance },
  { value: "paternity", label: LEAVE_SCHEME_LABELS.paternity },
  { value: "unpaid", label: LEAVE_SCHEME_LABELS.unpaid },
];

const SCHEME_NOTE: Record<LeaveScheme, string> = {
  smp: "Six weeks at 90% of average weekly earnings, then thirty-three weeks at the lower of £194.32 or 90%. The last thirteen weeks of the year are unpaid.",
  maternity_allowance:
    "Thirty-nine weeks at the lower of £194.32 or 90% of average weekly earnings, from the start. Paid by the Jobcentre, not the employer.",
  paternity: "Two weeks at the lower of £194.32 or 90% of average weekly earnings.",
  unpaid: "No statutory payment at all.",
};

/** Pay steps, collapsed: consecutive weeks at the same figure become one band. */
function payBands(schedule: LeaveWeek[]) {
  const bands: { from: number; to: number; weekly: number; startDate: string }[] = [];
  for (const week of schedule) {
    const last = bands[bands.length - 1];
    if (last && Math.abs(last.weekly - week.total) < 0.005) {
      last.to = week.week;
      continue;
    }
    bands.push({ from: week.week, to: week.week, weekly: week.total, startDate: week.startDate });
  }
  return bands;
}

function LeaveSheet({
  open,
  onOpenChange,
  event,
  entry,
  takenProfileIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: LifeEventRow;
  entry: LeaveEntry | null;
  takenProfileIds: string[];
}) {
  const { household } = useAuth();
  const { members } = useOwners();
  const { convert, base } = useCurrency();
  const streamsQuery = useIncomeStreams();
  const queryClient = useQueryClient();

  const [profileId, setProfileId] = useState("");
  const [scheme, setScheme] = useState<LeaveScheme>("smp");
  const [streamId, setStreamId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weeks, setWeeks] = useState("39");
  const [awe, setAwe] = useState("");
  const [enhanced, setEnhanced] = useState(false);
  const [fullPayWeeks, setFullPayWeeks] = useState("0");
  const [halfPayWeeks, setHalfPayWeeks] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const row = entry?.row;
    setProfileId(row?.profile_id ?? "");
    setScheme(entry?.plan.scheme ?? "smp");
    setStreamId(row?.income_stream_id ?? "");
    setStartDate(row?.leave_start_date ?? "");
    setWeeks(String(row?.leave_weeks ?? 39));
    setAwe(row?.average_weekly_earnings === null || row === undefined ? "" : String(Number(row.average_weekly_earnings)));
    setEnhanced(row?.employer_enhanced ?? false);
    setFullPayWeeks(String(row?.enhanced_full_pay_weeks ?? 0));
    setHalfPayWeeks(String(row?.enhanced_half_pay_weeks ?? 0));
    setError(null);
  }, [open, entry]);

  const memberOptions = useMemo(
    () => [
      { value: "", label: "Choose a person" },
      ...members
        .filter((member) => member.id === entry?.row.profile_id || !takenProfileIds.includes(member.id))
        .map((member) => ({ value: member.id, label: memberName(member) })),
    ],
    [members, takenProfileIds, entry?.row.profile_id],
  );

  const streamOptions = useMemo(() => {
    const rows = (streamsQuery.data ?? []).filter(
      (row) => !profileId || row.owner_profile_id === profileId || row.owner_profile_id === null,
    );
    return [
      { value: "", label: "Not linked — leave will not change the forecast" },
      ...rows.map((row) => ({
        value: row.id,
        label: `${row.label} · ${formatMoney(
          monthlyEquivalent(convert(Number(row.gross_amount), row.currency, base), row.frequency),
          base,
          { decimals: 0 },
        )}/mo gross`,
      })),
    ];
  }, [streamsQuery.data, profileId, convert, base]);

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        profile_id: profileId,
        income_stream_id: streamId || null,
        scheme: SCHEME_TO_DB[scheme],
        leave_start_date: startDate,
        leave_weeks: Math.max(0, Math.round(Number(weeks) || 0)),
        average_weekly_earnings: awe.trim() === "" ? null : Math.max(0, Number(awe) || 0),
        employer_enhanced: enhanced,
        enhanced_full_pay_weeks: enhanced ? Math.max(0, Math.round(Number(fullPayWeeks) || 0)) : 0,
        enhanced_half_pay_weeks: enhanced ? Math.max(0, Math.round(Number(halfPayWeeks) || 0)) : 0,
      };
      if (entry) {
        const { error: updateError } = await db
          .from("parental_leave_plans")
          .update(values)
          .eq("id", entry.row.id);
        if (updateError) throw updateError;
        return;
      }
      const { error: insertError } = await db.from("parental_leave_plans").insert({
        ...values,
        household_id: household!.id,
        life_event_id: event.id,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parental_leave_plans"] });
      toast.success("Leave saved");
      onOpenChange(false);
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const entitlement = entitlementWeeks(scheme);

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? `Edit ${entry.personLabel}'s leave` : "Add leave"}
      description="What the household actually intends to take, and what it will be paid while taking it."
      pending={save.isPending}
      submitLabel={entry ? "Save" : "Add leave"}
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (!profileId) return setError("Choose whose leave this is.");
        if (!startDate) return setError("A start date is needed to place the pay drop in time.");
        setError(null);
        save.mutate();
      }}
      footerNote={SCHEME_NOTE[scheme]}
    >
      <FullRow>
        <Field label="Whose leave" error={error ?? undefined}>
          <SelectNative value={profileId} onChange={setProfileId} options={memberOptions} />
        </Field>
      </FullRow>

      <FullRow>
        <Field label="Scheme">
          <SelectNative
            value={scheme}
            onChange={(value) => {
              const next = value as LeaveScheme;
              setScheme(next);
              setWeeks(String(next === "paternity" ? 2 : 39));
            }}
            options={SCHEME_OPTIONS}
          />
        </Field>
      </FullRow>

      <Field label="Leave starts">
        <Input type="date" value={startDate} onChange={(input) => setStartDate(input.target.value)} />
      </Field>

      <Field label="Weeks taken" hint={`Entitlement is ${entitlement} weeks of leave.`}>
        <Input
          type="number"
          min={0}
          max={entitlement}
          value={weeks}
          onChange={(input) => setWeeks(input.target.value)}
        />
      </Field>

      <FullRow>
        <Field
          label="Income stream this interrupts"
          hint="Without this link the forecast keeps paying the full salary through the leave."
        >
          <SelectNative value={streamId} onChange={setStreamId} options={streamOptions} />
        </Field>
      </FullRow>

      <FullRow>
        <Field
          label="Average weekly earnings"
          hint="Gross, over the eight weeks to the qualifying week. Left blank, the linked salary is used."
        >
          <Input
            inputMode="decimal"
            value={awe}
            onChange={(input) => setAwe(input.target.value)}
            placeholder="From the linked salary"
          />
        </Field>
      </FullRow>

      <FullRow>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2.5">
          <span className="text-xs text-muted-foreground">
            Employer enhances the statutory pay
          </span>
          <Switch checked={enhanced} onCheckedChange={setEnhanced} />
        </label>
      </FullRow>

      {enhanced && (
        <>
          <Field label="Weeks at full pay">
            <Input
              type="number"
              min={0}
              value={fullPayWeeks}
              onChange={(input) => setFullPayWeeks(input.target.value)}
            />
          </Field>
          <Field label="Then weeks at half pay">
            <Input
              type="number"
              min={0}
              value={halfPayWeeks}
              onChange={(input) => setHalfPayWeeks(input.target.value)}
            />
          </Field>
        </>
      )}
    </FormSheet>
  );
}

function LeaveCard({
  entry,
  base,
  onEdit,
  onDelete,
}: {
  entry: LeaveEntry;
  base: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bands = useMemo(() => payBands(entry.schedule), [entry.schedule]);
  const { summary, plan } = entry;
  const peak = Math.max(entry.normalMonthly, ...bands.map((band) => (band.weekly * 52) / 12), 1);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">{entry.personLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {LEAVE_SCHEME_LABELS[plan.scheme]} · {plan.leaveWeeks} weeks from{" "}
            {formatDate(plan.leaveStartDate, "short")}
            {summary.returnDate ? ` · back ${formatDate(summary.returnDate, "short")}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit leave">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Remove leave">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Paid over the leave</dt>
          <dd className="num mt-0.5 text-sm text-foreground">
            {formatMoney(summary.totalReceived, base, { decimals: 0 })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Normally would be</dt>
          <dd className="num mt-0.5 text-sm text-muted-foreground">
            {formatMoney(summary.totalNormal, base, { decimals: 0 })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Income given up</dt>
          <dd className="num mt-0.5 text-sm text-loss">
            {formatMoney(summary.shortfall, base, { decimals: 0 })}
          </dd>
        </div>
      </dl>

      {!entry.stream && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[0.7rem] leading-relaxed text-warn">
          <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
          No income stream is linked, so the forecast still pays this salary in full through the
          leave. Link one to see the real dip.
        </p>
      )}

      {/* The steps, drawn to scale against normal monthly pay. */}
      <div className="mt-4 space-y-1.5">
        {bands.map((band) => {
          const monthly = (band.weekly * 52) / 12;
          return (
            <div key={`${band.from}-${band.to}`} className="flex items-center gap-3">
              <span className="num w-24 shrink-0 text-[0.7rem] text-muted-foreground">
                {band.from === band.to ? `Wk ${band.from}` : `Wk ${band.from}–${band.to}`}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-sm bg-surface-sunken">
                <div
                  className={cn(
                    "h-full rounded-sm",
                    band.weekly === 0
                      ? "bg-loss"
                      : monthly >= entry.normalMonthly - 1
                        ? "bg-gain"
                        : "bg-gold",
                  )}
                  style={{ width: `${Math.max(1, (monthly / peak) * 100)}%` }}
                />
              </div>
              <span className="num w-28 shrink-0 text-right text-[0.7rem] text-foreground">
                {band.weekly === 0
                  ? "Unpaid"
                  : `${formatMoney(band.weekly, base, { decimals: 0 })}/wk`}
              </span>
              <span className="num hidden w-24 shrink-0 text-right text-[0.7rem] text-muted-foreground sm:block">
                {formatDate(band.startDate, "short")}
              </span>
            </div>
          );
        })}
      </div>

      {summary.unpaidFromWeek !== null && (
        <p className="mt-3 flex items-start gap-2 text-[0.7rem] leading-relaxed text-muted-foreground">
          <CalendarOff className="mt-0.5 h-3 w-3 shrink-0 text-loss" />
          Pay stops at week {summary.unpaidFromWeek} —{" "}
          {formatDate(addWeeks(plan.leaveStartDate, summary.unpaidFromWeek - 1), "short")}. From
          there the leave is funded entirely from savings.
        </p>
      )}
    </div>
  );
}

/**
 * Who takes leave, for how long, and what the household is paid while they do.
 *
 * Statutory pay is not a percentage cut — it is a series of steps, and the
 * steps land on specific dates. Both are drawn here because the month pay
 * falls to £194.32 a week is the month the plan has to survive.
 */
export function LeavePlanner({
  event,
  leave,
  base,
}: {
  event: LifeEventRow;
  leave: LeaveEntry[];
  base: string;
}) {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveEntry | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("parental_leave_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parental_leave_plans"] });
      toast.success("Leave removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const taken = leave.map((entry) => entry.row.profile_id).filter((id): id is string => !!id);

  return (
    <div className="space-y-3">
      {leave.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-sm text-foreground">No leave planned yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Add the maternity leave first. Statutory pay drops twice — after six weeks and again
            after thirty-nine — and both drops belong in the forecast before they arrive.
          </p>
          <Button
            size="sm"
            className="mt-3 min-h-11"
            onClick={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add leave
          </Button>
        </div>
      ) : (
        <>
          {leave.map((entry) => (
            <LeaveCard
              key={entry.row.id}
              entry={entry}
              base={base}
              onEdit={() => {
                setEditing(entry);
                setSheetOpen(true);
              }}
              onDelete={() => remove.mutate(entry.row.id)}
            />
          ))}
          <Button
            size="sm"
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add another person's leave
          </Button>
        </>
      )}

      <LeaveSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        event={event}
        entry={editing}
        takenProfileIds={taken}
      />
    </div>
  );
}
