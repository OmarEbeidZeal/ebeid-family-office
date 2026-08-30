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
import { CURRENCIES, LIABILITY_TYPES, titleise } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useSaveRow } from "@/hooks/useUpsertRow";
import type { LiabilityRow } from "@/hooks/useFinancials";

const schema = z.object({
  name: z.string().min(2, "Name the liability"),
  liability_type: z.string(),
  currency: z.string(),
  outstanding_balance: z.coerce.number().min(0),
  original_amount: z.string().optional(),
  interest_rate: z.string().optional(),
  monthly_payment: z.string().optional(),
  end_date: z.string().optional(),
  owner_profile_id: z.string(),
});

type Values = z.infer<typeof schema>;

export function LiabilityDialog({
  open,
  onOpenChange,
  liability,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liability?: LiabilityRow | null;
}) {
  const { members } = useAuth();
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
      end_date: "",
      owner_profile_id: "joint",
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
      end_date: liability?.end_date ?? "",
      owner_profile_id: liability?.owner_profile_id ?? "joint",
    });
  }, [open, liability, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: liability?.id,
      values: {
        name: values.name,
        liability_type: values.liability_type,
        currency: values.currency,
        outstanding_balance: values.outstanding_balance,
        original_amount: values.original_amount ? Number(values.original_amount) : null,
        interest_rate: values.interest_rate ? Number(values.interest_rate) : null,
        monthly_payment: values.monthly_payment ? Number(values.monthly_payment) : null,
        end_date: values.end_date || null,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
      },
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{liability ? "Edit liability" : "Add liability"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" error={form.formState.errors.name?.message}>
              <Input placeholder="London flat mortgage" {...form.register("name")} />
            </Field>
          </div>
          <Field label="Type">
            <Controller
              control={form.control}
              name="liability_type"
              render={({ field }) => (
                <SelectNative
                  value={field.value}
                  onChange={field.onChange}
                  options={LIABILITY_TYPES.map((t) => ({ value: t, label: titleise(t) }))}
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
                  options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </Field>
          <Field
            label="Outstanding balance"
            error={form.formState.errors.outstanding_balance?.message}
          >
            <Input type="number" step="0.01" {...form.register("outstanding_balance")} />
          </Field>
          <Field label="Original amount">
            <Input type="number" step="0.01" {...form.register("original_amount")} />
          </Field>
          <Field label="Interest rate %">
            <Input type="number" step="0.01" {...form.register("interest_rate")} />
          </Field>
          <Field label="Monthly payment">
            <Input type="number" step="0.01" {...form.register("monthly_payment")} />
          </Field>
          <Field label="Ends">
            <Input type="date" {...form.register("end_date")} />
          </Field>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save liability"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
