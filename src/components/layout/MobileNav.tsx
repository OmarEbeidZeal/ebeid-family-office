import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MOBILE_PRIMARY, NAV_ITEMS } from "./nav-items";

export function MobileNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = NAV_ITEMS.filter((item) =>
    (MOBILE_PRIMARY as readonly string[]).includes(item.to),
  );
  const secondary = NAV_ITEMS.filter(
    (item) => !(MOBILE_PRIMARY as readonly string[]).includes(item.to),
  );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {primary.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.62rem] tracking-wide transition-colors",
                  active ? "text-gold" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={1.6} />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[0.62rem] tracking-wide transition-colors",
              secondary.some((item) => pathname.startsWith(item.to) && item.to !== "/")
                ? "text-gold"
                : "text-muted-foreground",
            )}
          >
            <MoreHorizontal className="h-4.5 w-4.5" strokeWidth={1.6} />
            More
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="border-border bg-surface">
          <SheetHeader className="text-left">
            <SheetTitle className="eyebrow text-foreground/70">Everything else</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid gap-1 pb-4">
            {secondary.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-raised"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
                  <span className="flex-1">{item.label}</span>
                  {!item.ready && (
                    <span className="rounded-sm border border-border px-1 py-px text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground/70">
                      soon
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
