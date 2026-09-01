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
import { RENT_FREQUENCY_LABELS, TENANCY_ROLE_LABELS } from "@/lib/documents/types";
import { maskReference } from "@/lib/documents/redact";
import type { TenancyRow } from "@/hooks/useDocuments";

const schema = z.object({
  property_address: z.string().min(4, "Give the address"),
  role: z.string(),
  owner_profile_id: z.string(),
  landlord_name: z.string().optional(),
  tenant_names: z.string().optional(),
  agent_name: z.string().optional(),
  reference_last4: z.string().optional(),
  term_start: z.string().optional(),
  term_end: z.string().optional(),
  break_clause_date: z.string().optional(),
  notice_period_months: z.string().optional(),
  rent_amount: z.string().optional(),
  rent_frequency: z.string(),
  currency: z.string(),
  deposit_amount: z.string().optional(),
  deposit_scheme: z.string().optional(),
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
 * Adding or correcting a tenancy.
 *
 * Saving does not itself create the forecast outgoing or the deposit asset —
 * those are offered on the tenancy screen, where the household can see what
 * would be created before it appears in the numbers.
 */
export function TenancySheet({
  open,
  onOpenChange,
  tenancy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenancy?: TenancyRow | null;
}) {
  const { options } = useOwners();
  const save = useSaveRow("tenancies", "tenancies", "Tenancy");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      property_address: "",
      role: "tenant",
      owner_profile_id: "joint",
      landlord_name: "",
      tenant_names: "",
      agent_name: "",
      reference_last4: "",
      term_start: "",
      term_end: "",
      break_clause_date: "",
      notice_period_months: "",
      rent_amount: "",
      rent_frequency: "monthly",
      currency: "GBP",
      deposit_amount: "",
      deposit_scheme: "",
      status: "current",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      property_address: tenancy?.property_address ?? "",
      role: tenancy?.role ?? "tenant",
      owner_profile_id: tenancy?.owner_profile_id ?? "joint",
      landlord_name: tenancy?.landlord_name ?? "",
      tenant_names: tenancy?.tenant_names ?? "",
      agent_name: tenancy?.agent_name ?? "",
      reference_last4: tenancy?.reference_last4 ?? "",
      term_start: tenancy?.term_start ?? "",
      term_end: tenancy?.term_end ?? "",
      break_clause_date: tenancy?.break_clause_date ?? "",
      notice_period_months:
        tenancy?.notice_period_months != null ? String(tenancy.notice_period_months) : "",
      rent_amount: tenancy?.rent_amount != null ? String(tenancy.rent_amount) : "",
      rent_frequency: tenancy?.rent_frequency ?? "monthly",
      currency: tenancy?.currency ?? "GBP",
      deposit_amount: tenancy?.deposit_amount != null ? String(tenancy.deposit_amount) : "",
      deposit_scheme: tenancy?.deposit_scheme ?? "",
      status: tenancy?.status ?? "current",
      notes: tenancy?.notes ?? "",
    });
  }, [open, tenancy, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: tenancy?.id,
      values: {
        property_address: values.property_address.trim(),
        role: values.role,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        landlord_name: values.landlord_name?.trim() || null,
        tenant_names: values.tenant_names?.trim() || null,
        agent_name: values.agent_name?.trim() || null,
        reference_last4: maskReference(values.reference_last4),
        term_start: values.term_start || null,
        term_end: values.term_end || null,
        break_clause_date: values.break_clause_date || null,
        notice_period_months: numberOrNull(values.notice_period_months),
        rent_amount: numberOrNull(values.rent_amount),
        rent_frequency: values.rent_frequency,
        currency: values.currency,
        deposit_amount: numberOrNull(values.deposit_amount),
        deposit_scheme: values.deposit_scheme?.trim() || null,
        status: values.status,
        notes: values.notes?.trim() || null,
        source: tenancy?.source === "document" ? "document" : "manual",
        needs_review: false,
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={tenancy ? "Edit tenancy" : "Add tenancy"}
      description="Only the last four characters of any reference are kept."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={tenancy ? "Save changes" : "Add tenancy"}
      footerNote="The notice period is what actually fixes the move date: notice has to be served that many months before the term end or the break date, whichever comes first."
    >
      <FullRow>
        <Field label="Address" error={form.formState.errors.property_address?.message}>
          <Input placeholder="Flat 4, 12 Cleveland Road, London" {...form.register("property_address")} />
        </Field>
      </FullRow>

      <Field label="Which side">
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={Object.entries(TENANCY_ROLE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Whose">
        <Controller
          control={form.control}
          name="owner_profile_id"
          render={({ field }) => (
            <SelectNative value={field.value} onChange={field.onChange} options={options} />
          )}
        />
      </Field>

      <Field label="Rent">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("rent_amount")} />
      </Field>

      <Field label="Rent paid">
        <Controller
          control={form.control}
          name="rent_frequency"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={Object.entries(RENT_FREQUENCY_LABELS).map(([value, label]) => ({
                value,
                label: label.replace(/^a /, "Per ").replace(/^an /, "Per "),
              }))}
            />
          )}
        />
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
                { value: "upcoming", label: "Starts later" },
                { value: "current", label: "Current" },
                { value: "ended", label: "Ended" },
              ]}
            />
          )}
        />
      </Field>

      <Field label="Term starts">
        <Input type="date" {...form.register("term_start")} />
      </Field>

      <Field label="Term ends">
        <Input type="date" {...form.register("term_end")} />
      </Field>

      <Field label="Break clause date" hint="The earliest date the agreement can be ended.">
        <Input type="date" {...form.register("break_clause_date")} />
      </Field>

      <Field label="Notice period, months">
        <Input
          type="number"
          step="1"
          inputMode="numeric"
          {...form.register("notice_period_months")}
        />
      </Field>

      <Field label="Deposit held">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("deposit_amount")} />
      </Field>

      <Field label="Deposit scheme">
        <Input placeholder="TDS / DPS / mydeposits" {...form.register("deposit_scheme")} />
      </Field>

      <Field label="Landlord">
        <Input {...form.register("landlord_name")} />
      </Field>

      <Field label="Agent">
        <Input {...form.register("agent_name")} />
      </Field>

      <Field label="Tenants named">
        <Input placeholder="Omar Ebeid, Haya Ebeid" {...form.register("tenant_names")} />
      </Field>

      <Field label="Reference" hint="Reduced to the last four on save.">
        <Input {...form.register("reference_last4")} />
      </Field>

      <FullRow>
        <Field label="Notes">
          <Input placeholder="Rent review each September" {...form.register("notes")} />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
