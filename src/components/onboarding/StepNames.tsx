import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/FormField";
import { StepFooter } from "./OnboardingLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  full_name: z.string().min(2, "Tell the system your name"),
  display_name: z.string().optional(),
  partner_display_name: z.string().optional(),
  household_name: z.string().min(2, "Give the household a name"),
});

type Values = z.infer<typeof schema>;

export function StepNames({ onNext }: { onNext: () => void }) {
  const { profile, household } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      display_name: "",
      partner_display_name: "",
      household_name: "Ebeid Household",
    },
  });

  useEffect(() => {
    form.reset({
      full_name: profile?.full_name ?? "",
      display_name: profile?.display_name ?? "",
      partner_display_name: household?.partner_display_name ?? "",
      household_name: household?.name ?? "Ebeid Household",
    });
  }, [
    profile?.full_name,
    profile?.display_name,
    household?.partner_display_name,
    household?.name,
    form,
  ]);

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: values.full_name.trim(),
          display_name:
            values.display_name?.trim() || values.full_name.trim().split(" ")[0] || null,
        })

        .eq("id", profile!.id);
      if (profileError) throw profileError;

      const { error: householdError } = await supabase
        .from("households")
        .update({
          name: values.household_name.trim(),
          partner_display_name: values.partner_display_name?.trim() || null,
        })
        .eq("id", household!.id);
      if (householdError) throw householdError;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session-context"] });
      onNext();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className="hairline grid gap-4 rounded-lg bg-surface p-5 sm:grid-cols-2 sm:p-6">
        <Field label="Your full name" error={form.formState.errors.full_name?.message}>
          <Input placeholder="Omar Ebeid" {...form.register("full_name")} />
        </Field>
        <Field label="What the app should call you" hint="Used in the Me / Household toggle.">
          <Input placeholder="Omar" {...form.register("display_name")} />
        </Field>
        <Field
          label="Your partner's name"
          hint="Her own view appears once she accepts an invitation from Settings."
        >
          <Input placeholder="Haya" {...form.register("partner_display_name")} />
        </Field>
        <Field label="Household name" error={form.formState.errors.household_name?.message}>
          <Input {...form.register("household_name")} />
        </Field>
      </div>

      <StepFooter submit pending={save.isPending} nextLabel="Save and continue" />
    </form>
  );
}
