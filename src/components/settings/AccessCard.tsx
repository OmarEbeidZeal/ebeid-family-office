import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/FormField";
import { SettingsCard } from "./SettingsCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { MANDATE_PRESETS, type MandateType } from "@/lib/mandates";
import { personLabel } from "@/lib/people";
import { cn } from "@/lib/utils";


type Invite = {
  id: string;
  email: string;
  role: string;
  claimed_at: string | null;
  created_at: string;
};

type Member = {
  id: string;
  email: string;
  full_name: string | null;
};

const MANDATE_CHOICES: MandateType[] = ["conventional", "shariah"];

export function AccessCard() {
  const { household, profile, isOwner } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // How this person invests is theirs from the moment they are added, not
  // something they have to sign in before recording.
  const [mandate, setMandate] = useState<MandateType>("conventional");
  const nameRef = useRef<HTMLInputElement>(null);

  const fillFromInvite = (row: Invite) => {
    setEmail(row.email);
    setName("");
    setMandate("conventional");
    nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    nameRef.current?.focus();
  };




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

  // An address can be on the allowlist without a person record behind it —
  // invitations sent before members could own anything. The card shows that
  // gap rather than pretending the person exists.
  const { data: members = [] } = useQuery({
    queryKey: ["profiles", "access", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, email, full_name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const memberEmails = new Set(members.map((row) => row.email.toLowerCase()));

  const invite = useMutation({
    mutationFn: async () => {
      const address = email.trim().toLowerCase();
      const person = name.trim();
      if (!person) throw new Error("Give them a name — it is what the owner selectors will show");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
        throw new Error("Enter a valid email address");
      }
      if (memberEmails.has(address)) {
        throw new Error(`${address} is already a member of this household`);
      }

      // Keep an invitation that already exists; only add what is missing.
      if (!invites.some((row) => row.email.toLowerCase() === address)) {
        const { error } = await supabase.from("allowed_emails").insert({
          email: address,
          role: "member",
          household_id: household!.id,
          invited_by: profile!.id,
        });
        if (error) throw error;
      }


      // The invitation creates the person, not just the permission. She can
      // own accounts, goals and income from this moment; signing in later
      // simply attaches a login to the record already here.
      const { data: member, error: memberError } = await supabase
        .from("profiles")
        .insert({
          household_id: household!.id,
          email: address,
          full_name: person,
          display_name: person.split(" ")[0] ?? person,
          role: "member",
          status: "pending",
          invited_at: new Date().toISOString(),
          invited_by: profile!.id,
        })
        .select("id")
        .single();
      if (memberError) throw memberError;

      // Their mandate is recorded with them. A Shariah mandate is a principle,
      // not a preference to be discovered later — and the advisor treats it as
      // a hard constraint from the first holding they own.
      const preset = MANDATE_PRESETS[mandate];
      const { error: mandateError } = await supabase.from("investment_mandates").insert({
        household_id: household!.id,
        profile_id: member.id,
        mandate_type: preset.type,
        target_core_pct: preset.targets.core,
        target_income_pct: preset.targets.income,
        target_thematic_pct: preset.targets.thematic,
        target_satellite_pct: preset.targets.satellite,
        speculative_cap_pct: preset.speculativeCapPct,
        single_name_cap_pct: preset.singleNameCapPct,
        crypto_cap_pct: preset.cryptoCapPct,
        additional_constraints: preset.constraints || null,
      });

      return { person, mandateRecorded: !mandateError, label: preset.label };
    },
    onSuccess: async (result) => {
      setName("");
      setEmail("");
      setMandate("conventional");
      await queryClient.invalidateQueries();
      if (result.mandateRecorded) {
        toast.success(
          `${result.person} added on a ${result.label.toLowerCase()} mandate — you can assign accounts to them straight away`,
        );
      } else {
        toast.warning(
          `${result.person} added, but their mandate was not saved. Record it on the Portfolio page.`,
        );
      }
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[9rem] flex-1">
              <Field label="Name">
                <Input
                  ref={nameRef}
                  placeholder="Haya"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") invite.mutate();
                  }}
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

          <Field
            label="Investment mandate"
            hint="How this person invests, recorded now. Every figure stays editable on the Portfolio page."
          >
            <div className="flex flex-wrap gap-2">
              {MANDATE_CHOICES.map((choice) => {
                const preset = MANDATE_PRESETS[choice];
                const active = mandate === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setMandate(choice)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-[2.25rem] rounded-md border px-3 py-1.5 text-xs transition-colors",
                      active
                        ? "border-gold-line bg-gold-soft text-gold"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            {MANDATE_PRESETS[mandate].summary}
          </p>
        </div>
      )}


      <ul className="mt-5 divide-y divide-border">
        {isLoading && <li className="py-3 text-xs text-muted-foreground">Loading invitations…</li>}
        {!isLoading && !invites.length && (
          <li className="py-3 text-xs text-muted-foreground">No invitations yet.</li>
        )}
        {invites.map((row) => {
          const member = members.find(
            (person) => person.email.toLowerCase() === row.email.toLowerCase(),
          );
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {personLabel(member?.full_name) || row.email}
                </p>
                {member?.full_name && (
                  <p className="truncate text-[0.7rem] text-muted-foreground">{row.email}</p>
                )}

                <p className="text-[0.7rem] text-muted-foreground">
                  {row.role === "owner" ? "Owner" : "Member"}
                  <span className="mx-1.5 text-border">·</span>
                  {row.claimed_at
                    ? `Joined ${formatDate(row.claimed_at, "short")}`
                    : `Invited ${formatDate(row.created_at, "short")} · awaiting sign-up`}
                  {!member && (
                    <>
                      <span className="mx-1.5 text-border">·</span>
                      <span className="text-loss">no member record — cannot own anything yet</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {isOwner && !member && (
                  <Button size="sm" variant="outline" onClick={() => fillFromInvite(row)}>
                    Add member record
                  </Button>
                )}
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
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

