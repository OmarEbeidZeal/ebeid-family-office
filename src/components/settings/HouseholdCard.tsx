import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { SettingsCard } from "./SettingsCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCIES } from "@/lib/format";

export function HouseholdCard() {
  const { household, members, isOwner } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("GBP");
  const [partnerName, setPartnerName] = useState("");

  useEffect(() => {
    setName(household?.name ?? "");
    setBaseCurrency(household?.base_currency ?? "GBP");
    setPartnerName(household?.partner_display_name ?? "");
  }, [household?.name, household?.base_currency, household?.partner_display_name]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("households")
        .update({
          name: name.trim(),
          base_currency: baseCurrency,
          partner_display_name: partnerName.trim() || null,
        })
        .eq("id", household!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Household updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SettingsCard
      title="Household"
      description={
        <>
          {members.length} {members.length === 1 ? "member" : "members"}. Every figure in the app is
          reported in the base currency, converted at the latest stored rate.
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Household name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!isOwner}
          />
        </Field>
        <Field label="Base currency" hint="Changing this re-reports every total.">
          <SelectNative
            value={baseCurrency}
            onChange={setBaseCurrency}
            disabled={!isOwner}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          />
        </Field>
        <Field
          label="Partner's name"
          hint="Shown in the perspective toggle before they accept their invitation."
        >
          <Input
            value={partnerName}
            onChange={(event) => setPartnerName(event.target.value)}
            disabled={!isOwner}
          />
        </Field>
      </div>

      {isOwner ? (
        <div className="mt-4">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save household"}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Only the household owner can change these settings.
        </p>
      )}
    </SettingsCard>
  );
}
