import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  financed_amount: z.coerce.number().min(0, "Must be zero or more"),
  financed_rate: z.string().optional(),
  financed_term_years: z.string().optional(),
  first_time_buyer: z.boolean(),
  additional_property: z.boolean(),
  non_uk_resident: z.boolean(),
});

type Values = z.infer<typeof schema>;

const optionalNumber = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

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
      financed_amount: 0,
      financed_rate: "",
      financed_term_years: "",
      first_time_buyer: false,
      additional_property: false,
      non_uk_resident: false,
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
      financed_amount: Number(goal?.financed_amount ?? 0),
      financed_rate:
        goal?.financed_rate === null || goal?.financed_rate === undefined
          ? ""
          : String(goal.financed_rate),
      financed_term_years:
        goal?.financed_term_years === null || goal?.financed_term_years === undefined
          ? ""
          : String(goal.financed_term_years),
      first_time_buyer: goal?.first_time_buyer ?? false,
      additional_property: goal?.additional_property ?? false,
      non_uk_resident: goal?.non_uk_resident ?? false,
    });
  }, [open, goal, form]);

  const category = form.watch("goal_category");
  const isProperty = category === "property";

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
        financed_amount: values.financed_amount,
        financed_rate: optionalNumber(values.financed_rate),
        financed_term_years: optionalNumber(values.financed_term_years),
        first_time_buyer: values.first_time_buyer,
        additional_property: values.additional_property,
        non_uk_resident: values.non_uk_resident,
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

      <Field
        label="Borrowed toward it"
        hint="Mortgage or loan — the rest has to come from cash"
        error={form.formState.errors.financed_amount?.message}
      >
        <Input
          type="number"
          step="1000"
          inputMode="decimal"
          {...form.register("financed_amount")}
        />
      </Field>

      <Field label="Borrowing rate %" hint="Leave blank if not agreed">
        <Input
          type="number"
          step="0.05"
          inputMode="decimal"
          placeholder="4.5"
          {...form.register("financed_rate")}
        />
      </Field>

      <Field label="Term (years)" hint="Leave blank if not agreed">
        <Input
          type="number"
          step="1"
          inputMode="numeric"
          placeholder="25"
          {...form.register("financed_term_years")}
        />
      </Field>

      {isProperty && (
        <FullRow>
          <div className="hairline space-y-3 rounded-md bg-surface-raised p-3">
            <p className="eyebrow">Stamp duty status</p>
            <SwitchRow
              control={form.control}
              name="first_time_buyer"
              label="First-time buyer"
              hint="Relief needs neither of you to own property anywhere in the world"
            />
            <SwitchRow
              control={form.control}
              name="additional_property"
              label="Additional property"
              hint="A home already owned in Egypt or Jordan triggers the 5% surcharge"
            />
            <SwitchRow
              control={form.control}
              name="non_uk_resident"
              label="Non-UK resident for SDLT"
              hint="Fewer than 183 UK days in the 12 months around completion adds 2%"
            />
          </div>
        </FullRow>
      )}

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

function SwitchRow({
  control,
  name,
  label,
  hint,
}: {
  control: ReturnType<typeof useForm<Values>>["control"];
  name: "first_time_buyer" | "additional_property" | "non_uk_resident";
  label: string;
  hint: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">{label}</p>
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">{hint}</p>
          </div>
          <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={label} />
        </div>
      )}
    />
  );
}
