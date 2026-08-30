import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import {
  COUNTRIES,
  CURRENCIES,
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABELS,
  GOAL_PRIORITIES,
  GOAL_STATUSES,
} from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useSaveRow } from "@/hooks/useUpsertRow";
import type { GoalRow } from "@/hooks/useFinancials";

const schema = z.object({
  title: z.string().min(2, "Name the goal"),
  goal_category: z.string(),
  country: z.string(),
  target_amount: z.coerce.number().min(0, "Must be zero or more"),
  funded_amount: z.coerce.number().min(0, "Must be zero or more"),
  currency: z.string(),
  target_date: z.string().optional(),
  priority: z.string(),
  status: z.string(),
  owner_profile_id: z.string(),
  description: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function GoalSheet({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalRow | null;
}) {
  const { members } = useAuth();
  const save = useSaveRow("goals", "goals", "Goal");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      goal_category: "property",
      country: "GB",
      target_amount: 0,
      funded_amount: 0,
      currency: "GBP",
      target_date: "",
      priority: "want",
      status: "planning",
      owner_profile_id: "joint",
      description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      title: goal?.title ?? "",
      goal_category: goal?.goal_category ?? "property",
      country: goal?.country ?? "GB",
      target_amount: Number(goal?.target_amount ?? 0),
      funded_amount: Number(goal?.funded_amount ?? 0),
      currency: goal?.currency ?? "GBP",
      target_date: goal?.target_date ?? "",
      priority: goal?.priority ?? "want",
      status: goal?.status ?? "planning",
      owner_profile_id: goal?.owner_profile_id ?? "joint",
      description: goal?.description ?? "",
    });
  }, [open, goal, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: goal?.id,
      values: {
        title: values.title,
        goal_category: values.goal_category,
        country: values.country || null,
        target_amount: values.target_amount,
        funded_amount: values.funded_amount,
        currency: values.currency,
        target_date: values.target_date || null,
        priority: values.priority,
        status: values.status,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        description: values.description?.trim() || null,
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? "Edit goal" : "Add goal"}
      description="A goal with a number and a date can be planned against. One without either is only a wish."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={goal ? "Save changes" : "Add goal"}
      footerNote="Leave the target at zero until you have a real figure — the platform will flag it as unpriced rather than guess."
    >
      <FullRow>
        <Field label="Title" error={form.formState.errors.title?.message}>
          <Input placeholder="First London property" {...form.register("title")} />
        </Field>
      </FullRow>

      <Field label="Category">
        <Controller
          control={form.control}
          name="goal_category"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={GOAL_CATEGORIES.map((value) => ({
                value,
                label: GOAL_CATEGORY_LABELS[value] ?? value,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Country">
        <Controller
          control={form.control}
          name="country"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={COUNTRIES.map((country) => ({ value: country.code, label: country.label }))}
            />
          )}
        />
      </Field>

      <Field label="Target amount" error={form.formState.errors.target_amount?.message}>
        <Input type="number" step="100" inputMode="decimal" {...form.register("target_amount")} />
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

      <Field label="Already set aside" error={form.formState.errors.funded_amount?.message}>
        <Input type="number" step="100" inputMode="decimal" {...form.register("funded_amount")} />
      </Field>

      <Field label="Target date">
        <Input type="date" {...form.register("target_date")} />
      </Field>

      <Field label="Priority">
        <Controller
          control={form.control}
          name="priority"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={GOAL_PRIORITIES.map((priority) => ({
                value: priority.value,
                label: priority.label,
              }))}
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
              options={GOAL_STATUSES.map((status) => ({
                value: status.value,
                label: status.label,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Whose goal">
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
            rows={3}
            placeholder="What this covers, and what would make you move the date"
            {...form.register("description")}
          />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
