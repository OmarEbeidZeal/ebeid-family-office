import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  household_id: string;
  /** Null until this person has signed in — an invited member owns things first. */
  user_id: string | null;
  /** `active` once a login is attached; `pending` while they are only invited. */
  status: string;
  invited_at: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  /** Delivery preferences for the standing briefing; each person owns their own. */
  weekly_briefing_enabled: boolean;
  /** 0 = Sunday. */
  briefing_day: number;
  briefing_email_enabled: boolean;
  /** Appearance, per person: a named theme or `system`. */
  theme_name: string;
  /** Which pair of colours marks gain and loss. Independent of the theme. */
  sign_palette: string;
};

export type Household = {
  id: string;
  name: string;
  base_currency: string;
  partner_display_name: string | null;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  /** Years of income the household wants replaced when measuring life cover. */
  income_replacement_years: number;
  /** What the household knows is absent from the records; the advisor repeats it back. */
  known_gaps: string[];
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profile: Profile | null;
  household: Household | null;
  members: Profile[];
  isOwner: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      queryClient.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const { data, isLoading: profileLoading } = useQuery({
    queryKey: ["session-context", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return { profile: null, household: null, members: [] as Profile[] };

      const [{ data: household }, { data: members }] = await Promise.all([
        supabase.from("households").select("*").eq("id", profile.household_id).maybeSingle(),
        supabase
          .from("profiles")
          .select("*")
          .eq("household_id", profile.household_id)
          .order("created_at", { ascending: true }),
      ]);

      return {
        profile: profile as Profile,
        household: (household as Household) ?? null,
        members: (members as Profile[]) ?? [],
      };
    },
  });

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    profile: data?.profile ?? null,
    household: data?.household ?? null,
    members: data?.members ?? [],
    isOwner: data?.profile?.role === "owner",
    profileLoading: !!userId && profileLoading,
    signOut: async () => {
      await supabase.auth.signOut();
      queryClient.clear();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
