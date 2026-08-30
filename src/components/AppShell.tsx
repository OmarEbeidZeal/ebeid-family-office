import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
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
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-56">
        <TopBar />
        <main className="mx-auto max-w-[88rem] px-4 pb-24 pt-6 sm:px-6 lg:pb-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-light tracking-tight text-foreground sm:text-2xl">
                {title}
              </h1>
              {description && (
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
