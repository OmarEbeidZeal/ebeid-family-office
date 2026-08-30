import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { HouseholdCard } from "@/components/settings/HouseholdCard";
import { FxCard } from "@/components/settings/FxCard";
import { AccessCard } from "@/components/settings/AccessCard";
import { AppearanceCard } from "@/components/settings/AppearanceCard";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Profile, household base currency, invitations, exchange-rate freshness and appearance for the family office.",
      },
      { property: "og:title", content: "Settings — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Household preferences, invitations and exchange rates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { signOut, profile } = useAuth();

  return (
    <AppShell
      title="Settings"
      description="Who is in the household, what currency it reports in, and who may sign in."
    >
      <div className="space-y-5">
        <ProfileCard />
        <HouseholdCard />
        <AccessCard />
        <FxCard />
        <AppearanceCard />

        <section className="hairline flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-medium text-foreground">Sign out</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ends this session on this device{profile?.email ? ` for ${profile.email}` : ""}.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
