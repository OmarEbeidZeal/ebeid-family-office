import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  COUNTRIES,
  CURRENCIES,
  SHAREHOLDING_BASES,
  VALUATION_METHODS,
  VALUATION_METHOD_LABELS,
  VESTING_STATUSES,
  formatMoney,
} from "@/lib/format";
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
  acquisition_date: z.string().optional(),
  ownership_pct: z.coerce.number().min(0).max(100),
  valuation_method: z.string(),
  owner_profile_id: z.string(),
  is_liquid: z.string(),
  notes: z.string().optional(),
  // Private shareholding
  share_count: z.string().optional(),
  price_per_share: z.string().optional(),
  company_valuation: z.string().optional(),
  valuation_basis: z.string().optional(),
  vesting_status: z.string().optional(),
  vested_pct: z.string().optional(),
  liquidity_restriction: z.string().optional(),
  valuation_input: z.string().optional(),
});

type Values = z.infer<typeof schema>;

const numberOrNull = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function AssetSheet({
  open,
  onOpenChange,
  asset,
  defaultAssetClass,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: AssetRow | null;
  defaultAssetClass?: string;
}) {
  const { members } = useAuth();
  const save = useSaveRow("assets", "assets", "Asset");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      asset_class: defaultAssetClass ?? "property",
      country: "GB",
      currency: "GBP",
      current_value: 0,
      acquisition_cost: "",
      acquisition_date: "",
      ownership_pct: 100,
      valuation_method: "estimate",
      owner_profile_id: "joint",
      is_liquid: "false",
      notes: "",
      share_count: "",
      price_per_share: "",
      company_valuation: "",
      valuation_basis: "409a",
      vesting_status: "not_applicable",
      vested_pct: "",
      liquidity_restriction: "",
      valuation_input: "per_share",
    },
  });

  useEffect(() => {
    if (!open) return;
    const metadata = asset?.metadata ?? null;
    form.reset({
      name: asset?.name ?? "",
      asset_class: asset?.asset_class ?? defaultAssetClass ?? "property",
      country: asset?.country ?? "GB",
      currency: asset?.currency ?? "GBP",
      current_value: Number(asset?.current_value ?? 0),
      acquisition_cost: asset?.acquisition_cost != null ? String(asset.acquisition_cost) : "",
      acquisition_date: asset?.acquisition_date ?? "",
      ownership_pct: Number(metadata?.stake_pct ?? asset?.ownership_pct ?? 100),
      valuation_method: asset?.valuation_method ?? "estimate",
      owner_profile_id: asset?.owner_profile_id ?? "joint",
      is_liquid: asset?.is_liquid ? "true" : "false",
      notes: asset?.notes ?? "",
      share_count: metadata?.share_count != null ? String(metadata.share_count) : "",
      price_per_share: metadata?.price_per_share != null ? String(metadata.price_per_share) : "",
      company_valuation:
        metadata?.company_valuation != null ? String(metadata.company_valuation) : "",
      valuation_basis: metadata?.valuation_basis ?? "409a",
      vesting_status: metadata?.vesting_status ?? "not_applicable",
      vested_pct: metadata?.vested_pct != null ? String(metadata.vested_pct) : "",
      liquidity_restriction: metadata?.liquidity_restriction ?? "",
      valuation_input: metadata?.company_valuation != null ? "company" : "per_share",
    });
  }, [open, asset, defaultAssetClass, form]);

  const assetClass = form.watch("asset_class");
  const isPrivate = assetClass === "private_equity";
  const valuationInput = form.watch("valuation_input");
  const shareCount = numberOrNull(form.watch("share_count"));
  const pricePerShare = numberOrNull(form.watch("price_per_share"));
  const companyValuation = numberOrNull(form.watch("company_valuation"));
  const ownershipPct = Number(form.watch("ownership_pct") || 0);
  const currency = form.watch("currency");

  const derivedStakeValue = isPrivate
    ? valuationInput === "per_share"
      ? shareCount !== null && pricePerShare !== null
        ? shareCount * pricePerShare
        : null
      : companyValuation !== null
        ? companyValuation * (ownershipPct / 100)
        : null
    : null;

  const onSubmit = form.handleSubmit(async (values) => {
    let currentValue = values.current_value;
    let ownership = values.ownership_pct;
    let valuationMethod = values.valuation_method;
    let metadata: Record<string, unknown> | null = null;

    if (isPrivate) {
      const shares = numberOrNull(values.share_count);
      const price = numberOrNull(values.price_per_share);
      const companyValue = numberOrNull(values.company_valuation);

      if (values.valuation_input === "per_share") {
        // Shares held are already the household's slice.
        currentValue = shares !== null && price !== null ? shares * price : values.current_value;
      } else {
        currentValue =
          companyValue !== null
            ? (companyValue * values.ownership_pct) / 100
            : values.current_value;
      }
      // current_value is the household's own slice either way, so the row is 100% owned
      // and the stake percentage is kept as reporting metadata.
      ownership = 100;

      valuationMethod =
        SHAREHOLDING_BASES.find((basis) => basis.value === values.valuation_basis)?.method ??
        "estimate";

      metadata = {
        share_count: shares,
        price_per_share: price,
        company_valuation: values.valuation_input === "company" ? companyValue : null,
        stake_pct: values.valuation_input === "company" ? values.ownership_pct : null,
        valuation_basis: values.valuation_basis ?? null,
        vesting_status: values.vesting_status ?? null,
        vested_pct: numberOrNull(values.vested_pct),
        liquidity_restriction: values.liquidity_restriction?.trim() || null,
      };
    }

    await save.mutateAsync({
      id: asset?.id,
      values: {
        name: values.name,
        asset_class: values.asset_class,
        country: values.country,
        currency: values.currency,
        current_value: currentValue,
        acquisition_cost: numberOrNull(values.acquisition_cost),
        acquisition_date: values.acquisition_date || null,
        ownership_pct: ownership,
        valuation_method: valuationMethod,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        // A private shareholding is never spendable wealth.
        is_liquid: isPrivate ? false : values.is_liquid === "true",
        notes: values.notes?.trim() || null,
        metadata: metadata ?? {},
        last_valued_at: new Date().toISOString(),
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={asset ? "Edit asset" : "Add asset"}
      description={
        isPrivate
          ? "A private shareholding is recorded in full but always treated as illiquid — it never counts toward spendable wealth or emergency runway."
          : "Property, pensions held outside a platform, vehicles, land and valuables all belong here."
      }
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={asset ? "Save changes" : "Add asset"}
      footerNote={
        isPrivate && derivedStakeValue !== null
          ? `Recorded stake value: ${formatMoney(derivedStakeValue, currency)}. Saving stamps today as the valuation date.`
          : "Saving stamps today as the valuation date. Valuations go amber after 90 days and red after 180."
      }
    >
      <FullRow>
        <Field
          label={isPrivate ? "Company name" : "Name"}
          error={form.formState.errors.name?.message}
        >
          <Input placeholder={isPrivate ? "Zeal" : "London flat"} {...form.register("name")} />
        </Field>
      </FullRow>

      <Field label="Asset class">
        <Controller
          control={form.control}
          name="asset_class"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={ASSET_CLASSES.map((value) => ({
                value,
                label: ASSET_CLASS_LABELS[value] ?? value,
              }))}
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

      {isPrivate ? (
        <>
          <FullRow>
            <Field
              label="Valuation input"
              hint="Enter either a price per share, or the whole-company valuation and your percentage."
            >
              <Controller
                control={form.control}
                name="valuation_input"
                render={({ field }) => (
                  <SelectNative
                    value={field.value ?? "per_share"}
                    onChange={field.onChange}
                    options={[
                      { value: "per_share", label: "Shares × price per share" },
                      { value: "company", label: "Company valuation × ownership %" },
                    ]}
                  />
                )}
              />
            </Field>
          </FullRow>

          <Field label="Number of shares">
            <Input
              type="number"
              step="1"
              inputMode="numeric"
              placeholder="1,250,000"
              {...form.register("share_count")}
            />
          </Field>

          {valuationInput === "per_share" ? (
            <Field label="Price per share">
              <Input
                type="number"
                step="0.0001"
                inputMode="decimal"
                {...form.register("price_per_share")}
              />
            </Field>
          ) : (
            <>
              <Field label="Company valuation">
                <Input
                  type="number"
                  step="1000"
                  inputMode="decimal"
                  {...form.register("company_valuation")}
                />
              </Field>
              <Field label="Ownership %" error={form.formState.errors.ownership_pct?.message}>
                <Input
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  {...form.register("ownership_pct")}
                />
              </Field>
            </>
          )}

          <Field label="Valuation basis">
            <Controller
              control={form.control}
              name="valuation_basis"
              render={({ field }) => (
                <SelectNative
                  value={field.value ?? "409a"}
                  onChange={field.onChange}
                  options={SHAREHOLDING_BASES.map((basis) => ({
                    value: basis.value,
                    label: basis.label,
                  }))}
                />
              )}
            />
          </Field>

          <Field label="Vesting">
            <Controller
              control={form.control}
              name="vesting_status"
              render={({ field }) => (
                <SelectNative
                  value={field.value ?? "not_applicable"}
                  onChange={field.onChange}
                  options={VESTING_STATUSES.map((status) => ({
                    value: status.value,
                    label: status.label,
                  }))}
                />
              )}
            />
          </Field>

          <Field label="Vested %" hint="Leave blank if fully vested or not applicable.">
            <Input type="number" step="1" inputMode="numeric" {...form.register("vested_pct")} />
          </Field>

          <FullRow>
            <Field
              label="Liquidity restriction"
              hint="Lock-up, transfer restriction, right of first refusal, or when a secondary might be possible."
            >
              <Input
                placeholder="No secondary market; board consent required for transfer"
                {...form.register("liquidity_restriction")}
              />
            </Field>
          </FullRow>
        </>
      ) : (
        <>
          <Field label="Current value" error={form.formState.errors.current_value?.message}>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              {...form.register("current_value")}
            />
          </Field>
          <Field label="Ownership %" error={form.formState.errors.ownership_pct?.message}>
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              {...form.register("ownership_pct")}
            />
          </Field>
          <Field label="Valuation method">
            <Controller
              control={form.control}
              name="valuation_method"
              render={({ field }) => (
                <SelectNative
                  value={field.value}
                  onChange={field.onChange}
                  options={VALUATION_METHODS.map((method) => ({
                    value: method,
                    label: VALUATION_METHOD_LABELS[method] ?? method,
                  }))}
                />
              )}
            />
          </Field>
          <Field label="Liquid?" hint="Could it be sold within a month without a discount?">
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
        </>
      )}

      <Field label="Acquisition cost">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("acquisition_cost")}
        />
      </Field>
      <Field label="Acquired">
        <Input type="date" {...form.register("acquisition_date")} />
      </Field>

      <FullRow>
        <Field label="Notes">
          <Input
            placeholder="Anything worth remembering at the next valuation"
            {...form.register("notes")}
          />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
