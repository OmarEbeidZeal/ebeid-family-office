import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";
import { CURRENCIES, formatDate, formatMoney } from "@/lib/format";
import { FUNDED_HOURS_PER_WEEK, FUNDED_WEEKS_PER_YEAR } from "@/lib/planning/uk-2026";
import { cn } from "@/lib/utils";
import type { BabyPlan } from "@/hooks/useBabyPlan";
import type { ChildcarePlanRow, LifeEventRow } from "@/hooks/useFinancials";

const PROVIDERS = [
  { value: "nursery", label: "Nursery" },
  { value: "childminder", label: "Childminder" },
  { value: "nanny", label: "Nanny" },
];

function ChildcareSheet({
  open,
  onOpenChange,
  event,
  row,
  suggestedStart,
  baseCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: LifeEventRow;
  row: ChildcarePlanRow | null;
  suggestedStart: string;
  baseCurrency: string;
}) {
  const { household } = useAuth();
  const queryClient = useQueryClient();

  const [providerType, setProviderType] = useState("nursery");
  const [startsOn, setStartsOn] = useState("");
  const [hours, setHours] = useState("40");
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [weeks, setWeeks] = useState("51");
  const [extras, setExtras] = useState("");
  const [taxFree, setTaxFree] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProviderType(row?.provider_type ?? "nursery");
    setStartsOn(row?.starts_on ?? suggestedStart);
    setHours(String(Number(row?.hours_per_week ?? 40)));
    setRate(row && Number(row.hourly_rate) ? String(Number(row.hourly_rate)) : "");
    setCurrency(row?.currency ?? baseCurrency);
    setWeeks(String(row?.weeks_per_year ?? 51));
    setExtras(row && Number(row.monthly_extras) ? String(Number(row.monthly_extras)) : "");
    setTaxFree(row?.tax_free_childcare ?? true);
    setError(null);
  }, [open, row, suggestedStart, baseCurrency]);

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        provider_type: providerType,
        starts_on: startsOn,
        hours_per_week: Math.max(0, Number(hours) || 0),
        hourly_rate: Math.max(0, Number(rate) || 0),
        currency,
        weeks_per_year: Math.max(1, Math.round(Number(weeks) || 51)),
        monthly_extras: Math.max(0, Number(extras) || 0),
        tax_free_childcare: taxFree,
      };
      if (row) {
        const { error: updateError } = await db
          .from("childcare_plans")
          .update(values)
          .eq("id", row.id);
        if (updateError) throw updateError;
        return;
      }
      const { error: insertError } = await db.from("childcare_plans").insert({
        ...values,
        household_id: household!.id,
        life_event_id: event.id,
      });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["childcare_plans"] });
      toast.success("Childcare saved");
      onOpenChange(false);
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={row ? "Edit childcare" : "Plan childcare"}
      description="What the place actually costs, and the month it starts being paid for."
      pending={save.isPending}
      submitLabel={row ? "Save" : "Add childcare"}
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        if (!startsOn) return setError("A start date is needed — funding is dated, not aged.");
        setError(null);
        save.mutate();
      }}
      footerNote="Funded hours cover thirty hours a week for thirty-eight weeks of the year. Anything beyond that, and everything in the holidays, is charged at the full rate."
    >
      <FullRow>
        <Field label="Provider">
          <SelectNative value={providerType} onChange={setProviderType} options={PROVIDERS} />
        </Field>
      </FullRow>

      <Field label="Starts on" error={error ?? undefined}>
        <Input type="date" value={startsOn} onChange={(input) => setStartsOn(input.target.value)} />
      </Field>

      <Field label="Currency">
        <SelectNative
          value={currency}
          onChange={setCurrency}
          options={CURRENCIES.map((code) => ({ value: code, label: code }))}
        />
      </Field>

      <Field label="Hours a week">
        <Input
          inputMode="decimal"
          value={hours}
          onChange={(input) => setHours(input.target.value)}
        />
      </Field>

      <Field label="Hourly rate">
        <Input
          inputMode="decimal"
          value={rate}
          onChange={(input) => setRate(input.target.value)}
          placeholder="0.00"
        />
      </Field>

      <Field label="Weeks a year" hint="Most nurseries charge fifty-one.">
        <Input inputMode="decimal" value={weeks} onChange={(input) => setWeeks(input.target.value)} />
      </Field>

      <Field label="Monthly extras" hint="Meals, nappies, consumables. Funding never covers these.">
        <Input
          inputMode="decimal"
          value={extras}
          onChange={(input) => setExtras(input.target.value)}
          placeholder="0.00"
        />
      </Field>

      <FullRow>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2.5">
          <span className="text-xs text-muted-foreground">
            Use Tax-Free Childcare — the government adds £2 for every £8, up to £2,000 a year
          </span>
          <Switch checked={taxFree} onCheckedChange={setTaxFree} />
        </label>
      </FullRow>
    </FormSheet>
  );
}

/**
 * Childcare on the real timeline.
 *
 * The expensive part is not the headline rate — it is the window between the
 * day the place starts and the day funding actually arrives, which is the
 * term after the child turns nine months rather than the day they do.
 */
export function ChildcarePlanner({
  event,
  childcare,
  childcareRow,
  keyDates,
  base,
}: {
  event: LifeEventRow;
  childcare: BabyPlan["childcare"];
  childcareRow: ChildcarePlanRow | null;
  keyDates: NonNullable<BabyPlan["keyDates"]>;
  base: string;
}) {
  const [open, setOpen] = useState(false);

  if (!childcare || !childcareRow) {
    return (
      <>
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-sm text-foreground">No childcare planned yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Funded hours arrive on {formatDate(keyDates.fundedHoursStart, "medium")} — the term
            after the child turns nine months, not the day they do. Add the nursery's real rate to
            see what the gap before then costs.
          </p>
          <Button size="sm" className="mt-3 min-h-11" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Plan childcare
          </Button>
        </div>
        <ChildcareSheet
          open={open}
          onOpenChange={setOpen}
          event={event}
          row={null}
          suggestedStart={keyDates.ninthMonth}
          baseCurrency={base}
        />
      </>
    );
  }

  const monthlyFull = childcare.annualWithoutHelp.net / 12;
  const monthlyFunded = childcare.annual.net / 12;
  const gap = childcare.gap;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm capitalize text-foreground">
              {childcareRow.provider_type} from {formatDate(childcareRow.starts_on, "short")}
            </p>
            <p className="num mt-0.5 text-xs text-muted-foreground">
              {Number(childcareRow.hours_per_week)} hrs/wk ·{" "}
              {formatMoney(Number(childcareRow.hourly_rate), childcareRow.currency)}/hr ·{" "}
              {childcareRow.weeks_per_year} weeks a year
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setOpen(true)} aria-label="Edit childcare">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-loss/30 bg-loss/5 p-3">
            <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              Before funding
            </p>
            <p className="num mt-1 text-xl font-light text-foreground">
              {formatMoney(monthlyFull, base, { decimals: 0 })}
              <span className="ml-1 text-xs text-muted-foreground">/mo</span>
            </p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {formatDate(childcareRow.starts_on, "short")} to{" "}
              {formatDate(keyDates.fundedHoursStart, "short")}
            </p>
          </div>
          <div
            className={cn(
              "rounded-md border p-3",
              childcare.eligible ? "border-gain/30 bg-gain/5" : "border-border bg-surface-raised",
            )}
          >
            <p className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              {childcare.eligible ? "With funded hours" : "Funding withdrawn"}
            </p>
            <p className="num mt-1 text-xl font-light text-foreground">
              {formatMoney(monthlyFunded, base, { decimals: 0 })}
              <span className="ml-1 text-xs text-muted-foreground">/mo</span>
            </p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {childcare.eligible
                ? `From ${formatDate(keyDates.fundedHoursStart, "short")}`
                : "One of you is over £100,000, so nothing is funded"}
            </p>
          </div>
        </div>

        {gap && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-gold-line bg-gold-soft px-3 py-2.5">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            <p className="text-xs leading-relaxed text-foreground">
              <span className="num">{gap.months}</span> month{gap.months === 1 ? "" : "s"} at the
              full rate before funding starts —{" "}
              <span className="num text-gold">
                {formatMoney(gap.total, base, { decimals: 0 })}
              </span>{" "}
              in total. This is the part most plans miss.
            </p>
          </div>
        )}

        <dl className="mt-4 grid gap-3 border-t border-border pt-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Billed a year</dt>
            <dd className="num mt-0.5 text-foreground">
              {formatMoney(childcare.annual.gross, base, { decimals: 0 })}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              Funded hours ({FUNDED_HOURS_PER_WEEK}h × {FUNDED_WEEKS_PER_YEAR}wk)
            </dt>
            <dd className="num mt-0.5 text-gain">
              {childcare.eligible
                ? `−${formatMoney(childcare.annual.funded, base, { decimals: 0 })}`
                : "Withdrawn"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tax-Free Childcare</dt>
            <dd className="num mt-0.5 text-gain">
              {childcare.eligible && childcare.annual.taxFree > 0
                ? `−${formatMoney(childcare.annual.taxFree, base, { decimals: 0 })}`
                : childcareRow.tax_free_childcare
                  ? "Withdrawn"
                  : "Not used"}
            </dd>
          </div>
        </dl>

        {childcare.lostToCliff && (
          <p className="mt-3 text-xs leading-relaxed text-loss">
            Being over £100,000 costs this household{" "}
            {formatMoney(childcare.atRisk.total, base, { decimals: 0 })} a year in childcare
            support alone.
          </p>
        )}
      </div>

      <ChildcareSheet
        open={open}
        onOpenChange={setOpen}
        event={event}
        row={childcareRow}
        suggestedStart={keyDates.ninthMonth}
        baseCurrency={base}
      />
    </div>
  );
}
