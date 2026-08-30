import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/Wordmark";
import { NAV_ITEMS } from "./nav-items";
import { useAuth } from "@/hooks/useAuth";

export function Sidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { household } = useAuth();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-surface lg:flex">
      <div className="px-5 py-6">
        <Wordmark />
        <p className="mt-2 truncate text-sm font-light text-foreground">{household?.name ?? "—"}</p>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-gold-soft text-gold"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              <span className="flex-1 truncate">{item.label}</span>
              {!item.ready && (
                <span className="rounded-sm border border-border px-1 py-px text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground/70">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
          Information and modelling only — not regulated financial advice.
        </p>
      </div>
    </aside>
  );
}
