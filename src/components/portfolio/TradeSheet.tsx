import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, type HoldingRow, type TradeRow } from "@/hooks/useFinancials";
import { CURRENCIES, DEBT_ACCOUNT_TYPES, accountTypeLabel, formatMoney } from "@/lib/format";

const schema = z.object({
  holding_id: z.string().min(1, "Choose the holding this trade belongs to"),
  side: z.enum(["buy", "sell"]),
  trade_date: z.string().min(1, "A trade date is required"),
  quantity: z.coerce.number().positive("Quantity must be more than zero"),
  price: z.coerce.number().positive("Price must be more than zero"),
  fees: z.coerce.number().min(0, "Fees cannot be negative"),
  currency: z.string().min(3),
  account_id: z.string(),
  notes: z.string(),
});

type Values = z.infer<typeof schema>;

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Trades are the source of truth for quantity and average cost — a database
 * trigger recomputes both on every write, so neither is ever typed by hand.
 */
export function TradeSheet({
  open,
  onOpenChange,
  holdings,
  trades,
  trade,
  defaultHoldingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holdings: HoldingRow[];
  /** Every recorded trade — used to spot a holding that has none yet. */
  trades: TradeRow[];
  trade?: TradeRow | null;
  defaultHoldingId?: string | undefined;
}) {
  const { household } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const queryClient = useQueryClient();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      holding_id: "",
      side: "buy",
      trade_date: new Date().toISOString().slice(0, 10),
      quantity: 0,
      price: 0,
      fees: 0,
      currency: "GBP",
      account_id: "none",
      notes: "",
    },
  });

  const holdingId = form.watch("holding_id");
  const selected = holdings.find((holding) => holding.id === holdingId);

  useEffect(() => {
    if (!open) return;
    const fallback = trade?.holding_id ?? defaultHoldingId ?? holdings[0]?.id ?? "";
    const holding = holdings.find((row) => row.id === fallback);
    form.reset({
      holding_id: fallback,
      side: (trade?.side as "buy" | "sell") ?? "buy",
      trade_date: trade?.trade_date ?? new Date().toISOString().slice(0, 10),
      quantity: Number(trade?.quantity ?? 0),
      price: Number(trade?.price ?? 0),
      fees: Number(trade?.fees ?? 0),
      currency: trade?.currency ?? holding?.currency ?? "GBP",
      account_id: trade?.account_id ?? holding?.account_id ?? "none",
      notes: trade?.notes ?? "",
    });
  }, [open, trade, defaultHoldingId, holdings, form]);

  // A holding entered by hand carries a quantity and average cost nobody
  // traded into existence. The moment its first trade arrives the trigger
  // rebuilds the position from trades alone, so that hand-entered stock would
  // vanish. Write it down as an explicit opening lot instead — visible in the
  // trade list, editable, and never invented for a holding that has no
  // recorded position.
  const existingTradeCount = selected
    ? trades.filter((row) => row.holding_id === selected.id).length
    : 0;
  const needsOpeningLot =
    !trade && !!selected && existingTradeCount === 0 && Number(selected.quantity) > 0;

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const payload = {
        holding_id: values.holding_id,
        side: values.side,
        trade_date: values.trade_date,
        quantity: values.quantity,
        price: values.price,
        fees: values.fees,
        currency: values.currency,
        account_id: values.account_id === "none" ? null : values.account_id,
        notes: values.notes.trim() || null,
      };
      if (trade) {
        const { error } = await db.from("trades").update(payload).eq("id", trade.id);
        if (error) throw error;
        return;
      }
      if (needsOpeningLot && selected) {
        const openingDate =
          selected.opened_at ?? (values.trade_date < todayIso() ? values.trade_date : todayIso());
        const { error: openingError } = await db.from("trades").insert({
          household_id: household!.id,
          holding_id: selected.id,
          side: "buy",
          trade_date: openingDate,
          quantity: Number(selected.quantity),
          price: Number(selected.avg_cost ?? 0),
          fees: 0,
          currency: selected.currency,
          account_id: selected.account_id,
          notes: "Opening position — carried over from the holding entered by hand.",
        });
        if (openingError) throw openingError;
      }
      const { error } = await db.from("trades").insert({ ...payload, household_id: household!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      // The trigger rewrites quantity, average cost and realised P/L on the holding.
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      toast.success(trade ? "Trade updated" : "Trade recorded");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const quantity = Number(form.watch("quantity")) || 0;
  const price = Number(form.watch("price")) || 0;
  const fees = Number(form.watch("fees")) || 0;
  const side = form.watch("side");
  const currency = form.watch("currency");
  const consideration = side === "buy" ? quantity * price + fees : quantity * price - fees;

  const investmentAccounts = accounts.filter(
    (account) => account.is_active && !DEBT_ACCOUNT_TYPES.includes(account.account_type),
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={trade ? "Edit trade" : "Record a trade"}
      description="Buys raise the average cost, sells release it and book realised P/L. Both are computed from the trades you record here."
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      pending={save.isPending}
      submitLabel={trade ? "Save trade" : "Record trade"}
      footerNote={
        quantity > 0 && price > 0
          ? `${side === "buy" ? "Cost" : "Proceeds"} ${formatMoney(consideration, currency, { decimals: 2 })}${
              selected && side === "sell" && quantity > Number(selected.quantity)
                ? ` — more than the ${selected.quantity} units currently held, which the database will reject.`
                : ""
            }`
          : "Fees are added to a buy's cost and deducted from a sell's proceeds."
      }
    >
      {needsOpeningLot && selected && (
        <FullRow>
          <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
            {selected.ticker} currently shows {Number(selected.quantity)} units
            {selected.avg_cost
              ? ` at ${formatMoney(Number(selected.avg_cost), selected.currency, { decimals: 2 })}`
              : ""}{" "}
            entered by hand. Once trades exist they become the source of truth, so that position is
            written down first as an opening lot
            {selected.opened_at ? ` dated ${selected.opened_at}` : ""}. Edit or delete it in the
            trade list if the real history differs.
          </p>
        </FullRow>
      )}

      <FullRow>
        <Field label="Holding" error={form.formState.errors.holding_id?.message}>
          <Controller
            control={form.control}
            name="holding_id"
            render={({ field }) => (
              <SelectNative
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  const holding = holdings.find((row) => row.id === value);
                  if (holding) form.setValue("currency", holding.currency);
                }}
                options={holdings.map((holding) => ({
                  value: holding.id,
                  label: `${holding.ticker}${holding.name ? ` · ${holding.name}` : ""}`,
                }))}
              />
            )}
          />
        </Field>
      </FullRow>

      <Field label="Side">
        <Controller
          control={form.control}
          name="side"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "buy", label: "Buy" },
                { value: "sell", label: "Sell" },
              ]}
            />
          )}
        />
      </Field>

      <Field label="Trade date" error={form.formState.errors.trade_date?.message}>
        <Input type="date" {...form.register("trade_date")} />
      </Field>

      <Field label="Quantity" error={form.formState.errors.quantity?.message}>
        <Input type="number" step="0.00000001" inputMode="decimal" {...form.register("quantity")} />
      </Field>

      <Field label="Price per unit" error={form.formState.errors.price?.message}>
        <Input type="number" step="0.0001" inputMode="decimal" {...form.register("price")} />
      </Field>

      <Field label="Fees and stamp duty" error={form.formState.errors.fees?.message}>
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("fees")} />
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

      <FullRow>
        <Field label="Settled through">
          <Controller
            control={form.control}
            name="account_id"
            render={({ field }) => (
              <SelectNative
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: "none", label: "Not linked to an account" },
                  ...investmentAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.nickname} · ${accountTypeLabel(account.account_type)}`,
                  })),
                ]}
              />
            )}
          />
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
