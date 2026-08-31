import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Check, ChevronDown, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/FormField";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { CHILDCARE_INCOME_CEILING } from "@/lib/planning/uk-2026";
import { adjustedNetIncome } from "@/lib/planning/thresholds";
import { cn } from "@/lib/utils";
import type { PersonIncome } from "@/hooks/useBabyPlan";
import type { TaxAllowanceRow } from "@/hooks/useFinancials";

type Draft = {
  gross_salary: string;
  bonus: string;
  other_taxable_income: string;
  pension_sacrifice: string;
  gift_aid: string;
};

const toDraft = (row: TaxAllowanceRow | null): Draft => ({
  gross_salary: row && Number(row.gross_salary) ? String(Number(row.gross_salary)) : "",
  bonus: row && Number(row.bonus) ? String(Number(row.bonus)) : "",
  other_taxable_income:
    row && Number(row.other_taxable_income) ? String(Number(row.other_taxable_income)) : "",
  pension_sacrifice:
    row && Number(row.pension_sacrifice) ? String(Number(row.pension_sacrifice)) : "",
  gift_aid: row && Number(row.gift_aid) ? String(Number(row.gift_aid)) : "",
});

const numeric = (value: string) => {
  const parsed = Number(value);
  return value.trim() === "" || !Number.isFinite(parsed) || parsed < 0 ? 0 : parsed;
};

/** The bar: how close this person is to the line, drawn to scale. */
function CliffBar({ ani, base }: { ani: number; base: string }) {
  const ceiling = CHILDCARE_INCOME_CEILING;
  const scaleMax = Math.max(ceiling * 1.25, ani * 1.05);
  const width = Math.min(100, (ani / scaleMax) * 100);
  const linePosition = (ceiling / scaleMax) * 100;
  const over = ani > ceiling;

  return (
    <div className="mt-3">
      <div className="relative h-2.5 w-full overflow-hidden rounded-sm bg-surface-sunken">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500",
            over ? "bg-loss" : ani > ceiling * 0.9 ? "bg-gold" : "bg-gain",
          )}
          style={{ width: `${width}%` }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 w-px bg-foreground/70"
          style={{ left: `${linePosition}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[0.65rem] text-muted-foreground">
        <span className="num">{formatMoney(ani, base, { decimals: 0 })}</span>
        <span className="num">£100,000 line</span>
      </div>
    </div>
  );
}

function PersonPanel({
  person,
  base,
  taxYear,
  supportAtRisk,
}: {
  person: PersonIncome;
  base: string;
  taxYear: string;
  supportAtRisk: number;
}) {
  const { household } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(person.ani === null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(person.row));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setDraft(toDraft(person.row));
  }, [person.row, touched]);

  const preview = adjustedNetIncome({
    grossSalary: numeric(draft.gross_salary),
    bonus: numeric(draft.bonus),
    otherTaxableIncome: numeric(draft.other_taxable_income),
    pensionContributions: numeric(draft.pension_sacrifice),
    giftAid: numeric(draft.gift_aid),
  });

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        gross_salary: numeric(draft.gross_salary),
        bonus: numeric(draft.bonus),
        other_taxable_income: numeric(draft.other_taxable_income),
        pension_sacrifice: numeric(draft.pension_sacrifice),
        gift_aid: numeric(draft.gift_aid),
      };
      if (person.row) {
        const { error } = await db.from("tax_allowances").update(values).eq("id", person.row.id);
        if (error) throw error;
        return;
      }
      const { error } = await db.from("tax_allowances").insert({
        ...values,
        household_id: household!.id,
        profile_id: person.profileId,
        tax_year: taxYear,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax_allowances"] });
      queryClient.invalidateQueries({ queryKey: ["household-context"] });
      setTouched(false);
      toast.success(`${person.name}'s income recorded`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const set = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setTouched(true);
  };

  const cliff = person.cliff;
  const status = cliff?.status ?? "unknown";

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface p-4",
        status === "over"
          ? "border-loss/50"
          : status === "close"
            ? "border-gold-line"
            : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">{person.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {person.ani === null
              ? `No income recorded for ${taxYear} — the threshold cannot be tested.`
              : status === "over"
                ? `Over the line by ${formatMoney(Math.abs(cliff!.headroom), base, { decimals: 0 })}.`
                : status === "close"
                  ? `${formatMoney(cliff!.headroom, base, { decimals: 0 })} of headroom — a bonus could cross it.`
                  : `${formatMoney(cliff!.headroom, base, { decimals: 0 })} below the line.`}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-[0.65rem] uppercase tracking-wider",
            status === "over"
              ? "bg-loss/15 text-loss"
              : status === "close"
                ? "bg-gold-soft text-gold"
                : status === "clear"
                  ? "bg-gain/10 text-gain"
                  : "bg-surface-raised text-muted-foreground",
          )}
        >
          {status === "over" ? (
            <AlertOctagon className="h-3 w-3" />
          ) : status === "close" ? (
            <TriangleAlert className="h-3 w-3" />
          ) : status === "clear" ? (
            <Check className="h-3 w-3" />
          ) : null}
          {status === "over"
            ? "Support withdrawn"
            : status === "close"
              ? "Close to the line"
              : status === "clear"
                ? "Clear"
                : "Unknown"}
        </span>
      </div>

      {person.ani !== null && <CliffBar ani={person.ani} base={base} />}

      {cliff && cliff.status === "over" && (
        <div className="mt-3 rounded-md border border-loss/30 bg-loss/5 p-3">
          <p className="text-xs leading-relaxed text-foreground">
            A pension contribution of{" "}
            <span className="num text-loss">
              {formatMoney(cliff.contributionToClear, base, { decimals: 0 })}
            </span>{" "}
            brings the adjusted net income back under £100,000.
          </p>
          <dl className="mt-2 grid gap-2 text-[0.7rem] text-muted-foreground sm:grid-cols-3">
            <div>
              <dt>Income tax saved</dt>
              <dd className="num mt-0.5 text-foreground">
                {formatMoney(cliff.taxSaved, base, { decimals: 0 })}
              </dd>
            </div>
            <div>
              <dt>Childcare support restored</dt>
              <dd className="num mt-0.5 text-foreground">
                {formatMoney(cliff.supportRecovered, base, { decimals: 0 })}
              </dd>
            </div>
            <div>
              <dt>Return on the contribution</dt>
              <dd className="num mt-0.5 text-gold">
                {(cliff.effectiveReturn * 100).toFixed(0)}%
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            Every pound between £100,000 and £125,140 is taxed at an effective 60% as the personal
            allowance tapers away, and the childcare support goes at the first pound over. The
            money is not lost — it is redirected into the pension.
          </p>
        </div>
      )}

      {cliff && cliff.status === "close" && supportAtRisk > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          A bonus of {formatMoney(cliff.headroom, base, { decimals: 0 })} would cost{" "}
          {formatMoney(supportAtRisk, base, { decimals: 0 })} of childcare support on top of the
          tax. Sacrificing the excess into the pension is usually the cheaper answer.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-3 inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        {open ? "Hide the figures" : person.ani === null ? "Record the income" : "Adjust the figures"}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Gross salary">
              <Input
                inputMode="decimal"
                value={draft.gross_salary}
                onChange={(input) => set("gross_salary", input.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Bonus">
              <Input
                inputMode="decimal"
                value={draft.bonus}
                onChange={(input) => set("bonus", input.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Other taxable income" hint="Rent, dividends, interest.">
              <Input
                inputMode="decimal"
                value={draft.other_taxable_income}
                onChange={(input) => set("other_taxable_income", input.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Pension contributions" hint="Salary sacrifice or relief at source.">
              <Input
                inputMode="decimal"
                value={draft.pension_sacrifice}
                onChange={(input) => set("pension_sacrifice", input.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Gift Aid donations" hint="Grossed up at the basic rate.">
              <Input
                inputMode="decimal"
                value={draft.gift_aid}
                onChange={(input) => set("gift_aid", input.target.value)}
                placeholder="0"
              />
            </Field>
            <div className="flex flex-col justify-end">
              <p className="text-xs text-muted-foreground">Adjusted net income</p>
              <p
                className={cn(
                  "num mt-1 text-lg font-light",
                  preview > CHILDCARE_INCOME_CEILING ? "text-loss" : "text-foreground",
                )}
              >
                {formatMoney(preview, base, { decimals: 0 })}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => save.mutate()} disabled={!touched || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The £100,000 cliff, stated as loudly as it deserves.
 *
 * One pound over and the funded hours and Tax-Free Childcare go entirely —
 * not tapered, withdrawn. It is tested on each parent separately, on adjusted
 * net income rather than salary, which is why the figures are entered here in
 * the parts that actually make up the measure.
 */
export function CliffTracker({
  people,
  base,
  taxYear,
  supportAtRisk,
  anyOverCeiling,
}: {
  people: PersonIncome[];
  base: string;
  taxYear: string;
  supportAtRisk: number;
  anyOverCeiling: boolean;
}) {
  return (
    <div className="space-y-3">
      {anyOverCeiling && supportAtRisk > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-loss/50 bg-loss/10 p-4">
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
          <div>
            <p className="text-sm text-foreground">
              Funded hours and Tax-Free Childcare are withdrawn.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              One parent is over £100,000 of adjusted net income, so the childcare plan below is
              priced at the full rate — {formatMoney(supportAtRisk, base, { decimals: 0 })} a year
              more than it would otherwise cost. The forecast reflects this.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {people.map((person) => (
          <PersonPanel
            key={person.profileId}
            person={person}
            base={base}
            taxYear={taxYear}
            supportAtRisk={supportAtRisk}
          />
        ))}
      </div>
    </div>
  );
}
