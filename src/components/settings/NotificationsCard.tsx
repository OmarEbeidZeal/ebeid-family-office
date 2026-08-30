import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, MailX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsCard } from "./SettingsCard";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getDeliveryStatus } from "@/lib/notifications.functions";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type Preferences = {
  weekly_briefing_enabled: boolean;
  briefing_day: number;
  briefing_email_enabled: boolean;
};

/**
 * Delivery preferences for the standing briefing. Each person owns their own —
 * the household cannot switch someone else's email off — so other members are
 * shown here for transparency rather than for editing.
 */
export function NotificationsCard() {
  const { profile, members } = useAuth();
  const queryClient = useQueryClient();
  const deliveryStatus = useServerFn(getDeliveryStatus);

  const email = useQuery({
    queryKey: ["delivery-status"],
    enabled: !!profile,
    staleTime: 5 * 60_000,
    queryFn: () => deliveryStatus(),
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Preferences>) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session-context"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const others = members.filter((member) => member.id !== profile?.id);
  const enabled = profile?.weekly_briefing_enabled ?? true;
  const emailReady = email.data?.emailConfigured ?? false;

  return (
    <SettingsCard
      title="Notifications"
      description="The advisor reads the household's position on a schedule and writes up anything material. Notes always appear in the app; email is an optional second copy."
    >
      <div className="space-y-4">
        <Row
          title="Weekly briefing"
          detail="Runs at 07:00 UTC and appears as unread notes on the Advisor page."
        >
          <Switch
            checked={enabled}
            onCheckedChange={(value) => save.mutate({ weekly_briefing_enabled: value })}
            aria-label="Weekly briefing"
          />
        </Row>

        <Row
          title="Day"
          detail={
            enabled
              ? `Your briefing is written every ${DAYS[profile?.briefing_day ?? 0]}.`
              : "Switch the briefing on to choose a day."
          }
        >
          <Select
            value={String(profile?.briefing_day ?? 0)}
            onValueChange={(value) => save.mutate({ briefing_day: Number(value) })}
            disabled={!enabled}
          >
            <SelectTrigger className="w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((day, index) => (
                <SelectItem key={day} value={String(index)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        <Row
          title="Email me a copy"
          detail={
            email.isLoading
              ? "Checking whether email delivery is available…"
              : (email.data?.message ??
                "Email delivery status is unavailable; the briefing still appears in the app.")
          }
        >
          <Switch
            checked={(profile?.briefing_email_enabled ?? true) && emailReady}
            disabled={!enabled || !emailReady}
            onCheckedChange={(value) => save.mutate({ briefing_email_enabled: value })}
            aria-label="Email me a copy of the briefing"
          />
        </Row>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          {emailReady ? (
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
          ) : (
            <MailX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span>
            {emailReady
              ? `Sent from ${email.data?.from}. A failed send never stops the briefing being written.`
              : "Add a RESEND_API_KEY in Project Settings → Secrets to switch email delivery on. Nothing else changes: the briefing is written either way."}
          </span>
        </p>

        {others.length > 0 && (
          <div className="hairline rounded-md bg-surface-raised p-4">
            <p className="eyebrow text-muted-foreground">Everyone else in the household</p>
            <ul className="mt-3 space-y-2">
              {others.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Each person sets their own delivery from their own sign-in.
            </p>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="min-w-[12rem] max-w-md">
        <p className="text-sm text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function MemberRow({ member }: { member: Profile }) {
  const name = member.display_name || member.full_name || member.email;
  const status = member.weekly_briefing_enabled
    ? `${DAYS[member.briefing_day ?? 0]}${member.briefing_email_enabled ? " · email on" : " · in-app only"}`
    : "Briefing off";

  return (
    <li className="flex items-center justify-between gap-3 text-xs">
      <span className="truncate text-foreground">{name}</span>
      <span className="shrink-0 text-muted-foreground">{status}</span>
    </li>
  );
}
