import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import {
  COUNTRIES,
  CURRENCIES,
  FREQUENCIES,
  FREQUENCY_LABELS,
  INCOME_TYPES,
  INCOME_TYPE_LABELS,
} from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useSaveRow } from "@/hooks/useUpsertRow";
import { pctToRate, rateToPct } from "@/hooks/usePlanning";
import type { IncomeRow } from "@/hooks/useFinancials";

const schema = z.object({
  label: z.string().min(2, "Name the income stream"),
  income_type: z.string(),
  gross_amount: z.coerce.number().min(0, "Must be zero or more"),
  net_amount: z.string().optional(),
  currency: z.string(),
  frequency: z.string(),
  annual_growth_pct: z.coerce.number().min(-50).max(100),
  owner_profile_id: z.string(),
  country: z.string(),
  taxed_at_source: z.boolean(),
  uk_self_assessment: z.boolean(),
});

type Values = z.infer<typeof schema>;

export function IncomeSheet({
  open,
  onOpenChange,
  income,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  income?: IncomeRow | null;
}) {
  const { members } = useAuth();
  const save = useSaveRow("income_streams", "income_streams", "Income stream");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: "",
      income_type: "salary",
      gross_amount: 0,
      net_amount: "",
      currency: "GBP",
      frequency: "monthly",
      annual_growth_pct: 0,
      owner_profile_id: "joint",
      country: "GB",
      taxed_at_source: true,
      uk_self_assessment: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      label: income?.label ?? "",
      income_type: income?.income_type ?? "salary",
      gross_amount: Number(income?.gross_amount ?? 0),
      net_amount:
        income?.net_amount === null || income?.net_amount === undefined
          ? ""
          : String(income.net_amount),
      currency: income?.currency ?? "GBP",
      frequency: income?.frequency ?? "monthly",
      annual_growth_pct: Number(rateToPct(income?.annual_growth_rate).toFixed(2)),
      owner_profile_id: income?.owner_profile_id ?? "joint",
      country: income?.country ?? "GB",
      taxed_at_source: income?.taxed_at_source ?? true,
      uk_self_assessment: income?.uk_self_assessment ?? false,
    });
  }, [open, income, form]);

  const country = form.watch("country");
  const taxedAtSource = form.watch("taxed_at_source");

  const onSubmit = form.handleSubmit(async (values) => {
    const net = values.net_amount?.trim();
    await save.mutateAsync({
      id: income?.id,
      values: {
        label: values.label,
        income_type: values.income_type,
        gross_amount: values.gross_amount,
        net_amount: net ? Number(net) : null,
        currency: values.currency,
        frequency: values.frequency,
        annual_growth_rate: pctToRate(values.annual_growth_pct),
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        country: values.country,
        taxed_at_source: values.taxed_at_source,
        uk_self_assessment: values.uk_self_assessment,
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={income ? "Edit income" : "Add income"}
      description="What actually arrives, and how fast it grows. The projection uses the net figure where one is recorded."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={income ? "Save changes" : "Add income"}
      footerNote="Growth is applied annually from the first projected month. Leave it at zero if no rise is agreed."
    >
      <FullRow>
        <Field label="Label" error={form.formState.errors.label?.message}>
          <Input placeholder="Zeal salary" {...form.register("label")} />
        </Field>
      </FullRow>

      <Field label="Type">
        <Controller
          control={form.control}
          name="income_type"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={INCOME_TYPES.map((value) => ({
                value,
                label: INCOME_TYPE_LABELS[value] ?? value,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Frequency">
        <Controller
          control={form.control}
          name="frequency"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={FREQUENCIES.map((value) => ({
                value,
                label: FREQUENCY_LABELS[value] ?? value,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Gross amount" error={form.formState.errors.gross_amount?.message}>
        <Input type="number" step="100" inputMode="decimal" {...form.register("gross_amount")} />
      </Field>

      <Field label="Net amount" hint="What lands in the account. Leave blank to use gross.">
        <Input type="number" step="100" inputMode="decimal" {...form.register("net_amount")} />
      </Field>

      <Field label="Currency">
        <Controller
          control={form.control}
          name="currency"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          )}
        />
      </Field>

      <Field label="Annual growth %" error={form.formState.errors.annual_growth_pct?.message}>
        <Input
          type="number"
          step="0.5"
          inputMode="decimal"
          {...form.register("annual_growth_pct")}
        />
      </Field>

      <Field label="Whose income">
        <Controller
          control={form.control}
          name="owner_profile_id"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "joint", label: "Joint" },
                ...members.map((member) => ({
                  value: member.id,
                  label: member.display_name ?? member.full_name ?? member.email,
                })),
              ]}
            />
          )}
        />
      </Field>

      <Field label="Paid from" hint="Where the income arises, not where it is banked.">
        <Controller
          control={form.control}
          name="country"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={COUNTRIES.map((entry) => ({ value: entry.code, label: entry.label }))}
            />
          )}
        />
      </Field>

      <FullRow>
        <div className="hairline space-y-3 rounded-md bg-surface-raised p-3">
          <p className="eyebrow">Tax treatment</p>
          <Controller
            control={form.control}
            name="taxed_at_source"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-foreground">Taxed at source</p>
                  <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
                    {country === "GB"
                      ? "PAYE or CGT already deducted before it arrives."
                      : "Withheld abroad. Any UK liability is reduced, not removed, by treaty relief."}
                  </p>
                </div>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Taxed at source"
                />
              </div>
            )}
          />
          <Controller
            control={form.control}
            name="uk_self_assessment"
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-foreground">Reported on UK Self Assessment</p>
                  <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
                    Counts towards adjusted net income and the £100,000 line on the pay screen.
                  </p>
                </div>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Reported on UK Self Assessment"
                />
              </div>
            )}
          />
          {country !== "GB" && !taxedAtSource && (
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              Foreign income with no tax withheld: the full amount is normally due through Self
              Assessment, with the January payment on account to plan for.
            </p>
          )}
        </div>
      </FullRow>
    </FormSheet>
  );
}
