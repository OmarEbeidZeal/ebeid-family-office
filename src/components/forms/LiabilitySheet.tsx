import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import { CURRENCIES, LIABILITY_TYPES, LIABILITY_TYPE_LABELS } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useAssets } from "@/hooks/useFinancials";
import { useSaveRow } from "@/hooks/useUpsertRow";
import type { LiabilityRow } from "@/hooks/useFinancials";

const schema = z.object({
  name: z.string().min(2, "Name the liability"),
  liability_type: z.string(),
  currency: z.string(),
  outstanding_balance: z.coerce.number().min(0, "Must be zero or more"),
  original_amount: z.string().optional(),
  interest_rate: z.string().optional(),
  monthly_payment: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  linked_asset_id: z.string().optional(),
  owner_profile_id: z.string(),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

const numberOrNull = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function LiabilitySheet({
  open,
  onOpenChange,
  liability,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liability?: LiabilityRow | null;
}) {
  const { members } = useAuth();
  const { data: assets = [] } = useAssets();
  const save = useSaveRow("liabilities", "liabilities", "Liability");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      liability_type: "mortgage",
      currency: "GBP",
      outstanding_balance: 0,
      original_amount: "",
      interest_rate: "",
      monthly_payment: "",
      start_date: "",
      end_date: "",
      linked_asset_id: "none",
      owner_profile_id: "joint",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: liability?.name ?? "",
      liability_type: liability?.liability_type ?? "mortgage",
      currency: liability?.currency ?? "GBP",
      outstanding_balance: Number(liability?.outstanding_balance ?? 0),
      original_amount: liability?.original_amount != null ? String(liability.original_amount) : "",
      interest_rate: liability?.interest_rate != null ? String(liability.interest_rate) : "",
      monthly_payment: liability?.monthly_payment != null ? String(liability.monthly_payment) : "",
      start_date: liability?.start_date ?? "",
      end_date: liability?.end_date ?? "",
      linked_asset_id: liability?.linked_asset_id ?? "none",
      owner_profile_id: liability?.owner_profile_id ?? "joint",
      notes: liability?.notes ?? "",
    });
  }, [open, liability, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: liability?.id,
      values: {
        name: values.name,
        liability_type: values.liability_type,
        currency: values.currency,
        outstanding_balance: Math.abs(values.outstanding_balance),
        original_amount: numberOrNull(values.original_amount),
        interest_rate: numberOrNull(values.interest_rate),
        monthly_payment: numberOrNull(values.monthly_payment),
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        linked_asset_id:
          values.linked_asset_id && values.linked_asset_id !== "none"
            ? values.linked_asset_id
            : null,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        notes: values.notes?.trim() || null,
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={liability ? "Edit liability" : "Add liability"}
      description="Enter what is owed today as a positive figure."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={liability ? "Save changes" : "Add liability"}
      footerNote="Linking a mortgage to a property nets the debt against it, so the balance sheet shows real equity."
    >
      <FullRow>
        <Field label="Name" error={form.formState.errors.name?.message}>
          <Input placeholder="London flat mortgage" {...form.register("name")} />
        </Field>
      </FullRow>

      <Field label="Type">
        <Controller
          control={form.control}
          name="liability_type"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={LIABILITY_TYPES.map((type) => ({
                value: type,
                label: LIABILITY_TYPE_LABELS[type] ?? type,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Owner">
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

      <Field label="Outstanding balance" error={form.formState.errors.outstanding_balance?.message}>
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("outstanding_balance")}
        />
      </Field>

      <Field label="Original amount">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("original_amount")}
        />
      </Field>

      <Field label="Interest rate %">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("interest_rate")} />
      </Field>

      <Field label="Monthly payment">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("monthly_payment")}
        />
      </Field>

      <Field label="Term ends" hint="Used to show the remaining term.">
        <Input type="date" {...form.register("end_date")} />
      </Field>

      <FullRow>
        <Field
          label="Secured against"
          hint="Netting a mortgage against its property reveals the equity you actually hold."
        >
          <Controller
            control={form.control}
            name="linked_asset_id"
            render={({ field }) => (
              <SelectNative
                value={field.value ?? "none"}
                onChange={field.onChange}
                options={[
                  { value: "none", label: "Unsecured — not linked to an asset" },
                  ...assets.map((asset) => ({ value: asset.id, label: asset.name })),
                ]}
              />
            )}
          />
        </Field>
      </FullRow>

      <FullRow>
        <Field label="Notes">
          <Input
            placeholder="Fixed until March 2028, then reverts to SVR"
            {...form.register("notes")}
          />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
