import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { useSaveRow } from "@/hooks/useUpsertRow";
import type { ForecastAssumptions } from "@/lib/forecast";
import {
  SCENARIO_PRESETS,
  presetByKey,
  type ScenarioContext,
  type ScenarioParam,
  type ScenarioParams,
} from "@/lib/scenario-presets";
import { OVERRIDE_FIELDS, type SavedScenarioRow } from "@/lib/scenarios";

const CUSTOM = "__custom__";

type OverrideState = Record<string, string>;

function paramOptions(param: ScenarioParam, ctx: ScenarioContext) {
  if (param.kind === "goal")
    return ctx.goals.map((goal) => ({ value: goal.id, label: goal.title }));
  if (param.kind === "income")
    return ctx.income.map((row) => ({ value: row.id, label: row.label }));
  if (param.kind === "expense")
    return [
      ...(param.optional ? [{ value: "", label: "None — rent isn't recorded" }] : []),
      ...ctx.expenses.map((row) => ({ value: row.id, label: row.label })),
    ];
  if (param.kind === "currency")
    return ctx.currencies.map((code) => ({ value: code, label: code }));
  return [];
}

/** Add or edit a saved scenario: a preset, its inputs, and any overrides. */
export function ScenarioSheet({
  open,
  onOpenChange,
  scenario,
  initialPreset,
  ctx,
  baseAssumptions,
  nextSortOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: SavedScenarioRow | null;
  /** Preset chosen on the way in, so a one-click preset arrives pre-filled. */
  initialPreset?: string | null;
  ctx: ScenarioContext;
  baseAssumptions: ForecastAssumptions;
  nextSortOrder: number;
}) {
  const save = useSaveRow("scenarios", "scenarios", "Scenario");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [presetKey, setPresetKey] = useState<string>(CUSTOM);
  const [params, setParams] = useState<ScenarioParams>({});
  const [overrides, setOverrides] = useState<OverrideState>({});
  const [error, setError] = useState<string | null>(null);

  const preset = presetKey === CUSTOM ? null : presetByKey(presetKey);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (scenario) {
      const definition =
        scenario.assumptions && typeof scenario.assumptions === "object"
          ? (scenario.assumptions as {
              params?: ScenarioParams;
              overrides?: Record<string, number>;
            })
          : {};
      setName(scenario.name);
      setDescription(scenario.description ?? "");
      setPresetKey(scenario.preset_key ?? CUSTOM);
      setParams(definition.params ?? {});
      setOverrides(
        Object.fromEntries(
          Object.entries(definition.overrides ?? {}).map(([key, value]) => [key, String(value)]),
        ),
      );
    } else {
      const preset = initialPreset ? presetByKey(initialPreset) : null;
      setName(preset?.name ?? "");
      setDescription("");
      setPresetKey(preset?.key ?? CUSTOM);
      setParams(preset ? preset.defaults(ctx) : {});
      setOverrides({});
    }
    // ctx changes as balances load; re-seeding a half-typed form would be rude.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scenario, initialPreset]);

  const choosePreset = (key: string) => {
    setPresetKey(key);
    setError(null);
    const next = key === CUSTOM ? null : presetByKey(key);
    if (!next) {
      setParams({});
      return;
    }
    setParams(next.defaults(ctx));
    if (!name.trim() || SCENARIO_PRESETS.some((row) => row.name === name.trim())) {
      setName(next.name);
    }
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof SCENARIO_PRESETS>();
    for (const item of SCENARIO_PRESETS) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return Array.from(groups.entries());
  }, []);

  const unavailable = preset ? preset.unavailable(ctx) : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the scenario a name you'll recognise later.");
      return;
    }
    if (preset) {
      const missing = preset.params.find(
        (param) => !param.optional && `${params[param.key] ?? ""}`.trim() === "",
      );
      if (missing) {
        setError(`${missing.label} is needed before this scenario can be modelled.`);
        return;
      }
    }

    const overrideValues: Partial<ForecastAssumptions> = {};
    for (const field of OVERRIDE_FIELDS) {
      const raw = overrides[field.key];
      if (raw === undefined || raw.trim() === "") continue;
      const value = Number(raw);
      if (Number.isFinite(value)) {
        (overrideValues as Record<string, number>)[field.key] = value;
      }
    }

    save.mutate(
      {
        ...(scenario ? { id: scenario.id } : {}),
        values: {
          name: name.trim(),
          description: description.trim() || null,
          preset_key: preset?.key ?? null,
          assumptions: {
            version: 1,
            presetKey: preset?.key ?? null,
            params,
            overrides: overrideValues,
          },
          sort_order: scenario?.sort_order ?? nextSortOrder,
          is_baseline: false,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={scenario ? "Edit scenario" : "New scenario"}
      description="A scenario is the baseline with one thing changed. It is stored as inputs, not results, so it always runs against today's position."
      onSubmit={submit}
      pending={save.isPending}
      submitLabel={scenario ? "Save scenario" : "Add scenario"}
      footerNote={
        unavailable ??
        "Nothing is assumed on your behalf. Any figure a scenario needs — a valuation, a monthly cost — is asked for here."
      }
    >
      <FullRow>
        <Field label="What is this scenario?">
          <SelectNative
            value={presetKey}
            onChange={choosePreset}
            options={[
              { value: CUSTOM, label: "Assumptions only — no event" },
              ...grouped.flatMap(([group, items]) =>
                items.map((item) => ({ value: item.key, label: `${group} · ${item.name}` })),
              ),
            ]}
          />
        </Field>
      </FullRow>

      {preset && (
        <FullRow>
          <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            {preset.headline}
          </p>
        </FullRow>
      )}

      <FullRow>
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Buy the London flat in 2027"
          />
        </Field>
      </FullRow>

      {preset?.params.map((param) => {
        const value = `${params[param.key] ?? ""}`;
        const set = (next: string) => setParams((prev) => ({ ...prev, [param.key]: next }));
        const options = paramOptions(param, ctx);
        return (
          <Field key={param.key} label={param.label} hint={param.hint}>
            {options.length ? (
              <SelectNative value={value} onChange={set} options={options} />
            ) : param.kind === "date" ? (
              <Input type="date" value={value} onChange={(event) => set(event.target.value)} />
            ) : (
              <Input
                type="number"
                inputMode="decimal"
                step={param.kind === "money" ? "1000" : param.kind === "percent" ? "0.5" : "1"}
                value={value}
                onChange={(event) => set(event.target.value)}
                placeholder={param.kind === "money" ? ctx.base : ""}
              />
            )}
          </Field>
        );
      })}

      {OVERRIDE_FIELDS.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          hint={`Baseline ${baseAssumptions[field.key]}${field.suffix} — leave blank to keep it`}
        >
          <Input
            type="number"
            step="0.25"
            inputMode="decimal"
            value={overrides[field.key] ?? ""}
            onChange={(event) =>
              setOverrides((prev) => ({ ...prev, [field.key]: event.target.value }))
            }
            placeholder={`${baseAssumptions[field.key]}`}
          />
        </Field>
      ))}

      <FullRow>
        <Field label="Note (optional)" error={error ?? undefined}>
          <Textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Why you're testing this, and what would make you act on it."
          />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
