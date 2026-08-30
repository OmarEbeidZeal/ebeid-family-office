import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsCard } from "./SettingsCard";
import { useAuth } from "@/hooks/useAuth";
import { useTaxAllowances, type TaxAllowanceRow } from "@/hooks/useFinancials";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { POLICY_LIMITS, currentTaxYear } from "@/lib/policy";
import { cn } from "@/lib/utils";

type Draft = {
  isa_used: string;
  jisa_used: string;
  lisa_used: string;
  pension_used: string;
  employer_match_secured: boolean;
};

const FIELDS = [
  { key: "isa_used", label: "ISA subscribed", limit: POLICY_LIMITS.isaAllowance },
  { key: "pension_used", label: "Pension contributed", limit: POLICY_LIMITS.pensionAllowance },
  { key: "jisa_used", label: "JISA subscribed", limit: POLICY_LIMITS.jisaAllowance },
  { key: "lisa_used", label: "LISA subscribed", limit: POLICY_LIMITS.lisaAllowance },
] as const;

const toDraft = (row: TaxAllowanceRow | undefined): Draft => ({
  isa_used: row ? String(Number(row.isa_used)) : "",
  jisa_used: row ? String(Number(row.jisa_used)) : "",
  lisa_used: row ? String(Number(row.lisa_used)) : "",
  pension_used: row ? String(Number(row.pension_used)) : "",
  employer_match_secured: row?.employer_match_secured ?? false,
});

const numeric = (value: string) => {
  const parsed = Number(value);
  return value.trim() === "" || !Number.isFinite(parsed) || parsed < 0 ? 0 : parsed;
};

/**
 * Wrapper capacity is the one number the advisor cannot derive from statements:
 * contributions land at a provider the app never sees. Recording it here is what
 * turns "allowance use unknown" into an actual use-it-or-lose-it deadline before
 * 5 April. Nothing is assumed — a person with no row is reported as unrecorded,
 * never as having the full allowance available.
 */
function PersonRow({
  personId,
  name,
  row,
  taxYear,
  base,
}: {
  personId: string;
  name: string;
  row: TaxAllowanceRow | undefined;
  taxYear: string;
  base: string;
}) {
  const { household } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(row));
  const [touched, setTouched] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        isa_used: numeric(draft.isa_used),
        jisa_used: numeric(draft.jisa_used),
        lisa_used: numeric(draft.lisa_used),
        pension_used: numeric(draft.pension_used),
        employer_match_secured: draft.employer_match_secured,
      };
      if (row) {
        const { error } = await db.from("tax_allowances").update(values).eq("id", row.id);
        if (error) throw error;
        return;
      }
      const { error } = await db.from("tax_allowances").insert({
        ...values,
        household_id: household!.id,
        profile_id: personId,
        tax_year: taxYear,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax_allowances"] });
      queryClient.invalidateQueries({ queryKey: ["household-context"] });
      setTouched(false);
      toast.success(`${name}'s ${taxYear} allowances saved`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const set = (key: keyof Draft, value: string | boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setTouched(true);
  };

  return (
    <div className="hairline rounded-md bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">{name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row ? `Recorded for ${taxYear}.` : `Nothing recorded for ${taxYear} yet.`}
          </p>
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={!touched || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((field) => {
          const used = numeric(draft[field.key]);
          const remaining = Math.max(field.limit - used, 0);
          const over = used > field.limit;
          return (
            <div key={field.key}>
              <label
                className="eyebrow block text-muted-foreground"
                htmlFor={`${personId}-${field.key}`}
              >
                {field.label}
              </label>
              <Input
                id={`${personId}-${field.key}`}
                type="number"
                inputMode="decimal"
                step="1"
                min="0"
                className="num mt-1.5"
                placeholder="0"
                value={draft[field.key]}
                onChange={(event) => set(field.key, event.target.value)}
              />
              <p
                className={cn(
                  "num mt-1.5 text-[0.7rem]",
                  over ? "text-loss" : "text-muted-foreground",
                )}
              >
                {over
                  ? `${formatMoney(used - field.limit, base, { decimals: 0 })} over the ${formatMoney(field.limit, base, { decimals: 0 })} limit`
                  : `${formatMoney(remaining, base, { decimals: 0 })} left of ${formatMoney(field.limit, base, { decimals: 0 })}`}
              </p>
            </div>
          );
        })}
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-xs text-foreground/85">
        <Checkbox
          checked={draft.employer_match_secured}
          onCheckedChange={(value) => set("employer_match_secured", value === true)}
        />
        Employer pension match fully secured this year
        <span className="text-muted-foreground">— policy rule 5 puts it first in the ladder.</span>
      </label>
    </div>
  );
}

export function AllowanceCard() {
  const { members, household } = useAuth();
  const { data: allowances = [], isLoading } = useTaxAllowances();
  const taxYear = useMemo(() => currentTaxYear(), []);
  const base = household?.base_currency ?? "GBP";

  const byProfile = useMemo(() => {
    const map: Record<string, TaxAllowanceRow> = {};
    for (const row of allowances) {
      if (row.tax_year === taxYear.label && row.profile_id) map[row.profile_id] = row;
    }
    return map;
  }, [allowances, taxYear.label]);

  const unrecorded = members.filter((member) => !byProfile[member.id]).length;

  return (
    <SettingsCard
      title="Tax year allowances"
      description={`${taxYear.label} · ${taxYear.daysRemaining} days to 5 April. ISA and pension contributions happen at your providers, so record them here — the advisor treats an unrecorded person as unknown, never as having the full allowance available.`}
      action={
        unrecorded === 0 && members.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gain">
            <Check className="h-3.5 w-3.5" />
            All members recorded
          </span>
        ) : (
          <span className="text-xs text-warn">
            {unrecorded} of {members.length} not recorded
          </span>
        )
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div key={index} className="skeleton h-28 rounded-md" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No household members yet. Add them in the household section above and their allowances
          appear here.
        </p>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <PersonRow
              key={`${member.id}-${byProfile[member.id]?.id ?? "new"}`}
              personId={member.id}
              name={member.full_name?.trim() || member.email || "Member"}
              row={byProfile[member.id]}
              taxYear={taxYear.label}
              base={base}
            />
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Figures are what has already gone in this tax year, per person. The 2026/27 limits shown
            are ISA {formatMoney(POLICY_LIMITS.isaAllowance, base, { decimals: 0 })}, pension{" "}
            {formatMoney(POLICY_LIMITS.pensionAllowance, base, { decimals: 0 })} (tapered above
            £260,000 adjusted income), JISA{" "}
            {formatMoney(POLICY_LIMITS.jisaAllowance, base, { decimals: 0 })} and LISA{" "}
            {formatMoney(POLICY_LIMITS.lisaAllowance, base, { decimals: 0 })}.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}
