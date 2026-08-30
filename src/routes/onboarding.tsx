import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { AccountDialog } from "@/components/forms/AccountDialog";
import { AssetDialog } from "@/components/forms/AssetDialog";
import { LiabilityDialog } from "@/components/forms/LiabilityDialog";
import { Money } from "@/components/Money";
import {
  useAccounts,
  useAssets,
  useForecastExpenses,
  useGoals,
  useIncomeStreams,
  useLiabilities,
} from "@/hooks/useFinancials";
import { useAuth } from "@/hooks/useAuth";
import { useDeleteRow, useSaveRow } from "@/hooks/useUpsertRow";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCIES, titleise } from "@/lib/format";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Household Setup | Ebeid Family Office" },
      {
        name: "description",
        content:
          "A guided setup that captures accounts, property, debts, income and commitments so the family office is live in minutes.",
      },
      { property: "og:title", content: "Household Setup | Ebeid Family Office" },
      {
        property: "og:description",
        content: "Capture accounts, property, debts, income and commitments in one guided pass.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingRoute,
});

function OnboardingRoute() {
  return (
    <AppShell>
      <Onboarding />
    </AppShell>
  );
}

const STEPS = [
  { key: "household", title: "Household", blurb: "Name the office and choose the reporting currency." },
  { key: "accounts", title: "Accounts", blurb: "Banking, savings, brokerage and cards across every country." },
  { key: "assets", title: "Assets", blurb: "Property, private equity, pensions and anything else owned." },
  { key: "liabilities", title: "Liabilities", blurb: "Mortgages, loans and balances carried." },
  { key: "cashflow", title: "Cash flow", blurb: "Income streams and committed monthly outgoings." },
  { key: "goals", title: "Goals", blurb: "What the money is actually for." },
] as const;

function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step] ?? STEPS[0];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-2 text-2xl font-light">{current.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{current.blurb}</p>
        <div className="mt-5 flex gap-1.5">
          {STEPS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              aria-label={item.title}
              onClick={() => setStep(index)}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index <= step ? "bg-gold" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="hairline rounded-lg bg-surface p-6">
        {current.key === "household" && <HouseholdStep />}
        {current.key === "accounts" && <AccountsStep />}
        {current.key === "assets" && <AssetsStep />}
        {current.key === "liabilities" && <LiabilitiesStep />}
        {current.key === "cashflow" && <CashflowStep />}
        {current.key === "goals" && <GoalsStep />}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
            Finish later
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((value) => value + 1)}>Continue</Button>
          ) : (
            <Button onClick={() => navigate({ to: "/" })}>
              <Check className="size-4" /> Open dashboard
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function HouseholdStep() {
  const { household, profile } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(household?.name ?? "Ebeid Family Office");
  const [currency, setCurrency] = useState(household?.base_currency ?? "GBP");
  const [displayName, setDisplayName] = useState(profile?.display_name ?? profile?.full_name ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const [{ error: householdError }, { error: profileError }] = await Promise.all([
        supabase.from("households").update({ name, base_currency: currency }).eq("id", household!.id),
        supabase.from("profiles").update({ display_name: displayName }).eq("id", profile!.id),
      ]);
      if (householdError) throw householdError;
      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Household saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Household name">
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Base currency" hint="Everything is reported in this currency.">
        <SelectNative
          value={currency}
          onChange={setCurrency}
          options={CURRENCIES.map((code) => ({ value: code, label: code }))}
        />
      </Field>
      <Field label="Your name">
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </Field>
      <div className="flex items-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}

function StepList({
  items,
  onDelete,
  emptyText,
}: {
  items: { id: string; primary: string; secondary?: string; amount: number; currency: string }[];
  onDelete: (id: string) => void;
  emptyText: string;
}) {
  if (!items.length) return <p className="py-6 text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm">{item.primary}</p>
            {item.secondary && (
              <p className="truncate text-xs text-muted-foreground">{item.secondary}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Money amount={item.amount} currency={item.currency} />
            <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => onDelete(item.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AccountsStep() {
  const { data } = useAccounts();
  const remove = useDeleteRow("accounts", "accounts", "Account");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <StepList
        items={(data ?? []).map((row) => ({
          id: row.id,
          primary: row.nickname,
          secondary: [row.institution, titleise(row.account_type), row.country].filter(Boolean).join(" · "),
          amount: Number(row.current_balance),
          currency: row.currency,
        }))}
        onDelete={(id) => remove.mutate(id)}
        emptyText="No accounts yet. Start with the everyday current account."
      />
      <Button className="mt-4" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add account
      </Button>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function AssetsStep() {
  const { data } = useAssets();
  const remove = useDeleteRow("assets", "assets", "Asset");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <StepList
        items={(data ?? []).map((row) => ({
          id: row.id,
          primary: row.name,
          secondary: `${titleise(row.asset_class)} · ${Number(row.ownership_pct).toFixed(0)}% owned`,
          amount: Number(row.current_value),
          currency: row.currency,
        }))}
        onDelete={(id) => remove.mutate(id)}
        emptyText="No assets yet. Property and private holdings usually dominate here."
      />
      <Button className="mt-4" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add asset
      </Button>
      <AssetDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function LiabilitiesStep() {
  const { data } = useLiabilities();
  const remove = useDeleteRow("liabilities", "liabilities", "Liability");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <StepList
        items={(data ?? []).map((row) => ({
          id: row.id,
          primary: row.name,
          secondary: titleise(row.liability_type),
          amount: -Number(row.outstanding_balance),
          currency: row.currency,
        }))}
        onDelete={(id) => remove.mutate(id)}
        emptyText="No liabilities yet. Add mortgages and loans so net worth is honest."
      />
      <Button className="mt-4" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add liability
      </Button>
      <LiabilityDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

function CashflowStep() {
  const { profile } = useAuth();
  const income = useIncomeStreams();
  const expenses = useForecastExpenses();
  const saveIncome = useSaveRow("income_streams", "income_streams", "Income stream");
  const saveExpense = useSaveRow("forecast_expenses", "forecast_expenses", "Commitment");
  const removeIncome = useDeleteRow("income_streams", "income_streams", "Income stream");
  const removeExpense = useDeleteRow("forecast_expenses", "forecast_expenses", "Commitment");

  const [incomeForm, setIncomeForm] = useState({
    label: "",
    amount: "",
    currency: "GBP",
    frequency: "monthly",
  });
  const [expenseForm, setExpenseForm] = useState({
    label: "",
    amount: "",
    currency: "GBP",
    frequency: "monthly",
  });

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium">Income</h3>
        <StepList
          items={(income.data ?? []).map((row) => ({
            id: row.id,
            primary: row.label,
            secondary: `${titleise(row.income_type)} · ${titleise(row.frequency)}`,
            amount: Number(row.net_amount ?? row.gross_amount),
            currency: row.currency,
          }))}
          onDelete={(id) => removeIncome.mutate(id)}
          emptyText="Salary, dividends, rent received — net figures where you know them."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="Label">
            <Input
              value={incomeForm.label}
              onChange={(event) => setIncomeForm({ ...incomeForm, label: event.target.value })}
            />
          </Field>
          <Field label="Net amount">
            <Input
              type="number"
              value={incomeForm.amount}
              onChange={(event) => setIncomeForm({ ...incomeForm, amount: event.target.value })}
            />
          </Field>
          <Field label="Currency">
            <SelectNative
              value={incomeForm.currency}
              onChange={(value) => setIncomeForm({ ...incomeForm, currency: value })}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          </Field>
          <Field label="Frequency">
            <SelectNative
              value={incomeForm.frequency}
              onChange={(value) => setIncomeForm({ ...incomeForm, frequency: value })}
              options={FREQUENCIES}
            />
          </Field>
        </div>
        <Button
          className="mt-3"
          variant="secondary"
          disabled={!incomeForm.label || !incomeForm.amount || saveIncome.isPending}
          onClick={async () => {
            await saveIncome.mutateAsync({
              values: {
                label: incomeForm.label,
                income_type: "salary",
                gross_amount: Number(incomeForm.amount),
                net_amount: Number(incomeForm.amount),
                currency: incomeForm.currency,
                frequency: incomeForm.frequency,
                owner_profile_id: profile?.id ?? null,
              },
            });
            setIncomeForm({ label: "", amount: "", currency: "GBP", frequency: "monthly" });
          }}
        >
          <Plus className="size-4" /> Add income
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-medium">Committed outgoings</h3>
        <StepList
          items={(expenses.data ?? []).map((row) => ({
            id: row.id,
            primary: row.label,
            secondary: titleise(row.frequency),
            amount: -Number(row.amount),
            currency: row.currency,
          }))}
          onDelete={(id) => removeExpense.mutate(id)}
          emptyText="Rent or mortgage, nursery, council tax, insurance, family support."
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="Label">
            <Input
              value={expenseForm.label}
              onChange={(event) => setExpenseForm({ ...expenseForm, label: event.target.value })}
            />
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              value={expenseForm.amount}
              onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}
            />
          </Field>
          <Field label="Currency">
            <SelectNative
              value={expenseForm.currency}
              onChange={(value) => setExpenseForm({ ...expenseForm, currency: value })}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          </Field>
          <Field label="Frequency">
            <SelectNative
              value={expenseForm.frequency}
              onChange={(value) => setExpenseForm({ ...expenseForm, frequency: value })}
              options={FREQUENCIES}
            />
          </Field>
        </div>
        <Button
          className="mt-3"
          variant="secondary"
          disabled={!expenseForm.label || !expenseForm.amount || saveExpense.isPending}
          onClick={async () => {
            await saveExpense.mutateAsync({
              values: {
                label: expenseForm.label,
                amount: Number(expenseForm.amount),
                currency: expenseForm.currency,
                frequency: expenseForm.frequency,
                confidence: "committed",
                owner_profile_id: null,
              },
            });
            setExpenseForm({ label: "", amount: "", currency: "GBP", frequency: "monthly" });
          }}
        >
          <Plus className="size-4" /> Add commitment
        </Button>
      </div>
    </div>
  );
}

function GoalsStep() {
  const goals = useGoals();
  const save = useSaveRow("goals", "goals", "Goal");
  const remove = useDeleteRow("goals", "goals", "Goal");
  const [form, setForm] = useState({
    title: "",
    target_amount: "",
    currency: "GBP",
    goal_category: "other",
    target_date: "",
  });

  return (
    <div>
      <StepList
        items={(goals.data ?? []).map((row) => ({
          id: row.id,
          primary: row.title,
          secondary: `${titleise(row.goal_category)}${row.target_date ? ` · by ${new Date(row.target_date).toLocaleDateString("en-GB")}` : ""}`,
          amount: Number(row.target_amount),
          currency: row.currency,
        }))}
        onDelete={(id) => remove.mutate(id)}
        emptyText="Emergency buffer, school fees, the Cairo property — anything with a number and a date."
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <Field label="Goal">
          <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <Field label="Target">
          <Input
            type="number"
            value={form.target_amount}
            onChange={(event) => setForm({ ...form, target_amount: event.target.value })}
          />
        </Field>
        <Field label="Currency">
          <SelectNative
            value={form.currency}
            onChange={(value) => setForm({ ...form, currency: value })}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          />
        </Field>
        <Field label="Category">
          <SelectNative
            value={form.goal_category}
            onChange={(value) => setForm({ ...form, goal_category: value })}
            options={[
              { value: "emergency_fund", label: "Emergency fund" },
              { value: "property", label: "Property" },
              { value: "home_improvement", label: "Home improvement" },
              { value: "education", label: "Education" },
              { value: "business", label: "Business" },
              { value: "family", label: "Family" },
              { value: "travel", label: "Travel" },
              { value: "retirement", label: "Retirement" },
              { value: "other", label: "Other" },
            ]}
          />
        </Field>
        <Field label="Target date">
          <Input
            type="date"
            value={form.target_date}
            onChange={(event) => setForm({ ...form, target_date: event.target.value })}
          />
        </Field>
      </div>
      <Button
        className="mt-3"
        variant="secondary"
        disabled={!form.title || !form.target_amount || save.isPending}
        onClick={async () => {
          await save.mutateAsync({
            values: {
              title: form.title,
              target_amount: Number(form.target_amount),
              currency: form.currency,
              goal_category: form.goal_category,
              target_date: form.target_date || null,
              priority: "want",
              status: "saving",
            },
          });
          setForm({ title: "", target_amount: "", currency: "GBP", goal_category: "other", target_date: "" });
        }}
      >
        <Plus className="size-4" /> Add goal
      </Button>
    </div>
  );
}
