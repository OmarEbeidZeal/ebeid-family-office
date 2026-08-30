import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import { CURRENCIES, EXPENSE_CONFIDENCE, FREQUENCIES, FREQUENCY_LABELS } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useCategories, type ForecastExpenseRow } from "@/hooks/useFinancials";
import { useSaveRow } from "@/hooks/useUpsertRow";
import { pctToRate, rateToPct } from "@/hooks/usePlanning";

const schema = z.object({
  label: z.string().min(2, "Name the outgoing"),
  amount: z.coerce.number().min(0, "Must be zero or more"),
  currency: z.string(),
  frequency: z.string(),
  confidence: z.string(),
  category_id: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  inflation_pct: z.coerce.number().min(-20).max(100),
  owner_profile_id: z.string(),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function ExpenseSheet({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ForecastExpenseRow | null;
}) {
  const { members } = useAuth();
  const { data: categories = [] } = useCategories();
  const save = useSaveRow("forecast_expenses", "forecast_expenses", "Planned outgoing");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: "",
      amount: 0,
      currency: "GBP",
      frequency: "monthly",
      confidence: "committed",
      category_id: "none",
      start_date: "",
      end_date: "",
      inflation_pct: 3,
      owner_profile_id: "joint",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      label: expense?.label ?? "",
      amount: Number(expense?.amount ?? 0),
      currency: expense?.currency ?? "GBP",
      frequency: expense?.frequency ?? "monthly",
      confidence: expense?.confidence ?? "committed",
      category_id: expense?.category_id ?? "none",
      start_date: expense?.start_date ?? "",
      end_date: expense?.end_date ?? "",
      inflation_pct: Number(rateToPct(expense?.inflation_rate ?? 0.03).toFixed(2)),
      owner_profile_id: expense?.owner_profile_id ?? "joint",
      notes: expense?.notes ?? "",
    });
  }, [open, expense, form]);

  const frequency = form.watch("frequency");

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: expense?.id,
      values: {
        label: values.label,
        amount: values.amount,
        currency: values.currency,
        frequency: values.frequency,
        confidence: values.confidence,
        category_id: values.category_id === "none" ? null : values.category_id,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        inflation_rate: pctToRate(values.inflation_pct),
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
      title={expense ? "Edit planned outgoing" : "Add planned outgoing"}
      description="Anything you can see coming over the next five years — nursery, school fees, a car, travel, family support, the Egypt furnishing."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={expense ? "Save changes" : "Add outgoing"}
      footerNote="Confidence controls whether the projection counts it: committed always, likely and possible only when you switch them on."
    >
      <FullRow>
        <Field label="Label" error={form.formState.errors.label?.message}>
          <Input placeholder="Nursery fees" {...form.register("label")} />
        </Field>
      </FullRow>

      <Field label="Amount" error={form.formState.errors.amount?.message}>
        <Input type="number" step="50" inputMode="decimal" {...form.register("amount")} />
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

      <Field label="Confidence">
        <Controller
          control={form.control}
          name="confidence"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={EXPENSE_CONFIDENCE.map((item) => ({ value: item.value, label: item.label }))}
            />
          )}
        />
      </Field>

      <Field
        label={frequency === "one_off" ? "When it lands" : "Starts"}
        hint={frequency === "one_off" ? "The month the money leaves" : "Leave blank to start now"}
      >
        <Input type="date" {...form.register("start_date")} />
      </Field>

      <Field label="Ends" hint="Leave blank if it runs on">
        <Input type="date" {...form.register("end_date")} />
      </Field>

      <Field label="Inflation %" error={form.formState.errors.inflation_pct?.message}>
        <Input type="number" step="0.5" inputMode="decimal" {...form.register("inflation_pct")} />
      </Field>

      <Field label="Category" hint="Used to tell essential spending from discretionary">
        <Controller
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "none", label: "Uncategorised" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.is_essential ? `${category.name} (essential)` : category.name,
                })),
              ]}
            />
          )}
        />
      </Field>

      <Field label="Whose outgoing">
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

      <FullRow>
        <Field label="Notes">
          <Textarea
            rows={2}
            placeholder="What this covers, and what would change it"
            {...form.register("notes")}
          />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
