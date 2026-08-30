import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "@/components/forms/FormField";
import { Money } from "@/components/Money";
import { StepFooter, AddedList } from "./OnboardingLayout";
import { useAssets } from "@/hooks/useFinancials";
import { useDeleteRow, useSaveRow } from "@/hooks/useUpsertRow";
import { useAuth } from "@/hooks/useAuth";
import {
  ASSET_CLASS_LABELS,
  COUNTRIES,
  CURRENCIES,
  SHAREHOLDING_BASES,
  VESTING_STATUSES,
  countryLabel,
} from "@/lib/format";

const KINDS = [
  { value: "property", label: "Property" },
  { value: "pension", label: "Pension" },
  { value: "private_equity", label: "Private company shareholding" },
  { value: "other", label: "Something else" },
] as const;

const schema = z.object({
  kind: z.string(),
  name: z.string().min(1, "Name the asset"),
  country: z.string(),
  currency: z.string(),
  ownership_pct: z.coerce.number().min(0).max(100),
  current_value: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
  owner: z.string(),
  // Private shareholding
  share_count: z.coerce.number().min(0).optional(),
  price_per_share: z.coerce.number().min(0).optional(),
  company_valuation: z.coerce.number().min(0).optional(),
  basis_mode: z.string().optional(),
  valuation_basis: z.string().optional(),
  vesting_status: z.string().optional(),
  vested_pct: z.coerce.number().min(0).max(100).optional(),
  liquidity_restriction: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function StepAssets({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { profile } = useAuth();
  const assets = useAssets();
  const save = useSaveRow("assets", "assets", "Asset");
  const remove = useDeleteRow("assets", "assets", "Asset");

  const ownerOptions = [
    { value: profile?.id ?? "me", label: profile?.display_name || "Me" },
    { value: "joint", label: "Joint / household" },
  ];

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: "property",
      name: "",
      country: "GB",
      currency: "GBP",
      ownership_pct: 100,
      current_value: 0,
      notes: "",
      owner: profile?.id ?? "joint",
      share_count: 0,
      price_per_share: 0,
      company_valuation: 0,
      basis_mode: "per_share",
      valuation_basis: "409a",
      vesting_status: "not_applicable",
      vested_pct: 100,
      liquidity_restriction: "",
    },
  });

  const kind = form.watch("kind");
  const basisMode = form.watch("basis_mode");
  const isPrivate = kind === "private_equity";

  const derivedPrivateValue = (values: Values) => {
    if (values.basis_mode === "per_share") {
      return (values.share_count ?? 0) * (values.price_per_share ?? 0);
    }
    return ((values.company_valuation ?? 0) * (values.ownership_pct ?? 0)) / 100;
  };

  const preview = isPrivate ? derivedPrivateValue(form.watch()) : null;

  const submit = form.handleSubmit((values) => {
    const basis = SHAREHOLDING_BASES.find((item) => item.value === values.valuation_basis);
    const value = isPrivate ? derivedPrivateValue(values) : (values.current_value ?? 0);

    save.mutate(
      {
        values: {
          name: values.name.trim(),
          asset_class: values.kind === "other" ? "other" : values.kind,
          country: values.country,
          currency: values.currency,
          current_value: value,
          // For a private stake the recorded value is already the household's own slice,
          // so the row is 100% owned and the stake percentage lives in metadata.
          ownership_pct: isPrivate ? 100 : values.ownership_pct,
          owner_profile_id: values.owner === "joint" ? null : values.owner,
          // Property, pensions and private stakes are never spendable wealth.
          is_liquid: false,
          valuation_method: isPrivate ? (basis?.method ?? "estimate") : "estimate",
          last_valued_at: new Date().toISOString(),
          notes: values.notes?.trim() || null,
          metadata: isPrivate
            ? {
                share_count: values.share_count ?? null,
                price_per_share:
                  values.basis_mode === "per_share" ? (values.price_per_share ?? null) : null,
                company_valuation:
                  values.basis_mode === "company" ? (values.company_valuation ?? null) : null,
                stake_pct: values.ownership_pct ?? null,
                valuation_basis: values.valuation_basis ?? null,
                vesting_status: values.vesting_status ?? null,
                vested_pct: values.vested_pct ?? null,
                liquidity_restriction: values.liquidity_restriction?.trim() || null,
              }
            : {},
        },
      },

      {
        onSuccess: () =>
          form.reset({
            ...form.getValues(),
            name: "",
            current_value: 0,
            share_count: 0,
            price_per_share: 0,
            company_valuation: 0,
            notes: "",
            liquidity_restriction: "",
          }),
      },
    );
  });

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="hairline space-y-4 rounded-lg bg-surface p-5 sm:p-6">
        <Field label="What are you adding?">
          <SelectNative
            value={kind}
            onChange={(value) => form.setValue("kind", value)}
            options={KINDS.map((item) => ({ value: item.value, label: item.label }))}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={isPrivate ? "Company name" : "Name"}
            error={form.formState.errors.name?.message}
          >
            <Input
              placeholder={isPrivate ? "Zeal" : "Flat in London, SIPP…"}
              {...form.register("name")}
            />
          </Field>
          <Field label="Country">
            <SelectNative
              value={form.watch("country")}
              onChange={(value) => form.setValue("country", value)}
              options={COUNTRIES.map((country) => ({ value: country.code, label: country.label }))}
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
            label={isPrivate ? "Your stake (%)" : "Your ownership (%)"}
            hint={isPrivate ? "Fully diluted, if you know it." : undefined}
          >
            <Input type="number" step="0.01" className="num" {...form.register("ownership_pct")} />
          </Field>
          {!isPrivate && (
            <Field label="Current value" error={form.formState.errors.current_value?.message}>
              <Input
                type="number"
                step="0.01"
                className="num"
                {...form.register("current_value")}
              />
            </Field>
          )}
        </div>

        {isPrivate && (
          <div className="space-y-4 rounded-md border border-border/70 bg-background/40 p-4">
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              A founder stake is real wealth but not spendable wealth. It is always recorded as
              illiquid and reported separately from the money you can actually reach.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Number of shares held">
                <Input type="number" step="1" className="num" {...form.register("share_count")} />
              </Field>
              <Field label="Value the stake by">
                <SelectNative
                  value={basisMode ?? "per_share"}
                  onChange={(value) => form.setValue("basis_mode", value)}
                  options={[
                    { value: "per_share", label: "Price per share" },
                    { value: "company", label: "Company valuation × stake" },
                  ]}
                />
              </Field>
              {basisMode === "per_share" ? (
                <Field label="Latest price per share">
                  <Input
                    type="number"
                    step="0.0001"
                    className="num"
                    {...form.register("price_per_share")}
                  />
                </Field>
              ) : (
                <Field label="Latest company valuation">
                  <Input
                    type="number"
                    step="1000"
                    className="num"
                    {...form.register("company_valuation")}
                  />
                </Field>
              )}
              <Field label="Valuation basis">
                <SelectNative
                  value={form.watch("valuation_basis") ?? "409a"}
                  onChange={(value) => form.setValue("valuation_basis", value)}
                  options={SHAREHOLDING_BASES.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                />
              </Field>
              <Field label="Vesting">
                <SelectNative
                  value={form.watch("vesting_status") ?? "not_applicable"}
                  onChange={(value) => form.setValue("vesting_status", value)}
                  options={VESTING_STATUSES.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                />
              </Field>
              <Field label="Vested (%)">
                <Input type="number" step="1" className="num" {...form.register("vested_pct")} />
              </Field>
            </div>
            <Field
              label="Liquidity restriction"
              hint="Lock-up, right of first refusal, board consent — anything stopping a sale."
            >
              <Input
                placeholder="No secondary market; board consent required"
                {...form.register("liquidity_restriction")}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Recorded value{" "}
              <span className="num text-foreground">
                {preview !== null && (
                  <Money
                    amount={preview}
                    currency={form.watch("currency")}
                    align="left"
                    hideConverted
                  />
                )}
              </span>
            </p>
          </div>
        )}

        <Field label="Notes">
          <Textarea
            rows={2}
            placeholder="Anything worth remembering."
            {...form.register("notes")}
          />
        </Field>

        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add asset
        </Button>
      </form>

      <AddedList
        emptyLabel="No assets yet. Property, pensions and any company shareholding belong here."
        onRemove={(id) => remove.mutate(id)}
        items={(assets.data ?? []).map((asset) => {
          const stake = asset.metadata?.stake_pct ?? null;
          const share =
            asset.asset_class === "private_equity"
              ? stake != null
                ? `${stake}% stake`
                : "shareholding"
              : `${asset.ownership_pct}% owned`;
          return {
            id: asset.id,
            title: asset.name,
            subtitle: `${ASSET_CLASS_LABELS[asset.asset_class] ?? asset.asset_class} · ${countryLabel(
              asset.country,
            )} · ${share} · illiquid`,
            value: (
              <Money amount={asset.current_value} currency={asset.currency} className="text-sm" />
            ),
          };
        })}
      />

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        nextLabel={(assets.data?.length ?? 0) ? "Continue" : "Skip for now"}
      />
    </div>
  );
}
