import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, SelectNative } from "@/components/forms/FormField";
import { FormSheet, FullRow } from "@/components/forms/FormSheet";
import { useAuth } from "@/hooks/useAuth";
import { useSaveRow } from "@/hooks/useUpsertRow";
import { useAccounts, type HoldingRow } from "@/hooks/useFinancials";
import { CURRENCIES, DEBT_ACCOUNT_TYPES, accountTypeLabel } from "@/lib/format";
import { SHARIAH_STATUSES } from "@/lib/mandates";
import { SLEEVES, isSpeculative, type Sleeve } from "@/lib/policy";
import { memberName } from "@/hooks/useOwners";


const SECURITY_TYPES = [
  { value: "stock", label: "Single stock" },
  { value: "etf", label: "ETF" },
  { value: "fund", label: "Fund" },
  { value: "bond", label: "Bond" },
  { value: "crypto", label: "Crypto" },
];

const schema = z
  .object({
    ticker: z.string().min(1, "A ticker is required").max(24),
    name: z.string().optional(),
    security_type: z.string(),
    sleeve: z.string(),
    account_id: z.string(),
    owner_profile_id: z.string(),
    currency: z.string().min(3),
    quantity: z.coerce.number().min(0, "Quantity cannot be negative"),
    avg_cost: z.string(),
    target_price: z.string(),
    thesis: z.string(),
    falsification: z.string(),
    opened_at: z.string(),
    notes: z.string(),
    shariah_status: z.string(),
    shariah_note: z.string(),

  })
  .superRefine((values, ctx) => {
    if (!isSpeculative(values.sleeve as Sleeve)) return;
    // Rule 9: a speculative position without a written thesis is not permitted.
    if (values.thesis.trim().length < 20) {
      ctx.addIssue({
        code: "custom",
        path: ["thesis"],
        message: "Policy rule 9: write the thesis before the position is opened.",
      });
    }
    if (values.falsification.trim().length < 15) {
      ctx.addIssue({
        code: "custom",
        path: ["falsification"],
        message: "Policy rule 9: name what would prove the thesis wrong.",
      });
    }
  });

type Values = z.infer<typeof schema>;

const THESIS_PLACEHOLDER =
  "Neocloud GPU capacity is contracted years ahead; backlog converts to revenue faster than the market prices in, and the company funds build-out without diluting past 2027.";
const FALSIFICATION_PLACEHOLDER =
  "Two consecutive quarters of backlog conversion below 70%, a contract cancellation from a top-three customer, or a capital raise below the last round price.";

export function HoldingSheet({
  open,
  onOpenChange,
  holding,
  hasTrades,
  prefillTicker,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding?: HoldingRow | null;
  /** Quantity and cost are computed from trades once any exist. */
  hasTrades?: boolean;
  prefillTicker?: string | undefined;
}) {
  const { members, profile } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const save = useSaveRow("holdings", "holdings", "Holding");

  const investmentAccounts = accounts.filter(
    (account) => account.is_active && !DEBT_ACCOUNT_TYPES.includes(account.account_type),
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ticker: "",
      name: "",
      security_type: "stock",
      sleeve: "core",
      account_id: "none",
      owner_profile_id: "joint",
      currency: "GBP",
      quantity: 0,
      avg_cost: "",
      target_price: "",
      thesis: "",
      falsification: "",
      opened_at: "",
      notes: "",
      shariah_status: "unscreened",
      shariah_note: "",

    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      ticker: holding?.ticker ?? prefillTicker ?? "",
      name: holding?.name ?? "",
      security_type: holding?.security_type ?? "stock",
      sleeve: holding?.sleeve ?? "core",
      account_id: holding?.account_id ?? "none",
      owner_profile_id: holding?.owner_profile_id ?? "joint",
      currency: holding?.currency ?? "GBP",
      quantity: Number(holding?.quantity ?? 0),
      avg_cost: holding?.avg_cost == null ? "" : String(holding.avg_cost),
      target_price: holding?.target_price == null ? "" : String(holding.target_price),
      thesis: holding?.thesis ?? "",
      falsification: holding?.falsification ?? "",
      opened_at: holding?.opened_at ?? "",
      notes: holding?.notes ?? "",
      shariah_status: holding?.shariah_status ?? "unscreened",
      shariah_note: holding?.shariah_note ?? "",

    });
  }, [open, holding, prefillTicker, form]);

  const sleeve = form.watch("sleeve") as Sleeve;
  const speculative = isSpeculative(sleeve);
  const locked = !!hasTrades;

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: holding?.id,
      values: {
        ticker: values.ticker.trim().toUpperCase(),
        name: values.name?.trim() || null,
        security_type: values.security_type,
        sleeve: values.sleeve,
        account_id: values.account_id === "none" ? null : values.account_id,
        owner_profile_id: values.owner_profile_id === "joint" ? null : values.owner_profile_id,
        currency: values.currency,
        ...(locked
          ? {}
          : {
              quantity: values.quantity,
              avg_cost: values.avg_cost === "" ? null : Number(values.avg_cost),
            }),
        target_price: values.target_price === "" ? null : Number(values.target_price),
        thesis: values.thesis.trim() || null,
        falsification: values.falsification.trim() || null,
        opened_at: values.opened_at || null,
        notes: values.notes.trim() || null,
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
      title={holding ? `Edit ${holding.ticker}` : "Add holding"}
      description="Positions are priced from live market data. Record buys and sells as trades and the average cost is computed rather than typed."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={holding ? "Save changes" : "Add holding"}
      footerNote={
        locked
          ? "Quantity and average cost come from the recorded trades for this holding. Add a trade to change them."
          : speculative
            ? "Rule 7 caps any single speculative name at 3% of liquid investable assets, and rule 8 requires that a total loss would not delay a funded goal by more than three months."
            : undefined
      }
    >
      <Field label="Ticker" error={form.formState.errors.ticker?.message}>
        <Input
          placeholder="VWRP.L"
          autoCapitalize="characters"
          className="uppercase"
          {...form.register("ticker")}
        />
      </Field>

      <Field label="Name" hint="Left blank, the provider's name is used.">
        <Input placeholder="Vanguard FTSE All-World" {...form.register("name")} />
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

      <Field label="Sleeve" hint={SLEEVES.find((entry) => entry.value === sleeve)?.note}>
        <Controller
          control={form.control}
          name="sleeve"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={SLEEVES.map((entry) => ({ value: entry.value, label: entry.label }))}
            />
          )}
        />
      </Field>

      <Field label="Held in">
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
                  label: memberName(member),
                })),
              ]}
            />
          )}
        />
      </Field>

      <Field
        label="Shariah status"
        hint="Your own determination. Nothing is screened automatically, and unscreened is left as an honest unknown."
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
        <Field label="Screening note" hint="Where the determination came from, so it can be revisited.">
          <Input
            placeholder="AAOIFI screen via issuer factsheet, reviewed March 2026"
            {...form.register("shariah_note")}
          />
        </Field>
      </FullRow>



      <Field label="Currency" hint="The currency the position is booked in.">
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

      <Field label="Opened">
        <Input type="date" {...form.register("opened_at")} />
      </Field>

      <Field
        label="Quantity"
        error={form.formState.errors.quantity?.message}
        hint={locked ? "From recorded trades" : undefined}
      >
        <Input
          type="number"
          step="0.00000001"
          inputMode="decimal"
          disabled={locked}
          {...form.register("quantity")}
        />
      </Field>

      <Field
        label="Average cost per unit"
        hint={locked ? "From recorded trades" : "Optional — recording trades computes this."}
      >
        <Input
          type="number"
          step="0.0001"
          inputMode="decimal"
          disabled={locked}
          {...form.register("avg_cost")}
        />
      </Field>

      <Field label="Target price" hint="Optional. Used for distance-to-target.">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("target_price")} />
      </Field>

      <FullRow>
        <Field
          label={speculative ? "Thesis (required)" : "Thesis"}
          error={form.formState.errors.thesis?.message}
          hint={speculative ? undefined : "Why this position exists."}
        >
          <Textarea rows={3} placeholder={THESIS_PLACEHOLDER} {...form.register("thesis")} />
        </Field>
      </FullRow>

      <FullRow>
        <Field
          label={speculative ? "What would prove it wrong (required)" : "What would prove it wrong"}
          error={form.formState.errors.falsification?.message}
        >
          <Textarea
            rows={3}
            placeholder={FALSIFICATION_PLACEHOLDER}
            {...form.register("falsification")}
          />
        </Field>
      </FullRow>

      <FullRow>
        <Field label="Notes">
          <Textarea rows={2} {...form.register("notes")} />
        </Field>
      </FullRow>

      {!members.length && !profile && null}
    </FormSheet>
  );
}
