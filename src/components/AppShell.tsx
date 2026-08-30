import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Landmark, Scale, Settings, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { ScopeToggle } from "./ScopeToggle";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/balance-sheet", label: "Balance sheet", icon: Scale },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading, profile, profileLoading, household } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const { isStale, refresh } = useCurrency();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session && isStale) {
      refresh().catch(() => undefined);
    }
  }, [session, isStale, refresh]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading || (session && profileLoading)) {
    return <div className="min-h-screen bg-background" />;
  }
  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-gold text-lg leading-none">◆</span>
            <span className="hidden text-sm font-medium tracking-[0.18em] uppercase sm:block">
              {household?.name ?? "Family Office"}
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  pathname === item.to
                    ? "bg-gold-soft text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:block">
              <ScopeToggle />
            </div>
            <span className="hidden text-xs text-muted-foreground lg:block">
              {profile?.display_name ?? profile?.email}
            </span>
            <button
              type="button"
              aria-label="Toggle navigation"
              className="rounded-md p-2 text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t px-4 py-3 md:hidden">
            <div className="mb-3 sm:hidden">
              <ScopeToggle />
            </div>
            <nav className="grid gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    pathname === item.to
                      ? "bg-gold-soft text-gold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
