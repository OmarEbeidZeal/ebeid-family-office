import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_ASSUMPTIONS, type ForecastAssumptions } from "@/lib/forecast";

/**
 * The handful of assumptions the household is allowed to move. Everything else
 * in the projection comes from recorded data, so these are the only figures on
 * the page that are opinions rather than facts.
 */
export function AssumptionPanel({
  value,
  onChange,
  showVolatility,
}: {
  value: ForecastAssumptions;
  onChange: (next: ForecastAssumptions) => void;
  showVolatility?: boolean;
}) {
  const set = <K extends keyof ForecastAssumptions>(key: K, next: ForecastAssumptions[K]) =>
    onChange({ ...value, [key]: next });

  const dirty = (Object.keys(DEFAULT_ASSUMPTIONS) as (keyof ForecastAssumptions)[]).some(
    (key) => value[key] !== DEFAULT_ASSUMPTIONS[key],
  );

  return (
    <div className="hairline rounded-lg bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Assumptions</p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
            Move these and the projection redraws. They are assumptions, not forecasts.
          </p>
        </div>
        {dirty && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange({ ...DEFAULT_ASSUMPTIONS })}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <SliderRow
          id="investment-return"
          label="Investment return"
          suffix="% a year"
          value={value.investmentReturnPct}
          min={-4}
          max={12}
          step={0.5}
          onChange={(next) => set("investmentReturnPct", next)}
        />
        {showVolatility && (
          <SliderRow
            id="volatility"
            label="Volatility"
            suffix="% a year"
            value={value.volatilityPct}
            min={2}
            max={40}
            step={1}
            onChange={(next) => set("volatilityPct", next)}
          />
        )}
        <SliderRow
          id="salary-growth"
          label="Salary growth"
          suffix="% a year"
          value={value.salaryGrowthPct}
          min={0}
          max={15}
          step={0.5}
          disabled={value.useRecordedGrowth}
          onChange={(next) => set("salaryGrowthPct", next)}
        />
        <ToggleRow
          id="use-recorded-growth"
          label="Use each stream's recorded growth"
          hint="Off applies the slider above to every income line"
          checked={value.useRecordedGrowth}
          onChange={(next) => set("useRecordedGrowth", next)}
        />
        <SliderRow
          id="inflation"
          label="Inflation"
          suffix="% a year"
          value={value.inflationPct}
          min={0}
          max={20}
          step={0.5}
          disabled={value.useRecordedInflation}
          onChange={(next) => set("inflationPct", next)}
        />
        <ToggleRow
          id="use-recorded-inflation"
          label="Use each outgoing's recorded inflation"
          hint="Off applies the slider above to every expense line"
          checked={value.useRecordedInflation}
          onChange={(next) => set("useRecordedInflation", next)}
        />
        <SliderRow
          id="surplus-invested"
          label="Surplus invested"
          suffix="% of each month"
          value={value.surplusInvestedPct}
          min={0}
          max={100}
          step={5}
          onChange={(next) => set("surplusInvestedPct", next)}
        />
        <SliderRow
          id="reserve-months"
          label="Reserve floor"
          suffix=" months of essentials"
          value={value.reserveTargetMonths}
          min={0}
          max={24}
          step={1}
          onChange={(next) => set("reserveTargetMonths", next)}
        />
        <ToggleRow
          id="include-likely"
          label="Include likely outgoings"
          hint="Things you expect but have not committed to"
          checked={value.includeLikely}
          onChange={(next) => set("includeLikely", next)}
        />
        <ToggleRow
          id="include-possible"
          label="Include possible outgoings"
          hint="The stress case: everything you might spend"
          checked={value.includePossible}
          onChange={(next) => set("includePossible", next)}
        />
      </div>
    </div>
  );
}

function SliderRow({
  id,
  label,
  suffix,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={disabled ? "opacity-50" : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
          {label}
        </Label>
        <span className="num text-xs text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        id={id}
        className="mt-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled ?? false}
        onValueChange={([next]) => onChange(next ?? value)}
      />
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label htmlFor={id} className="text-xs font-normal text-foreground">
          {label}
        </Label>
        <p className="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
