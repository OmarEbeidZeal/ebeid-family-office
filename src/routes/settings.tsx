import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Moon, RefreshCw, Sun } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCIES, monthsAgoLabel } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Ebeid Family Office" },
      {
        name: "description",
        content:
          "Household preferences, base currency, exchange rates, invitations and appearance for the family office.",
      },
      { property: "og:title", content: "Settings | Ebeid Family Office" },
      {
        property: "og:description",
        content: "Household preferences, base currency, exchange rates and invitations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsRoute,
});

function SettingsRoute() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}

function Settings() {
  const { profile, household, members, signOut } = useAuth();
  const { base, rates, ratesAsOf, isStale, refresh, refreshing } = useCurrency();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState(base);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    setDisplayName(profile?.display_name ?? profile?.full_name ?? "");
  }, [profile?.display_name, profile?.full_name]);

  useEffect(() => {
    setHouseholdName(household?.name ?? "");
    setBaseCurrency(household?.base_currency ?? "GBP");
  }, [household?.name, household?.base_currency]);

  const isOwner = profile?.role === "owner";

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-context"] });
      toast.success("Profile updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveHousehold = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("households")
        .update({ name: householdName, base_currency: baseCurrency })
        .eq("id", household!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Household updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: invites } = useQuery({
    queryKey: ["allowed_emails", household?.id],
    enabled: !!household?.id && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allowed_emails")
        .select("id, email, role, claimed_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        email: string;
        role: string;
        claimed_at: string | null;
      }[];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const email = inviteEmail.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
      const { error } = await supabase.from("allowed_emails").insert({
        email,
        role: "member",
        household_id: household!.id,
        invited_by: profile!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["allowed_emails"] });
      toast.success("Invitation added — they can now create an account");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-10">
      <SectionHeader title="Settings" description="Household, currency, access and appearance." />

      <section className="hairline grid gap-4 rounded-lg bg-surface p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-medium">Your profile</h3>
          <p className="text-xs text-muted-foreground">{profile?.email}</p>
        </div>
        <Field label="Display name">
          <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
            Save profile
          </Button>
        </div>
      </section>

      <section className="hairline grid gap-4 rounded-lg bg-surface p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h3 className="text-sm font-medium">Household</h3>
          <p className="text-xs text-muted-foreground">
            {members.length} member{members.length === 1 ? "" : "s"} · all figures are reported in
            the base currency.
          </p>
        </div>
        <Field label="Household name">
          <Input
            value={householdName}
            onChange={(event) => setHouseholdName(event.target.value)}
            disabled={!isOwner}
          />
        </Field>
        <Field label="Base currency">
          <SelectNative
            value={baseCurrency}
            onChange={setBaseCurrency}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          />
        </Field>
        {isOwner && (
          <div className="sm:col-span-2">
            <Button onClick={() => saveHousehold.mutate()} disabled={saveHousehold.isPending}>
              Save household
            </Button>
          </div>
        )}
      </section>

      <section className="hairline rounded-lg bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">Exchange rates</h3>
            <p className="text-xs text-muted-foreground">
              {ratesAsOf ? `Last refreshed ${monthsAgoLabel(ratesAsOf)}` : "No rates stored yet"}
              {isStale && " · stale"}
            </p>
          </div>
          <Button variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} /> Refresh rates
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(rates)
            .filter(([code]) => code !== "GBP")
            .map(([code, rate]) => (
              <div key={code} className="hairline rounded-md px-3 py-2">
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                  GBP / {code}
                </p>
                <p className="num text-sm">{rate.toFixed(4)}</p>
              </div>
            ))}
        </div>
      </section>

      {isOwner && (
        <section className="hairline rounded-lg bg-surface p-6">
          <h3 className="text-sm font-medium">Access</h3>
          <p className="text-xs text-muted-foreground">
            This system is invitation-only. Only the addresses below can create an account.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <Field label="Invite email">
                <Input
                  type="email"
                  placeholder="haya@example.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </Field>
            </div>
            <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
              Send invitation
            </Button>
          </div>
          <ul className="mt-5 divide-y">
            {(invites ?? []).map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>{row.email}</span>
                <span className="text-xs text-muted-foreground">
                  {row.role} · {row.claimed_at ? "active" : "pending"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="hairline flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface p-6">
        <div>
          <h3 className="text-sm font-medium">Appearance</h3>
          <p className="text-xs text-muted-foreground">Dark is the default working theme.</p>
        </div>
        <Button variant="secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === "dark" ? "Switch to light" : "Switch to dark"}
        </Button>
      </section>

      <section>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </section>
    </div>
  );
}
