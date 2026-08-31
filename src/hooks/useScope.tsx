import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth, type Profile } from "./useAuth";

/** "household" or a profile id. */
export type Scope = string;

export type ScopeOption = {
  id: Scope;
  label: string;
  /** Phone-width label — the toggle has to fit beside the net worth figure. */
  short: string;
  disabled?: boolean;
  hint?: string;
};

type ScopeContextValue = {
  scope: Scope;
  setScope: (scope: Scope) => void;
  /** Joint and unassigned records stay visible in a personal view. */
  matches: (ownerProfileId: string | null | undefined) => boolean;
  options: ScopeOption[];
  activeLabel: string;
  isHousehold: boolean;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);
const STORAGE_KEY = "efo.scope";

function personName(profile: Profile) {
  return profile.display_name ?? profile.full_name ?? profile.email.split("@")[0] ?? "Member";
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { profile, members, household } = useAuth();
  const [scope, setScopeState] = useState<Scope>("household");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setScopeState(stored);
  }, []);

  const options = useMemo<ScopeOption[]>(() => {
    const list: ScopeOption[] = [{ id: "household", label: "Household", short: "All" }];
    if (profile) list.push({ id: profile.id, label: "Me", short: "Me" });

    const partners = members.filter((member) => member.id !== profile?.id);
    for (const partner of partners) {
      const name = personName(partner);
      const pending = partner.status === "pending";
      list.push({
        id: partner.id,
        label: name,
        short: name.split(" ")[0] ?? name,
        // A pending member owns things already, so her side is worth looking
        // at even before she has signed in.
        ...(pending ? { hint: `${name} has been invited but has not signed in yet.` } : {}),
      });
    }

    // Named during onboarding and never invited: show the tab so the household
    // reads correctly, but make clear it needs an invitation.
    if (!partners.length && household?.partner_display_name) {
      list.push({
        id: "partner-pending",
        label: household.partner_display_name,
        short: household.partner_display_name.split(" ")[0] ?? household.partner_display_name,
        disabled: true,
        hint: `Invite ${household.partner_display_name} from Settings to track her side separately.`,
      });
    }

    return list;
  }, [profile, members, household?.partner_display_name]);


  // A stored scope pointing at a profile that no longer exists falls back.
  useEffect(() => {
    if (!options.length) return;
    const valid = options.some((option) => option.id === scope && !option.disabled);
    if (!valid && scope !== "household") setScopeState("household");
  }, [options, scope]);

  const setScope = useCallback((next: Scope) => {
    setScopeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const matches = useCallback(
    (ownerProfileId: string | null | undefined) => {
      if (scope === "household") return true;
      if (!ownerProfileId) return true;
      return ownerProfileId === scope;
    },
    [scope],
  );

  const value = useMemo<ScopeContextValue>(
    () => ({
      scope,
      setScope,
      matches,
      options,
      activeLabel: options.find((option) => option.id === scope)?.label ?? "Household",
      isHousehold: scope === "household",
    }),
    [scope, setScope, matches, options],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const context = useContext(ScopeContext);
  if (!context) throw new Error("useScope must be used within ScopeProvider");
  return context;
}
