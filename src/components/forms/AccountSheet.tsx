import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  COUNTRIES,
  CURRENCIES,
  DEBT_ACCOUNT_TYPES,
} from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useSaveRow } from "@/hooks/useUpsertRow";
import type { AccountRow } from "@/hooks/useFinancials";

const schema = z.object({
  nickname: z.string().min(2, "Give the account a name"),
  institution: z.string().optional(),
  country: z.string().min(2),
  account_type: z.string().min(2),
  currency: z.string().min(3),
  current_balance: z.coerce.number(),
  owner_profile_id: z.string(),
  is_active: z.string(),
});

type Values = z.infer<typeof schema>;

export function AccountSheet({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountRow | null;
  /** Fired with the saved account's id, so callers can select what was just created. */
  onSaved?: ((id: string) => void) | undefined;
}) {
  const { members, profile } = useAuth();
  const save = useSaveRow("accounts", "accounts", "Account");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      nickname: "",
      institution: "",
      country: "GB",
      account_type: "current",
      currency: "GBP",
      current_balance: 0,
      owner_profile_id: profile?.id ?? "joint",
      is_active: "true",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      nickname: account?.nickname ?? "",
      institution: account?.institution ?? "",
      country: account?.country ?? "GB",
      account_type: account?.account_type ?? "current",
      currency: account?.currency ?? "GBP",
      current_balance: Number(account?.current_balance ?? 0),
      owner_profile_id: account?.is_joint
        ? "joint"
        : (account?.owner_profile_id ?? profile?.id ?? "joint"),
      is_active: account ? (account.is_active ? "true" : "false") : "true",
    });
  }, [open, account, profile?.id, form]);

  const accountType = form.watch("account_type");
  const isDebt = DEBT_ACCOUNT_TYPES.includes(accountType);

  const onSubmit = form.handleSubmit(async (values) => {
    const savedId = await save.mutateAsync({
      id: account?.id,
      values: {
        nickname: values.nickname,
        institution: values.institution?.trim() || null,
        country: values.country,
        account_type: values.account_type,
        currency: values.currency,
        current_balance: Math.abs(values.current_balance),
        is_joint: values.owner_profile_id === "joint",
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        is_active: values.is_active === "true",
        last_balance_update: new Date().toISOString(),
      },
    });
    if (savedId) onSaved?.(savedId);
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? "Edit account" : "Add account"}
      description="Balances are entered by hand until statement import lands. Saving stamps today's date on the balance."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={account ? "Save changes" : "Add account"}
      footerNote={
        isDebt
          ? "Enter what is owed as a positive figure — the platform subtracts it from net worth."
          : undefined
      }
    >
      <FullRow>
        <Field label="Nickname" error={form.formState.errors.nickname?.message}>
          <Input placeholder="Everyday current account" {...form.register("nickname")} />
        </Field>
      </FullRow>

      <Field label="Institution">
        <Input placeholder="HSBC UK" {...form.register("institution")} />
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

      <Field label="Type">
        <Controller
          control={form.control}
          name="account_type"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={ACCOUNT_TYPES.map((type) => ({
                value: type,
                label: ACCOUNT_TYPE_LABELS[type] ?? type,
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

      <Field
        label={isDebt ? "Amount owed" : "Current balance"}
        error={form.formState.errors.current_balance?.message}
      >
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("current_balance")}
        />
      </Field>

      {account && (
        <Field label="Status" hint="Closed accounts drop out of every total.">
          <Controller
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <SelectNative
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: "true", label: "Open" },
                  { value: "false", label: "Closed" },
                ]}
              />
            )}
          />
        </Field>
      )}
    </FormSheet>
  );
}
