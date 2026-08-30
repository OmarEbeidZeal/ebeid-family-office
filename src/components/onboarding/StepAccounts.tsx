import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { Money } from "@/components/Money";
import { StepFooter, AddedList } from "./OnboardingLayout";
import { useAccounts } from "@/hooks/useFinancials";
import { useDeleteRow, useSaveRow } from "@/hooks/useUpsertRow";
import { useAuth } from "@/hooks/useAuth";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  COUNTRIES,
  CURRENCIES,
  countryLabel,
} from "@/lib/format";

const DEBT_TYPES = ["credit_card", "loan", "mortgage"];

const schema = z.object({
  nickname: z.string().min(1, "Give the account a name"),
  institution: z.string().optional(),
  account_type: z.string(),
  country: z.string(),
  currency: z.string(),
  owner: z.string(),
  balance: z.coerce.number().finite("Enter a number"),
});

type Values = z.infer<typeof schema>;

export function StepAccounts({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { profile, household } = useAuth();
  const accounts = useAccounts();
  const save = useSaveRow("accounts", "accounts", "Account");
  const remove = useDeleteRow("accounts", "accounts", "Account");

  const ownerOptions = [
    { value: profile?.id ?? "me", label: profile?.display_name || "Me" },
    { value: "joint", label: household?.partner_display_name ? "Joint" : "Joint / household" },
  ];

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      nickname: "",
      institution: "",
      account_type: "current",
      country: "GB",
      currency: "GBP",
      owner: profile?.id ?? "joint",
      balance: 0,
    },
  });

  const accountType = form.watch("account_type");
  const isDebt = DEBT_TYPES.includes(accountType);

  const submit = form.handleSubmit((values) => {
    const magnitude = Math.abs(values.balance);
    save.mutate(
      {
        values: {
          nickname: values.nickname.trim(),
          institution: values.institution?.trim() || null,
          account_type: values.account_type,
          country: values.country,
          currency: values.currency,
          owner_profile_id: values.owner === "joint" ? null : values.owner,
          is_joint: values.owner === "joint",
          is_active: true,
          current_balance: isDebt ? -magnitude : values.balance,
          last_balance_update: new Date().toISOString(),
        },
      },
      {
        onSuccess: () =>
          form.reset({
            ...form.getValues(),
            nickname: "",
            institution: "",
            balance: 0,
          }),
      },
    );
  });

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="hairline space-y-4 rounded-lg bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account name" error={form.formState.errors.nickname?.message}>
            <Input placeholder="Everyday current account" {...form.register("nickname")} />
          </Field>
          <Field label="Institution">
            <Input placeholder="Monzo, CIB, Arab Bank…" {...form.register("institution")} />
          </Field>
          <Field label="Type">
            <SelectNative
              value={form.watch("account_type")}
              onChange={(value) => form.setValue("account_type", value)}
              options={ACCOUNT_TYPES.map((type) => ({
                value: type,
                label: ACCOUNT_TYPE_LABELS[type] ?? type,
              }))}
            />
          </Field>
          <Field label="Country">
            <SelectNative
              value={form.watch("country")}
              onChange={(value) => form.setValue("country", value)}
              options={COUNTRIES.map((country) => ({
                value: country.code,
                label: country.label,
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
          <Field label="Held by">
            <SelectNative
              value={form.watch("owner")}
              onChange={(value) => form.setValue("owner", value)}
              options={ownerOptions}
            />
          </Field>
          <Field
            label={isDebt ? "Amount owed" : "Current balance"}
            error={form.formState.errors.balance?.message}
            hint={isDebt ? "Recorded as a negative balance." : undefined}
          >
            <Input type="number" step="0.01" className="num" {...form.register("balance")} />
          </Field>
        </div>

        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add account
        </Button>
      </form>

      <AddedList
        emptyLabel="No accounts yet. Add each one you hold — you can edit them any time from Accounts."
        onRemove={(id) => remove.mutate(id)}
        items={(accounts.data ?? []).map((account) => ({
          id: account.id,
          title: account.nickname,
          subtitle: `${ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type} · ${
            account.institution ?? "No institution"
          } · ${countryLabel(account.country)}`,
          value: (
            <Money
              amount={account.current_balance}
              currency={account.currency}
              className="text-sm"
            />
          ),
        }))}
      />

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        nextLabel={(accounts.data?.length ?? 0) ? "Continue" : "Skip for now"}
      />
    </div>
  );
}
