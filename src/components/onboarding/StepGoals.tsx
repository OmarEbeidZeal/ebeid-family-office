import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { Money } from "@/components/Money";
import { StepFooter, AddedList } from "./OnboardingLayout";
import { useGoals } from "@/hooks/useFinancials";
import { useDeleteRow, useSaveRow } from "@/hooks/useUpsertRow";
import { useAuth } from "@/hooks/useAuth";
import {
  COUNTRIES,
  CURRENCIES,
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABELS,
  GOAL_PRIORITIES,
  countryLabel,
} from "@/lib/format";

/**
 * Suggested starters only — every amount is left at zero for the household to
 * price. Nothing here invents a figure.
 */
const STARTERS = [
  {
    title: "Buy a home in the UK",
    goal_category: "property",
    country: "GB",
    currency: "GBP",
    description: "Deposit, stamp duty and fees for a London purchase.",
  },
  {
    title: "Furnish the home in Egypt",
    goal_category: "home_improvement",
    country: "EG",
    currency: "EGP",
    description: "Furniture, appliances and finishing costs.",
  },
  {
    title: "Buy a property in Jordan",
    goal_category: "property",
    country: "JO",
    currency: "JOD",
    description: "Purchase price and transfer costs.",
  },
] as const;

const schema = z.object({
  title: z.string().min(1, "Name the goal"),
  goal_category: z.string(),
  country: z.string(),
  currency: z.string(),
  target_amount: z.coerce.number().min(0),
  target_date: z.string().optional(),
  priority: z.string(),
});

type Values = z.infer<typeof schema>;

export function StepGoals({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) {
  const { profile } = useAuth();
  const goals = useGoals();
  const save = useSaveRow("goals", "goals", "Goal");
  const remove = useDeleteRow("goals", "goals", "Goal");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      goal_category: "property",
      country: "GB",
      currency: "GBP",
      target_amount: 0,
      target_date: "",
      priority: "want",
    },
  });

  const existingTitles = new Set((goals.data ?? []).map((goal) => goal.title.toLowerCase()));

  const addStarter = (starter: (typeof STARTERS)[number]) => {
    save.mutate({
      values: {
        title: starter.title,
        goal_category: starter.goal_category,
        country: starter.country,
        currency: starter.currency,
        description: starter.description,
        target_amount: 0,
        funded_amount: 0,
        priority: "want",
        status: "planning",
        owner_profile_id: null,
      },
    });
  };

  const submit = form.handleSubmit((values) => {
    save.mutate(
      {
        values: {
          title: values.title.trim(),
          goal_category: values.goal_category,
          country: values.country,
          currency: values.currency,
          target_amount: values.target_amount,
          funded_amount: 0,
          target_date: values.target_date || null,
          priority: values.priority,
          status: "planning",
          owner_profile_id: profile?.id ?? null,
        },
      },
      {
        onSuccess: () =>
          form.reset({ ...form.getValues(), title: "", target_amount: 0, target_date: "" }),
      },
    );
  });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Suggested starters</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Add any that apply and price them later — the targets stay at zero until you set them.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {STARTERS.map((starter) => {
            const added = existingTitles.has(starter.title.toLowerCase());
            return (
              <div
                key={starter.title}
                className="hairline flex flex-col justify-between gap-3 rounded-lg bg-surface p-4"
              >
                <div>
                  <p className="text-sm text-foreground">{starter.title}</p>
                  <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
                    {starter.description}
                  </p>
                  <p className="mt-2 text-[0.7rem] text-muted-foreground">
                    {countryLabel(starter.country)} · {starter.currency}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={added ? "ghost" : "secondary"}
                  disabled={added || save.isPending}
                  onClick={() => addStarter(starter)}
                >
                  {added ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5 text-gain" />
                      Added
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add goal
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <form onSubmit={submit} className="hairline space-y-4 rounded-lg bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-medium text-foreground">Add your own</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goal" error={form.formState.errors.title?.message}>
            <Input placeholder="School fees fund" {...form.register("title")} />
          </Field>
          <Field label="Category">
            <SelectNative
              value={form.watch("goal_category")}
              onChange={(value) => form.setValue("goal_category", value)}
              options={GOAL_CATEGORIES.map((category) => ({
                value: category,
                label: GOAL_CATEGORY_LABELS[category] ?? category,
              }))}
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
          <Field label="Target amount" hint="Leave at zero if you have not priced it yet.">
            <Input type="number" step="0.01" className="num" {...form.register("target_amount")} />
          </Field>
          <Field label="Target date">
            <Input type="date" {...form.register("target_date")} />
          </Field>
          <Field label="Priority">
            <SelectNative
              value={form.watch("priority")}
              onChange={(value) => form.setValue("priority", value)}
              options={GOAL_PRIORITIES.map((item) => ({ value: item.value, label: item.label }))}
            />
          </Field>
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add goal
        </Button>
      </form>

      <AddedList
        emptyLabel="No goals yet. Even an unpriced goal is useful — it gives the forecast something to aim at."
        onRemove={(id) => remove.mutate(id)}
        items={(goals.data ?? []).map((goal) => ({
          id: goal.id,
          title: goal.title,
          subtitle: `${GOAL_CATEGORY_LABELS[goal.goal_category] ?? goal.goal_category} · ${
            goal.target_amount > 0 ? "priced" : "not yet priced"
          }`,
          value: <Money amount={goal.target_amount} currency={goal.currency} className="text-sm" />,
        }))}
      />

      <StepFooter onBack={onBack} onNext={onFinish} nextLabel="Finish setup" />
    </div>
  );
}
