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
import { ASSET_CLASSES, COUNTRIES, CURRENCIES, VALUATION_METHODS, titleise } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { useSaveRow } from "@/hooks/useUpsertRow";
import type { AssetRow } from "@/hooks/useFinancials";

const schema = z.object({
  name: z.string().min(2, "Name the asset"),
  asset_class: z.string(),
  country: z.string(),
  currency: z.string(),
  current_value: z.coerce.number().min(0, "Must be zero or more"),
  acquisition_cost: z.string().optional(),
  ownership_pct: z.coerce.number().min(0).max(100),
  valuation_method: z.string(),
  owner_profile_id: z.string(),
  is_liquid: z.string(),
});

type Values = z.infer<typeof schema>;

export function AssetDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: AssetRow | null;
}) {
  const { members } = useAuth();
  const save = useSaveRow("assets", "assets", "Asset");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      asset_class: "property",
      country: "GB",
      currency: "GBP",
      current_value: 0,
      acquisition_cost: "",
      ownership_pct: 100,
      valuation_method: "estimate",
      owner_profile_id: "joint",
      is_liquid: "false",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: asset?.name ?? "",
      asset_class: asset?.asset_class ?? "property",
      country: asset?.country ?? "GB",
      currency: asset?.currency ?? "GBP",
      current_value: Number(asset?.current_value ?? 0),
      acquisition_cost: asset?.acquisition_cost != null ? String(asset.acquisition_cost) : "",
      ownership_pct: Number(asset?.ownership_pct ?? 100),
      valuation_method: asset?.valuation_method ?? "estimate",
      owner_profile_id: asset?.owner_profile_id ?? "joint",
      is_liquid: asset?.is_liquid ? "true" : "false",
    });
  }, [open, asset, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: asset?.id,
      values: {
        name: values.name,
        asset_class: values.asset_class,
        country: values.country,
        currency: values.currency,
        current_value: values.current_value,
        acquisition_cost: values.acquisition_cost ? Number(values.acquisition_cost) : null,
        ownership_pct: values.ownership_pct,
        valuation_method: values.valuation_method,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        is_liquid: values.is_liquid === "true",
        last_valued_at: new Date().toISOString(),
      },
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit asset" : "Add asset"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" error={form.formState.errors.name?.message}>
              <Input placeholder="London flat" {...form.register("name")} />
            </Field>
          </div>
          <Field label="Asset class">
            <Controller
              control={form.control}
              name="asset_class"
              render={({ field }) => (
                <SelectNative
                  value={field.value}
                  onChange={field.onChange}
                  options={ASSET_CLASSES.map((c) => ({ value: c, label: titleise(c) }))}
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
          <Field label="Current value" error={form.formState.errors.current_value?.message}>
            <Input type="number" step="0.01" {...form.register("current_value")} />
          </Field>
          <Field label="Acquisition cost">
            <Input type="number" step="0.01" {...form.register("acquisition_cost")} />
          </Field>
          <Field label="Ownership %" error={form.formState.errors.ownership_pct?.message}>
            <Input type="number" step="0.1" {...form.register("ownership_pct")} />
          </Field>
          <Field label="Valuation method">
            <Controller
              control={form.control}
              name="valuation_method"
              render={({ field }) => (
                <SelectNative
                  value={field.value}
                  onChange={field.onChange}
                  options={VALUATION_METHODS.map((m) => ({ value: m, label: titleise(m) }))}
                />
              )}
            />
          </Field>
          <Field label="Liquid?" hint="Can it be sold within a month without a discount?">
            <Controller
              control={form.control}
              name="is_liquid"
              render={({ field }) => (
                <SelectNative
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "false", label: "Illiquid" },
                    { value: "true", label: "Liquid" },
                  ]}
                />
              )}
            />
          </Field>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
