import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { Money } from "@/components/Money";
import { StepFooter, AddedList } from "./OnboardingLayout";
import { useIncomeStreams } from "@/hooks/useFinancials";
import { useDeleteRow, useSaveRow } from "@/hooks/useUpsertRow";
import { useAuth } from "@/hooks/useAuth";
import {
  CURRENCIES,
  FREQUENCIES,
  FREQUENCY_LABELS,
  INCOME_TYPES,
  INCOME_TYPE_LABELS,
} from "@/lib/format";

const schema = z.object({
  label: z.string().min(1, "Name the income"),
  income_type: z.string(),
  gross_amount: z.coerce.number().min(0, "Enter the gross amount"),
  net_amount: z.coerce.number().min(0).optional(),
  currency: z.string(),
  frequency: z.string(),
  owner: z.string(),
});

type Values = z.infer<typeof schema>;

export function StepIncome({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { profile, household } = useAuth();
  const income = useIncomeStreams();
  const save = useSaveRow("income_streams", "income_streams", "Income stream");
  const remove = useDeleteRow("income_streams", "income_streams", "Income stream");

  const partnerName = household?.partner_display_name?.trim();
  const ownerOptions = [
    { value: profile?.id ?? "me", label: profile?.display_name || "Me" },
    { value: "joint", label: partnerName ? `${partnerName} / joint` : "Joint / household" },
  ];

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: "",
      income_type: "salary",
      gross_amount: 0,
      net_amount: 0,
      currency: "GBP",
      frequency: "monthly",
      owner: profile?.id ?? "joint",
    },
  });

  const submit = form.handleSubmit((values) => {
    save.mutate(
      {
        values: {
          label: values.label.trim(),
          income_type: values.income_type,
          gross_amount: values.gross_amount,
          net_amount: values.net_amount ? values.net_amount : null,
          currency: values.currency,
          frequency: values.frequency,
          annual_growth_rate: 0,
          start_date: new Date().toISOString().slice(0, 10),
          owner_profile_id: values.owner === "joint" ? null : values.owner,
        },
      },
      {
        onSuccess: () =>
          form.reset({
            ...form.getValues(),
            label: "",
            gross_amount: 0,
            net_amount: 0,
          }),
      },
    );
  });

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="hairline space-y-4 rounded-lg bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Description" error={form.formState.errors.label?.message}>
            <Input placeholder="Zeal salary" {...form.register("label")} />
          </Field>
          <Field label="Type">
            <SelectNative
              value={form.watch("income_type")}
              onChange={(value) => form.setValue("income_type", value)}
              options={INCOME_TYPES.map((type) => ({
                value: type,
                label: INCOME_TYPE_LABELS[type] ?? type,
              }))}
            />
          </Field>
          <Field label="Received by">
            <SelectNative
              value={form.watch("owner")}
              onChange={(value) => form.setValue("owner", value)}
              options={ownerOptions}
            />
          </Field>
          <Field label="Frequency">
            <SelectNative
              value={form.watch("frequency")}
              onChange={(value) => form.setValue("frequency", value)}
              options={FREQUENCIES.map((frequency) => ({
                value: frequency,
                label: FREQUENCY_LABELS[frequency] ?? frequency,
              }))}
            />
          </Field>
          <Field label="Gross amount" error={form.formState.errors.gross_amount?.message}>
            <Input type="number" step="0.01" className="num" {...form.register("gross_amount")} />
          </Field>
          <Field label="Net amount" hint="After tax, if you know it. Leave at zero if not.">
            <Input type="number" step="0.01" className="num" {...form.register("net_amount")} />
          </Field>
          <Field label="Currency">
            <SelectNative
              value={form.watch("currency")}
              onChange={(value) => form.setValue("currency", value)}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          </Field>
        </div>

        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add income
        </Button>
      </form>

      <AddedList
        emptyLabel="No income recorded yet. Salary, dividends, rent received and business draw all count."
        onRemove={(id) => remove.mutate(id)}
        items={(income.data ?? []).map((stream) => ({
          id: stream.id,
          title: stream.label,
          subtitle: `${INCOME_TYPE_LABELS[stream.income_type] ?? stream.income_type} · ${
            FREQUENCY_LABELS[stream.frequency] ?? stream.frequency
          } · ${
            stream.owner_profile_id
              ? profile?.display_name || "You"
              : partnerName
                ? `${partnerName} / joint`
                : "Joint"
          }`,
          value: (
            <Money
              amount={stream.net_amount ?? stream.gross_amount}
              currency={stream.currency}
              className="text-sm"
            />
          ),
        }))}
      />

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        nextLabel={(income.data?.length ?? 0) ? "Continue" : "Skip for now"}
      />
    </div>
  );
}
