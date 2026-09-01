import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { useSaveRow } from "@/hooks/useUpsertRow";
import type { WatchlistRow } from "@/hooks/useFinancials";
import { SHARIAH_STATUSES } from "@/lib/mandates";

const CONVICTIONS = [
  { value: "high", label: "High — would size it today" },
  { value: "medium", label: "Medium — worth a starter position" },
  { value: "watching", label: "Watching — no action yet" },
];

const SECURITY_TYPES = [
  { value: "stock", label: "Single stock" },
  { value: "etf", label: "ETF" },
  { value: "fund", label: "Fund" },
  { value: "bond", label: "Bond" },
  { value: "crypto", label: "Crypto" },
];

const schema = z.object({
  ticker: z.string().min(1, "A ticker is required").max(24),
  name: z.string(),
  security_type: z.string(),
  conviction: z.string(),
  target_price: z.string(),
  thesis: z
    .string()
    .trim()
    .min(40, "Write the thesis properly — at least a sentence or two of real reasoning."),
  falsification: z
    .string()
    .trim()
    .min(25, "Name the specific evidence that would prove the thesis wrong."),
  shariah_status: z.string(),
  shariah_note: z.string(),
});


type Values = z.infer<typeof schema>;

const THESIS_PLACEHOLDER =
  "Lunar payload contracts are already booked through 2028 and the cost per landing is falling faster than competitors can qualify hardware. If two of the next three missions land successfully, the contract pipeline reprices from speculative to recurring.";
const FALSIFICATION_PLACEHOLDER =
  "A failed landing on the next mission, a NASA CLPS re-award to a competitor, or a dilutive raise below the current price. Any of those and the thesis is wrong and the position closes.";

/**
 * Rule 9 made concrete: nothing joins the watchlist without a written thesis
 * and a written falsification. The fields are required by the schema, not by
 * good intentions.
 */
export function WatchlistSheet({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: WatchlistRow | null;
}) {
  const save = useSaveRow("watchlist", "watchlist", "Watchlist idea");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ticker: "",
      name: "",
      security_type: "stock",
      conviction: "watching",
      target_price: "",
      thesis: "",
      falsification: "",
      shariah_status: "unscreened",
      shariah_note: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      ticker: item?.ticker ?? "",
      name: item?.name ?? "",
      security_type: item?.security_type ?? "stock",
      conviction: item?.conviction ?? "watching",
      target_price: item?.target_price == null ? "" : String(item.target_price),
      thesis: item?.thesis ?? "",
      falsification: item?.falsification ?? "",
      shariah_status: item?.shariah_status ?? "unscreened",
      shariah_note: item?.shariah_note ?? "",
    });
  }, [open, item, form]);



  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: item?.id,
      values: {
        ticker: values.ticker.trim().toUpperCase(),
        name: values.name.trim() || null,
        security_type: values.security_type,
        conviction: values.conviction,
        target_price: values.target_price === "" ? null : Number(values.target_price),
        thesis: values.thesis.trim(),
        falsification: values.falsification.trim(),
        shariah_status: values.shariah_status,
        shariah_note: values.shariah_note.trim() || null,

      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? `Edit ${item.ticker}` : "Add to watchlist"}
      description="An idea without a written thesis is a hunch. Both fields below are required before it can be saved."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={item ? "Save idea" : "Add idea"}
      footerNote="Policy rule 9: a speculative position is only opened once the thesis and its falsification are written down. Writing them here means the decision is already made when the moment comes."
    >
      <Field label="Ticker" error={form.formState.errors.ticker?.message}>
        <Input placeholder="LUNR" className="uppercase" {...form.register("ticker")} />
      </Field>

      <Field label="Name">
        <Input placeholder="Intuitive Machines" {...form.register("name")} />
      </Field>

      <Field label="Security type">
        <Controller
          control={form.control}
          name="security_type"
          render={({ field }) => (
            <SelectNative value={field.value} onChange={field.onChange} options={SECURITY_TYPES} />
          )}
        />
      </Field>

      <Field label="Conviction">
        <Controller
          control={form.control}
          name="conviction"
          render={({ field }) => (
            <SelectNative value={field.value} onChange={field.onChange} options={CONVICTIONS} />
          )}
        />
      </Field>

      <Field
        label="Shariah status"
        hint="Recorded by you, never screened automatically."
      >
        <Controller
          control={form.control}
          name="shariah_status"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={SHARIAH_STATUSES.map((entry) => ({
                value: entry.value,
                label: entry.label,
              }))}
            />
          )}
        />
      </Field>

      <FullRow>
        <Field label="Target price" hint="Optional. Distance to target is shown on the watchlist.">
          <Input type="number" step="0.01" inputMode="decimal" {...form.register("target_price")} />
        </Field>
      </FullRow>

      <FullRow>
        <Field label="Screening note" hint="Where the Shariah determination came from.">
          <Input
            placeholder="Screened compliant on the issuer's own AAOIFI factsheet"
            {...form.register("shariah_note")}
          />
        </Field>
      </FullRow>


      <FullRow>
        <Field
          label="Thesis (required)"
          error={form.formState.errors.thesis?.message}
          hint="What has to be true for this to work, and over what horizon."
        >
          <Textarea rows={5} placeholder={THESIS_PLACEHOLDER} {...form.register("thesis")} />
        </Field>
      </FullRow>

      <FullRow>
        <Field
          label="What would prove it wrong (required)"
          error={form.formState.errors.falsification?.message}
          hint="The specific evidence that closes the position."
        >
          <Textarea
            rows={4}
            placeholder={FALSIFICATION_PLACEHOLDER}
            {...form.register("falsification")}
          />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
