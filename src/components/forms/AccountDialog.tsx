import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "./FormField";
import { ACCOUNT_TYPES, COUNTRIES, CURRENCIES, titleise } from "@/lib/format";
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
});

type Values = z.infer<typeof schema>;

export function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountRow | null;
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
      owner_profile_id: profile?.id ?? "",
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
      owner_profile_id:
        account?.owner_profile_id ?? (account?.is_joint ? "joint" : (profile?.id ?? "")),
    });
  }, [open, account, profile?.id, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: account?.id,
      values: {
        nickname: values.nickname,
        institution: values.institution || null,
        country: values.country,
        account_type: values.account_type,
        currency: values.currency,
        current_balance: values.current_balance,
        is_joint: values.owner_profile_id === "joint",
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        last_balance_update: new Date().toISOString(),
      },
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nickname" error={form.formState.errors.nickname?.message}>
              <Input placeholder="Everyday current account" {...form.register("nickname")} />
            </Field>
          </div>
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
                    ...members.map((member) => ({
                      value: member.id,
                      label: member.display_name ?? member.full_name ?? member.email,
                    })),
                    { value: "joint", label: "Joint" },
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
                  options={ACCOUNT_TYPES.map((type) => ({ value: type, label: titleise(type) }))}
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
                  options={COUNTRIES.map((c) => ({ value: c.code, label: c.label }))}
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
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </Field>
          <Field
            label="Current balance"
            error={form.formState.errors.current_balance?.message}
            hint="Debts (cards, loans) can be entered as a positive amount owed."
          >
            <Input type="number" step="0.01" {...form.register("current_balance")} />
          </Field>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
