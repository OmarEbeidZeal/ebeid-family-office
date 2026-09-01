import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { useSaveRow } from "@/hooks/useUpsertRow";
import {
  MANDATE_PRESETS,
  MANDATE_SLEEVES,
  mandateSleeveLabel,
  mandateSleeveNote,
  type Mandate,
  type MandateType,
} from "@/lib/mandates";

const MANDATE_TYPES = [
  { value: "conventional", label: "Conventional" },
  { value: "shariah", label: "Shariah" },
];

const pct = z.coerce.number().min(0, "Cannot be negative").max(100, "Cannot exceed 100%");

const schema = z
  .object({
    mandate_type: z.string(),
    target_core_pct: pct,
    target_income_pct: pct,
    target_thematic_pct: pct,
    target_satellite_pct: pct,
    speculative_cap_pct: pct,
    single_name_cap_pct: pct,
    crypto_cap_pct: pct,
    additional_constraints: z.string(),
    notes: z.string(),
  })
  .superRefine((values, ctx) => {
    const total =
      values.target_core_pct +
      values.target_income_pct +
      values.target_thematic_pct +
      values.target_satellite_pct;
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({
        code: "custom",
        path: ["target_core_pct"],
        message: `The four targets must total 100%. They currently total ${total.toFixed(1)}%.`,
      });
    }
    if (values.mandate_type === "shariah" && values.target_income_pct > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["target_income_pct"],
        message:
          "A Shariah mandate holds income through sukuk or a compliant income fund only. Leave this at 0 unless one is actually held.",
      });
    }
  });

type Values = z.infer<typeof schema>;

const FIELD_BY_SLEEVE = {
  core: "target_core_pct",
  income: "target_income_pct",
  thematic: "target_thematic_pct",
  satellite: "target_satellite_pct",
} as const;

/**
 * The mandate is written down, not inferred. Choosing a preset fills in what
 * the household already agreed for that style; every figure stays editable.
 */
export function MandateSheet({
  open,
  onOpenChange,
  mandate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mandate: Mandate | null;
}) {
  const save = useSaveRow("investment_mandates", "investment_mandates", "Mandate");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      mandate_type: "conventional",
      target_core_pct: 60,
      target_income_pct: 15,
      target_thematic_pct: 15,
      target_satellite_pct: 10,
      speculative_cap_pct: 10,
      single_name_cap_pct: 3,
      crypto_cap_pct: 5,
      additional_constraints: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open || !mandate) return;
    form.reset({
      mandate_type: mandate.type,
      target_core_pct: mandate.targets.core,
      target_income_pct: mandate.targets.income,
      target_thematic_pct: mandate.targets.thematic,
      target_satellite_pct: mandate.targets.satellite,
      speculative_cap_pct: mandate.speculativeCapPct,
      single_name_cap_pct: mandate.singleNameCapPct,
      crypto_cap_pct: mandate.cryptoCapPct,
      additional_constraints:
        mandate.additionalConstraints ?? MANDATE_PRESETS[mandate.type].constraints,
      notes: mandate.notes ?? "",
    });
  }, [open, mandate, form]);

  const type = form.watch("mandate_type") as MandateType;

  const applyPreset = (next: MandateType) => {
    const preset = MANDATE_PRESETS[next];
    form.setValue("mandate_type", next, { shouldDirty: true });
    form.setValue("target_core_pct", preset.targets.core, { shouldDirty: true });
    form.setValue("target_income_pct", preset.targets.income, { shouldDirty: true });
    form.setValue("target_thematic_pct", preset.targets.thematic, { shouldDirty: true });
    form.setValue("target_satellite_pct", preset.targets.satellite, { shouldDirty: true });
    form.setValue("speculative_cap_pct", preset.speculativeCapPct, { shouldDirty: true });
    form.setValue("single_name_cap_pct", preset.singleNameCapPct, { shouldDirty: true });
    form.setValue("crypto_cap_pct", preset.cryptoCapPct, { shouldDirty: true });
    form.setValue("additional_constraints", preset.constraints, { shouldDirty: true });
    void form.trigger();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!mandate) return;
    await save.mutateAsync({
      ...(mandate.id ? { id: mandate.id } : {}),
      values: {
        profile_id: mandate.profileId,
        mandate_type: values.mandate_type,
        target_core_pct: values.target_core_pct,
        target_income_pct: values.target_income_pct,
        target_thematic_pct: values.target_thematic_pct,
        target_satellite_pct: values.target_satellite_pct,
        speculative_cap_pct: values.speculative_cap_pct,
        single_name_cap_pct: values.single_name_cap_pct,
        crypto_cap_pct: values.crypto_cap_pct,
        additional_constraints: values.additional_constraints.trim() || null,
        notes: values.notes.trim() || null,
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={mandate ? `${mandate.person}'s mandate` : "Investment mandate"}
      description="What this person may hold, and in what proportion. The household rules — reserve, capital priority, currency limits — apply to both people regardless of what is set here."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={mandate?.recorded ? "Save mandate" : "Record mandate"}
      footerNote="Drift, sleeve caps and the advisor's recommendations are all measured against this mandate for this person's money."
    >
      <FullRow>
        <Field
          label="Mandate"
          hint="Choosing a style fills in the household's written defaults for it. Every figure below stays editable."
        >
          <div className="flex flex-wrap gap-2">
            {MANDATE_TYPES.map((entry) => (
              <Button
                key={entry.value}
                type="button"
                variant={type === entry.value ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(entry.value as MandateType)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </Field>
      </FullRow>

      <FullRow>
        <p className="rounded-md border border-border bg-surface-raised/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {MANDATE_PRESETS[type].summary}
        </p>
      </FullRow>

      <Controller
        control={form.control}
        name="mandate_type"
        render={({ field }) => (
          <Field label="Style" hint="Also settable directly.">
            <SelectNative value={field.value} onChange={field.onChange} options={MANDATE_TYPES} />
          </Field>
        )}
      />

      <Field label="Speculative sleeve cap %" hint="0 means no speculative sleeve at all.">
        <Input
          type="number"
          step="0.5"
          inputMode="decimal"
          {...form.register("speculative_cap_pct")}
        />
      </Field>

      {MANDATE_SLEEVES.map((sleeve) => (
        <Field
          key={sleeve}
          label={`${mandateSleeveLabel(sleeve, type)} target %`}
          hint={mandateSleeveNote(sleeve, type)}
          error={form.formState.errors[FIELD_BY_SLEEVE[sleeve]]?.message}
        >
          <Input
            type="number"
            step="0.5"
            inputMode="decimal"
            {...form.register(FIELD_BY_SLEEVE[sleeve])}
          />
        </Field>
      ))}

      <Field label="Single name cap %" hint="Largest permitted position in one speculative name.">
        <Input
          type="number"
          step="0.5"
          inputMode="decimal"
          {...form.register("single_name_cap_pct")}
        />
      </Field>

      <Field label="Crypto cap %" hint="0 means crypto is not permitted under this mandate.">
        <Input type="number" step="0.5" inputMode="decimal" {...form.register("crypto_cap_pct")} />
      </Field>

      <FullRow>
        <Field
          label="Additional constraints"
          hint="One per line. These are shown on the mandate and given to the advisor as hard rules."
        >
          <Textarea rows={4} {...form.register("additional_constraints")} />
        </Field>
      </FullRow>

      <FullRow>
        <Field label="Notes">
          <Textarea rows={2} {...form.register("notes")} />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
