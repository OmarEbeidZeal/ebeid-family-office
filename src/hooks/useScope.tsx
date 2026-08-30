import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Scope = string; // "household" or a profile id

const ScopeContext = createContext<{
  scope: Scope;
  setScope: (scope: Scope) => void;
  matches: (ownerProfileId: string | null | undefined) => boolean;
} | null>(null);

const STORAGE_KEY = "efo.scope";

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<Scope>("household");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setScopeState(stored);
  }, []);

  const setScope = (next: Scope) => {
    setScopeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const matches = (ownerProfileId: string | null | undefined) => {
    if (scope === "household") return true;
    // joint / unassigned records are always included in a personal view
    if (!ownerProfileId) return true;
    return ownerProfileId === scope;
  };

  return (
    <ScopeContext.Provider value={{ scope, setScope, matches }}>{children}</ScopeContext.Provider>
  );
}

export function useScope() {
  const context = useContext(ScopeContext);
  if (!context) throw new Error("useScope must be used within ScopeProvider");
  return context;
}
