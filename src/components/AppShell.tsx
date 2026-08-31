import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CommandPalette } from "@/components/CommandPalette";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Wordmark } from "@/components/Wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useAssets, useIncomeStreams } from "@/hooks/useFinancials";
import { isOnboardingDeferred } from "@/lib/onboarding";

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-xs space-y-4 px-6 text-center">
        <Wordmark className="animate-pulse" />
        <Skeleton className="mx-auto h-2 w-32" />
      </div>
    </div>
  );
}

/**
 * Auth guard + chrome. Unauthenticated visitors are sent to /auth, and a
 * household with nothing recorded yet is sent through onboarding.
 */
export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { session, loading, profile, household, profileLoading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const accounts = useAccounts();
  const assets = useAssets();
  const income = useIncomeStreams();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const dataLoaded = !accounts.isLoading && !assets.isLoading && !income.isLoading;
  const isEmptyHousehold =
    dataLoaded &&
    (accounts.data?.length ?? 0) === 0 &&
    (assets.data?.length ?? 0) === 0 &&
    (income.data?.length ?? 0) === 0;

  useEffect(() => {
    if (!household) return;
    if (household.onboarding_completed_at) return;
    if (isOnboardingDeferred()) return;
    if (isEmptyHousehold) void navigate({ to: "/onboarding", replace: true });
  }, [household, isEmptyHousehold, navigate]);

  if (loading || (session && profileLoading)) return <ShellSkeleton />;
  if (!session) return <ShellSkeleton />;
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <Wordmark />
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            This sign-in isn't linked to a household profile yet. Sign out and sign in again, or ask
            the household owner to re-issue your invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <div className="lg:pl-60">
        <TopBar />
        <main className="mx-auto max-w-[88rem] px-4 pb-28 pt-8 sm:px-8 lg:pb-16">
          <div key={pathname} className="page-enter">
            {/* Title and actions share the first line; the description takes the
                full width beneath, so a long one never gets squeezed on a phone. */}
            <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="min-w-0 flex-1 truncate text-xl font-light tracking-tight text-foreground sm:text-2xl">
                {title}
              </h1>
              {actions && (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {actions}
                </div>
              )}
              {description && (
                <p className="w-full max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>

            {children}
          </div>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
