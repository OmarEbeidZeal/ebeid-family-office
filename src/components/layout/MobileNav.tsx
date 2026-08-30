import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MOBILE_PRIMARY, NAV_GROUPS, SETTINGS_ITEM, isActivePath } from "./nav-items";

const isPrimary = (to: string) => (MOBILE_PRIMARY as readonly string[]).includes(to);

export function MobileNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = NAV_GROUPS.flatMap((group) => group.items).filter((item) => isPrimary(item.to));
  const moreGroups = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !isPrimary(item.to)),
  })).filter((group) => group.items.length > 0);

  const moreActive =
    moreGroups.some((group) =>
      group.items.some((item) => isActivePath(pathname, item.to) && item.to !== "/"),
    ) || isActivePath(pathname, SETTINGS_ITEM.to);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5">
          {primary.map((item) => {
            const active = isActivePath(pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.62rem] tracking-wide transition-colors",
                  active ? "text-gold" : "text-muted-foreground",
                )}
              >
                <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.6} />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More destinations"
            className={cn(
              "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.62rem] tracking-wide transition-colors",
              moreActive ? "text-gold" : "text-muted-foreground",
            )}
          >
            <MoreHorizontal className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.6} />
            More
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto border-border bg-surface"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="eyebrow text-foreground/70">Everything else</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-5 pb-6">
            {moreGroups.map((group) => (
              <div key={group.label}>
                <p className="eyebrow px-3 pb-1.5 text-[0.6rem] text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <MoreLink
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      icon={item.icon}
                      active={isActivePath(pathname, item.to)}
                      onNavigate={() => setMoreOpen(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="border-t border-border pt-3">
              <MoreLink
                to={SETTINGS_ITEM.to}
                label={SETTINGS_ITEM.label}
                icon={SETTINGS_ITEM.icon}
                active={isActivePath(pathname, SETTINGS_ITEM.to)}
                onNavigate={() => setMoreOpen(false)}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MoreLink({
  to,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
        active ? "bg-gold-soft text-gold" : "text-foreground hover:bg-surface-raised",
      )}
    >
      <Icon
        className={cn("h-4 w-4", active ? "text-gold" : "text-muted-foreground")}
        strokeWidth={1.6}
      />
      <span className="flex-1">{label}</span>
    </Link>
  );
}
