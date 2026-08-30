import { Search } from "lucide-react";
import { openCommandPalette } from "@/components/CommandPalette";
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
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open the command palette"
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="num hidden rounded border border-border px-1 text-[0.6rem] text-muted-foreground/80 lg:inline">
              ⌘K
            </kbd>
          </button>
          <ScopeToggle />
          <FxIndicator />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
