import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/FormField";
import { SettingsCard } from "./SettingsCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

type Invite = {
  id: string;
  email: string;
  role: string;
  claimed_at: string | null;
  created_at: string;
};

export function AccessCard() {
  const { household, profile, isOwner } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["allowed_emails", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allowed_emails")
        .select("id, email, role, claimed_at, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Invite[];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const address = email.trim().toLowerCase();
      const person = name.trim();
      if (!person) throw new Error("Give them a name — it is what the owner selectors will show");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
        throw new Error("Enter a valid email address");
      }

      const { error } = await supabase.from("allowed_emails").insert({
        email: address,
        role: "member",
        household_id: household!.id,
        invited_by: profile!.id,
      });
      if (error) throw error;

      // The invitation creates the person, not just the permission. She can
      // own accounts, goals and income from this moment; signing in later
      // simply attaches a login to the record already here.
      const { error: memberError } = await supabase.from("profiles").insert({
        household_id: household!.id,
        email: address,
        full_name: person,
        display_name: person.split(" ")[0] ?? person,
        role: "member",
        status: "pending",
        invited_at: new Date().toISOString(),
        invited_by: profile!.id,
      });
      if (memberError) throw memberError;
    },
    onSuccess: async () => {
      setName("");
      setEmail("");
      await queryClient.invalidateQueries();
      toast.success("Invited — you can assign accounts to them straight away");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: async (row: Invite) => {
      const { error } = await supabase.from("allowed_emails").delete().eq("id", row.id);
      if (error) throw error;
      // The member record is removed in Household, where what they own is
      // visible — revoking here only closes the door.
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["allowed_emails"] });
      toast.success("Invitation revoked");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SettingsCard
      title="Access"
      description="This system is invitation-only. Only the addresses listed here can create an account, and each one joins this household."
    >
      {isOwner && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[9rem] flex-1">
            <Field label="Name">
              <Input
                placeholder="Haya"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </div>
          <div className="min-w-[13rem] flex-[2]">
            <Field label="Email" hint="They become a member now; signing in comes later.">
              <Input
                type="email"
                placeholder="partner@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") invite.mutate();
                }}
              />
            </Field>
          </div>
          <Button size="sm" onClick={() => invite.mutate()} disabled={invite.isPending}>
            {invite.isPending ? "Adding…" : "Add member"}
          </Button>
        </div>
      )}

      <ul className="mt-5 divide-y divide-border">
        {isLoading && <li className="py-3 text-xs text-muted-foreground">Loading invitations…</li>}
        {!isLoading && !invites.length && (
          <li className="py-3 text-xs text-muted-foreground">No invitations yet.</li>
        )}
        {invites.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{row.email}</p>
              <p className="text-[0.7rem] text-muted-foreground">
                {row.role === "owner" ? "Owner" : "Member"}
                <span className="mx-1.5 text-border">·</span>
                {row.claimed_at
                  ? `Joined ${formatDate(row.claimed_at, "short")}`
                  : `Invited ${formatDate(row.created_at, "short")} · awaiting sign-up`}
              </p>
            </div>
            {isOwner && !row.claimed_at && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-loss"
                onClick={() => revoke.mutate(row)}
                disabled={revoke.isPending}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
