import { useNetWorth } from "@/hooks/useNetWorth";
import { formatMoney } from "@/lib/format";
import { ScopeToggle } from "@/components/ScopeToggle";
import { FxIndicator } from "@/components/FxIndicator";
import { ProfileMenu } from "./ProfileMenu";
import { Wordmark } from "@/components/Wordmark";
import { Skeleton } from "@/components/ui/skeleton";

export function TopBar() {
  const { netWorth, base, loading, hasData } = useNetWorth({ householdWide: true });

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        {/* The figure stays visible on every screen; only the wordmark shortens on mobile. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Wordmark size="sm" compact className="lg:hidden" />
          <span className="eyebrow hidden lg:inline">Household</span>
          <span aria-hidden className="h-3.5 w-px bg-border lg:hidden" />
          {loading ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <span className="num truncate text-sm font-light text-foreground">
              {hasData ? formatMoney(netWorth, base, { decimals: 0 }) : "—"}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ScopeToggle />
          <FxIndicator />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
