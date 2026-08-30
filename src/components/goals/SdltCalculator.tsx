import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { bandLabel, calculateSdlt } from "@/lib/sdlt";
import { formatMoney, formatPercent } from "@/lib/format";
import type { GoalLineItemRow, GoalRow } from "@/hooks/useFinancials";

const SDLT_LABEL = "Stamp duty (SDLT)";

/**
 * SDLT for England and Northern Ireland, shown band by band so the figure can
 * be checked rather than trusted. The purchase price comes from the goal's own
 * purchase line where one exists, so the duty always tracks the real number.
 */
export function SdltCalculator({ goal, items }: { goal: GoalRow; items: GoalLineItemRow[] }) {
  const { household } = useAuth();
  const queryClient = useQueryClient();

  const purchaseLine = items.find((item) => item.kind === "purchase");
  const linkedPrice = purchaseLine
    ? Number(purchaseLine.estimated_cost)
    : Number(goal.target_amount);
  const [override, setOverride] = useState<string>("");
  const price = override === "" ? linkedPrice : Number(override) || 0;

  const patchGoal = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await db.from("goals").update(values).eq("id", goal.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals"] }),
    onError: (error: Error) => toast.error(`Could not save that setting: ${error.message}`),
  });

  const saveDuty = useMutation({
    mutationFn: async (duty: number) => {
      const existing = items.find((item) => item.label === SDLT_LABEL || item.kind === "tax");
      if (existing) {
        const { error } = await db
          .from("goal_line_items")
          .update({ estimated_cost: duty, label: SDLT_LABEL, kind: "tax", currency: "GBP" })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await db.from("goal_line_items").insert({
        household_id: household!.id,
        goal_id: goal.id,
        label: SDLT_LABEL,
        kind: "tax",
        estimated_cost: duty,
        currency: "GBP",
        sort_order: items.length ? Math.max(...items.map((item) => item.sort_order)) + 1 : 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goal_line_items"] });
      toast.success("Stamp duty written into the costing");
    },
    onError: (error: Error) => toast.error(`Could not save the duty: ${error.message}`),
  });

  const result = useMemo(
    () =>
      calculateSdlt({
        price,
        firstTimeBuyer: goal.first_time_buyer,
        additionalProperty: goal.additional_property,
        nonUkResident: goal.non_uk_resident,
      }),
    [price, goal.first_time_buyer, goal.additional_property, goal.non_uk_resident],
  );

  const englandOrNi = goal.country === "GB" || goal.country === null;
  const bands = result.bands.filter((band) => band.taxable > 0);

  return (
    <div className="hairline rounded-lg bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-3.5 w-3.5 text-gold" />
          <h4 className="text-sm text-foreground">Stamp duty</h4>
        </div>
        <div className="text-right">
          <p className="num text-lg font-light text-gold">{formatMoney(result.duty, "GBP")}</p>
          <p className="num text-[0.7rem] text-muted-foreground">
            {formatPercent(result.effectiveRate)} of the price
          </p>
        </div>
      </div>

      {!englandOrNi && (
        <p className="mt-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[0.7rem] leading-relaxed text-warn">
          This goal is set outside England and Northern Ireland. Scotland charges LBTT and Wales
          charges LTT — different systems with different bands, neither modelled here. The figure
          below is the England/NI calculation only.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="block text-xs text-muted-foreground" htmlFor={`sdlt-price-${goal.id}`}>
            Purchase price
          </Label>
          <Input
            id={`sdlt-price-${goal.id}`}
            type="number"
            step="1000"
            inputMode="decimal"
            className="num"
            value={override === "" ? String(linkedPrice || "") : override}
            onChange={(event) => setOverride(event.target.value)}
          />
          <p className="text-[0.7rem] text-muted-foreground">
            {purchaseLine
              ? "Taken from the purchase line in the costing below."
              : "Taken from the goal's headline target. Add a purchase line to keep them in step."}
          </p>
        </div>

        <div className="space-y-3">
          <ToggleRow
            id={`ftb-${goal.id}`}
            label="First-time buyer"
            checked={goal.first_time_buyer}
            onChange={(checked) => patchGoal.mutate({ first_time_buyer: checked })}
          />
          <ToggleRow
            id={`additional-${goal.id}`}
            label="Additional property"
            checked={goal.additional_property}
            onChange={(checked) => patchGoal.mutate({ additional_property: checked })}
          />
          <ToggleRow
            id={`nonres-${goal.id}`}
            label="Non-UK resident"
            checked={goal.non_uk_resident}
            onChange={(checked) => patchGoal.mutate({ non_uk_resident: checked })}
          />
        </div>
      </div>

      {bands.length > 0 && (
        <table className="mt-4 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-1.5 font-normal">Band</th>
              <th className="pb-1.5 text-right font-normal">Rate</th>
              <th className="pb-1.5 text-right font-normal">Slice</th>
              <th className="pb-1.5 text-right font-normal">Duty</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr
                key={`${band.from}-${band.to}`}
                className="border-b border-border/50 last:border-0"
              >
                <td className="py-1.5 text-muted-foreground">{bandLabel(band)}</td>
                <td className="num py-1.5 text-right">
                  {band.rate}%
                  {band.rate !== band.baseRate && (
                    <span className="text-muted-foreground"> ({band.baseRate}% + surcharge)</span>
                  )}
                </td>
                <td className="num py-1.5 text-right">
                  {formatMoney(band.taxable, "GBP", { decimals: 0 })}
                </td>
                <td className="num py-1.5 text-right">
                  {formatMoney(band.duty, "GBP", { decimals: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {result.reliefApplied && (
        <p className="mt-3 text-[0.7rem] leading-relaxed text-gain">
          First-time-buyer relief applied: nothing to £300,000, then 5% to £500,000.
        </p>
      )}

      {result.notes.map((note) => (
        <p key={note} className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
          {note}
        </p>
      ))}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={result.duty <= 0 || saveDuty.isPending}
          onClick={() => saveDuty.mutate(result.duty)}
        >
          Save duty into the costing
        </Button>
        {override !== "" && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setOverride("")}>
            Reset to the goal's price
          </Button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
