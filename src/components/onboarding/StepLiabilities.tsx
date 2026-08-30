import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { Money } from "@/components/Money";
import { StepFooter, AddedList } from "./OnboardingLayout";
import { useAssets, useForecastExpenses, useLiabilities } from "@/hooks/useFinancials";
import { useDeleteRow, useSaveRow } from "@/hooks/useUpsertRow";
import { useAuth } from "@/hooks/useAuth";
import { CURRENCIES, FREQUENCY_LABELS, LIABILITY_TYPES, LIABILITY_TYPE_LABELS } from "@/lib/format";

const liabilitySchema = z.object({
  name: z.string().min(1, "Name the debt"),
  liability_type: z.string(),
  currency: z.string(),
  outstanding_balance: z.coerce.number().min(0, "Enter the amount outstanding"),
  interest_rate: z.coerce.number().min(0).max(100).optional(),
  monthly_payment: z.coerce.number().min(0).optional(),
  end_date: z.string().optional(),
  linked_asset_id: z.string().optional(),
  owner: z.string(),
});

const rentSchema = z.object({
  amount: z.coerce.number().min(0, "Enter the monthly rent"),
  currency: z.string(),
});

type LiabilityValues = z.infer<typeof liabilitySchema>;
type RentValues = z.infer<typeof rentSchema>;

export function StepLiabilities({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { profile } = useAuth();
  const liabilities = useLiabilities();
  const assets = useAssets();
  const expenses = useForecastExpenses();
  const saveLiability = useSaveRow("liabilities", "liabilities", "Liability");
  const removeLiability = useDeleteRow("liabilities", "liabilities", "Liability");
  const saveExpense = useSaveRow("forecast_expenses", "forecast_expenses", "Commitment");
  const removeExpense = useDeleteRow("forecast_expenses", "forecast_expenses", "Commitment");

  const ownerOptions = [
    { value: profile?.id ?? "me", label: profile?.display_name || "Me" },
    { value: "joint", label: "Joint / household" },
  ];

  const form = useForm<LiabilityValues>({
    resolver: zodResolver(liabilitySchema),
    defaultValues: {
      name: "",
      liability_type: "mortgage",
      currency: "GBP",
      outstanding_balance: 0,
      interest_rate: 0,
      monthly_payment: 0,
      end_date: "",
      linked_asset_id: "",
      owner: profile?.id ?? "joint",
    },
  });

  const rentForm = useForm<RentValues>({
    resolver: zodResolver(rentSchema),
    defaultValues: { amount: 0, currency: "GBP" },
  });

  const submit = form.handleSubmit((values) => {
    saveLiability.mutate(
      {
        values: {
          name: values.name.trim(),
          liability_type: values.liability_type,
          currency: values.currency,
          outstanding_balance: values.outstanding_balance,
          interest_rate: values.interest_rate ? values.interest_rate : null,
          monthly_payment: values.monthly_payment ? values.monthly_payment : null,
          end_date: values.end_date || null,
          linked_asset_id: values.linked_asset_id || null,
          owner_profile_id: values.owner === "joint" ? null : values.owner,
        },
      },
      {
        onSuccess: () =>
          form.reset({
            ...form.getValues(),
            name: "",
            outstanding_balance: 0,
            interest_rate: 0,
            monthly_payment: 0,
            end_date: "",
            linked_asset_id: "",
          }),
      },
    );
  });

  const submitRent = rentForm.handleSubmit((values) => {
    saveExpense.mutate(
      {
        values: {
          label: "Rent",
          amount: values.amount,
          currency: values.currency,
          frequency: "monthly",
          confidence: "committed",
          inflation_rate: 0,
          start_date: new Date().toISOString().slice(0, 10),
          owner_profile_id: null,
          notes: "Captured during setup. Rent is a cashflow commitment, not a liability.",
        },
      },
      { onSuccess: () => rentForm.reset({ amount: 0, currency: values.currency }) },
    );
  });

  const rentRows = (expenses.data ?? []).filter(
    (expense) => expense.label.toLowerCase() === "rent",
  );

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="hairline space-y-4 rounded-lg bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="Mortgage on the London flat" {...form.register("name")} />
          </Field>
          <Field label="Type">
            <SelectNative
              value={form.watch("liability_type")}
              onChange={(value) => form.setValue("liability_type", value)}
              options={LIABILITY_TYPES.map((type) => ({
                value: type,
                label: LIABILITY_TYPE_LABELS[type] ?? type,
              }))}
            />
          </Field>
          <Field label="Currency">
            <SelectNative
              value={form.watch("currency")}
              onChange={(value) => form.setValue("currency", value)}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          </Field>
          <Field
            label="Outstanding balance"
            error={form.formState.errors.outstanding_balance?.message}
          >
            <Input
              type="number"
              step="0.01"
              className="num"
              {...form.register("outstanding_balance")}
            />
          </Field>
          <Field label="Interest rate (%)">
            <Input type="number" step="0.01" className="num" {...form.register("interest_rate")} />
          </Field>
          <Field label="Monthly payment">
            <Input
              type="number"
              step="0.01"
              className="num"
              {...form.register("monthly_payment")}
            />
          </Field>
          <Field label="Final payment date">
            <Input type="date" {...form.register("end_date")} />
          </Field>
          <Field label="Held by">
            <SelectNative
              value={form.watch("owner")}
              onChange={(value) => form.setValue("owner", value)}
              options={ownerOptions}
            />
          </Field>
          <Field
            label="Secured against"
            hint="Link a mortgage to its property so the balance sheet shows the equity."
          >
            <SelectNative
              value={form.watch("linked_asset_id") ?? ""}
              onChange={(value) => form.setValue("linked_asset_id", value)}
              options={[
                { value: "", label: "Not secured" },
                ...(assets.data ?? []).map((asset) => ({ value: asset.id, label: asset.name })),
              ]}
            />
          </Field>
        </div>

        <Button type="submit" size="sm" variant="secondary" disabled={saveLiability.isPending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add liability
        </Button>
      </form>

      <AddedList
        emptyLabel="No debts recorded. If you carry none, that is worth knowing too — just continue."
        onRemove={(id) => removeLiability.mutate(id)}
        items={(liabilities.data ?? []).map((liability) => ({
          id: liability.id,
          title: liability.name,
          subtitle: [
            LIABILITY_TYPE_LABELS[liability.liability_type] ?? liability.liability_type,
            liability.interest_rate ? `${liability.interest_rate}%` : null,
            liability.linked_asset_id
              ? `secured on ${
                  (assets.data ?? []).find((asset) => asset.id === liability.linked_asset_id)
                    ?.name ?? "an asset"
                }`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          value: (
            <Money
              amount={liability.outstanding_balance}
              currency={liability.currency}
              className="text-sm"
            />
          ),
        }))}
      />

      <div className="hairline space-y-4 rounded-lg bg-surface p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-medium text-foreground">Do you pay rent?</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Rent is a monthly commitment rather than a debt, so it is recorded against cashflow and
            the emergency runway — not on the balance sheet.
          </p>
        </div>

        <form
          onSubmit={submitRent}
          className="grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
        >
          <Field label="Monthly rent" error={rentForm.formState.errors.amount?.message}>
            <Input type="number" step="0.01" className="num" {...rentForm.register("amount")} />
          </Field>
          <Field label="Currency">
            <SelectNative
              value={rentForm.watch("currency")}
              onChange={(value) => rentForm.setValue("currency", value)}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          </Field>
          <Button type="submit" size="sm" variant="secondary" disabled={saveExpense.isPending}>
            Add rent
          </Button>
        </form>

        {rentRows.length > 0 && (
          <AddedList
            emptyLabel=""
            onRemove={(id) => removeExpense.mutate(id)}
            items={rentRows.map((expense) => ({
              id: expense.id,
              title: "Rent",
              subtitle: `${FREQUENCY_LABELS[expense.frequency] ?? expense.frequency} · committed`,
              value: (
                <Money amount={expense.amount} currency={expense.currency} className="text-sm" />
              ),
            }))}
          />
        )}
      </div>

      <StepFooter onBack={onBack} onNext={onNext} />
    </div>
  );
}
