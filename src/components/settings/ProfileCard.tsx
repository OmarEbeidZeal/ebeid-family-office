import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/FormField";
import { SettingsCard } from "./SettingsCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function ProfileCard() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setFullName(profile?.full_name ?? "");
  }, [profile?.display_name, profile?.full_name]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          full_name: fullName.trim() || null,
        })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-context"] });
      toast.success("Profile updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SettingsCard
      title="Your profile"
      description={
        <>
          Signed in as <span className="text-foreground">{profile?.email}</span> ·{" "}
          {profile?.role === "owner" ? "Household owner" : "Household member"}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </Field>
        <Field label="Display name" hint="How you appear in the perspective toggle.">
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </SettingsCard>
  );
}
