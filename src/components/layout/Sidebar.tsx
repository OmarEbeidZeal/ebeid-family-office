import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/Wordmark";
import { NAV_GROUPS, SETTINGS_ITEM, isActivePath } from "./nav-items";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadNotes } from "@/hooks/useFinancials";

export function Sidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { household } = useAuth();
  // A briefing written at 07:00 on Sunday has to be visible the moment the app
  // is opened, on whichever device that happens to be.
  const unread = useUnreadNotes();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
      <div className="px-6 py-7">
        <Wordmark />
        <p className="mt-2.5 truncate text-sm font-light text-foreground">
          {household?.name ?? "—"}
        </p>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="eyebrow px-3 pb-2 text-[0.6rem] text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  active={isActivePath(pathname, item.to)}
                  badge={item.to === "/advisor" ? unread : 0}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <NavLink
          to={SETTINGS_ITEM.to}
          label={SETTINGS_ITEM.label}
          icon={SETTINGS_ITEM.icon}
          active={isActivePath(pathname, SETTINGS_ITEM.to)}
        />
        <p className="px-3 pt-3 text-[0.68rem] leading-relaxed text-muted-foreground">
          Information and modelling only — not regulated financial advice.
        </p>
      </div>
    </aside>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
  badge = 0,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-gold-soft text-gold"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span
          aria-label={`${badge} unread`}
          className="num min-w-[1.25rem] rounded-full bg-gold px-1.5 py-px text-center text-[0.6rem] leading-4 text-background"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
