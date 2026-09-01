import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import { CURRENCIES } from "@/lib/format";
import { useOwners } from "@/hooks/useOwners";
import { useSaveRow } from "@/hooks/useUpsertRow";
import {
  BENEFIT_FREQUENCY_LABELS,
  INSURANCE_TYPES,
  INSURANCE_TYPE_LABELS,
  PREMIUM_FREQUENCY_LABELS,
} from "@/lib/documents/types";
import { maskReference } from "@/lib/documents/redact";
import type { InsurancePolicyRow } from "@/hooks/useDocuments";

const schema = z.object({
  insurer: z.string().min(2, "Name the insurer"),
  policy_type: z.string(),
  policy_number_last4: z.string().optional(),
  insured_person: z.string().optional(),
  owner_profile_id: z.string(),
  currency: z.string(),
  sum_assured: z.string().optional(),
  benefit_amount: z.string().optional(),
  benefit_frequency: z.string(),
  deferred_period_weeks: z.string().optional(),
  benefit_period_months: z.string().optional(),
  premium_amount: z.string().optional(),
  premium_frequency: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  renewal_date: z.string().optional(),
  in_trust: z.string(),
  beneficiaries: z.string().optional(),
  status: z.string(),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

const numberOrNull = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Correcting or adding a policy by hand.
 *
 * The policy number is never held in full — whatever is typed here is reduced
 * to its last four characters before it is saved, exactly as the reader does.
 */
export function InsuranceSheet({
  open,
  onOpenChange,
  policy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: InsurancePolicyRow | null;
}) {
  const { options } = useOwners();
  const save = useSaveRow("insurance_policies", "insurance-policies", "Policy");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      insurer: "",
      policy_type: "life",
      policy_number_last4: "",
      insured_person: "",
      owner_profile_id: "joint",
      currency: "GBP",
      sum_assured: "",
      benefit_amount: "",
      benefit_frequency: "lump_sum",
      deferred_period_weeks: "",
      benefit_period_months: "",
      premium_amount: "",
      premium_frequency: "monthly",
      start_date: "",
      end_date: "",
      renewal_date: "",
      in_trust: "unknown",
      beneficiaries: "",
      status: "active",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      insurer: policy?.insurer ?? "",
      policy_type: policy?.policy_type ?? "life",
      policy_number_last4: policy?.policy_number_last4 ?? "",
      insured_person: policy?.insured_person ?? "",
      owner_profile_id: policy?.owner_profile_id ?? "joint",
      currency: policy?.currency ?? "GBP",
      sum_assured: policy?.sum_assured != null ? String(policy.sum_assured) : "",
      benefit_amount: policy?.benefit_amount != null ? String(policy.benefit_amount) : "",
      benefit_frequency: policy?.benefit_frequency ?? "lump_sum",
      deferred_period_weeks:
        policy?.deferred_period_weeks != null ? String(policy.deferred_period_weeks) : "",
      benefit_period_months:
        policy?.benefit_period_months != null ? String(policy.benefit_period_months) : "",
      premium_amount: policy?.premium_amount != null ? String(policy.premium_amount) : "",
      premium_frequency: policy?.premium_frequency ?? "monthly",
      start_date: policy?.start_date ?? "",
      end_date: policy?.end_date ?? "",
      renewal_date: policy?.renewal_date ?? "",
      in_trust: policy?.in_trust === null || policy?.in_trust === undefined ? "unknown" : policy.in_trust ? "yes" : "no",
      beneficiaries: policy?.beneficiaries ?? "",
      status: policy?.status ?? "active",
      notes: policy?.notes ?? "",
    });
  }, [open, policy, form]);

  const type = form.watch("policy_type");
  const isIncome = type === "income_protection";

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: policy?.id,
      values: {
        insurer: values.insurer.trim(),
        policy_type: values.policy_type,
        policy_number_last4: maskReference(values.policy_number_last4),
        insured_person: values.insured_person?.trim() || null,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        currency: values.currency,
        sum_assured: numberOrNull(values.sum_assured),
        benefit_amount: numberOrNull(values.benefit_amount),
        benefit_frequency: values.benefit_amount?.trim() ? values.benefit_frequency : null,
        deferred_period_weeks: numberOrNull(values.deferred_period_weeks),
        benefit_period_months: numberOrNull(values.benefit_period_months),
        premium_amount: numberOrNull(values.premium_amount),
        premium_frequency: values.premium_frequency,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        renewal_date: values.renewal_date || null,
        in_trust: values.in_trust === "unknown" ? null : values.in_trust === "yes",
        beneficiaries: values.beneficiaries?.trim() || null,
        status: values.status,
        notes: values.notes?.trim() || null,
        source: policy?.source === "document" ? "document" : "manual",
        needs_review: false,
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={policy ? "Edit policy" : "Add policy"}
      description="Only the last four characters of the policy number are kept."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={policy ? "Save changes" : "Add policy"}
      footerNote="A life policy written in trust pays outside the estate, so the money reaches the family without waiting for probate and without inheritance tax on the payout."
    >
      <FullRow>
        <Field label="Insurer" error={form.formState.errors.insurer?.message}>
          <Input placeholder="Aviva" {...form.register("insurer")} />
        </Field>
      </FullRow>

      <Field label="Cover">
        <Controller
          control={form.control}
          name="policy_type"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={INSURANCE_TYPES.map((value) => ({
                value,
                label: INSURANCE_TYPE_LABELS[value],
              }))}
            />
          )}
        />
      </Field>

      <Field label="Whose policy">
        <Controller
          control={form.control}
          name="owner_profile_id"
          render={({ field }) => (
            <SelectNative value={field.value} onChange={field.onChange} options={options} />
          )}
        />
      </Field>

      <Field label="Name on the policy" hint="As printed, if it differs from the household member.">
        <Input placeholder="Omar Ebeid" {...form.register("insured_person")} />
      </Field>

      <Field label="Policy number" hint="Reduced to the last four on save.">
        <Input placeholder="••••4192" {...form.register("policy_number_last4")} />
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

      <Field label="Status">
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "active", label: "Active" },
                { value: "lapsed", label: "Lapsed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          )}
        />
      </Field>

      <Field label="Sum assured" hint="The lump sum paid on a claim.">
        <Input type="number" step="1" inputMode="decimal" {...form.register("sum_assured")} />
      </Field>

      <Field label={isIncome ? "Monthly benefit" : "Benefit amount"}>
        <Input type="number" step="1" inputMode="decimal" {...form.register("benefit_amount")} />
      </Field>

      <Field label="Benefit paid">
        <Controller
          control={form.control}
          name="benefit_frequency"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={Object.entries(BENEFIT_FREQUENCY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          )}
        />
      </Field>

      {isIncome && (
        <>
          <Field label="Deferred period, weeks" hint="How long before the benefit starts.">
            <Input
              type="number"
              step="1"
              inputMode="numeric"
              {...form.register("deferred_period_weeks")}
            />
          </Field>
          <Field label="Benefit period, months" hint="Blank means to retirement.">
            <Input
              type="number"
              step="1"
              inputMode="numeric"
              {...form.register("benefit_period_months")}
            />
          </Field>
        </>
      )}

      <Field label="Premium">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("premium_amount")} />
      </Field>

      <Field label="Premium paid">
        <Controller
          control={form.control}
          name="premium_frequency"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={Object.entries(PREMIUM_FREQUENCY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Cover starts">
        <Input type="date" {...form.register("start_date")} />
      </Field>

      <Field label="Cover ends">
        <Input type="date" {...form.register("end_date")} />
      </Field>

      <Field label="Renews" hint="Drives the 60 and 30 day reminders.">
        <Input type="date" {...form.register("renewal_date")} />
      </Field>

      <Field label="Written in trust">
        <Controller
          control={form.control}
          name="in_trust"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "unknown", label: "Not known" },
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
          )}
        />
      </Field>

      <FullRow>
        <Field label="Beneficiaries">
          <Input placeholder="Haya Ebeid" {...form.register("beneficiaries")} />
        </Field>
      </FullRow>

      <FullRow>
        <Field label="Notes">
          <Input placeholder="Level term, 25 years from 2024" {...form.register("notes")} />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
