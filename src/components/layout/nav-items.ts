import {
  BarChart3,
  Building2,
  CalendarRange,
  GitCompare,
  LayoutDashboard,
  MessageSquareText,
  PiggyBank,
  Receipt,
  Scale,
  Settings,
  Target,
} from "lucide-react";

/**
 * Navigation reads as three questions rather than eleven destinations:
 * where do we stand, what is the money doing, and what is the wealth doing.
 * Settings sits apart because it is housekeeping, not a view of the household.
 */
export type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/goals", label: "Goals", icon: Target },
      { to: "/advisor", label: "Advisor", icon: MessageSquareText },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/accounts", label: "Accounts", icon: Building2 },
      { to: "/transactions", label: "Transactions", icon: Receipt },
      { to: "/spending", label: "Spending", icon: PiggyBank },
    ],
  },
  {
    label: "Wealth",
    items: [
      { to: "/balance-sheet", label: "Balance Sheet", icon: Scale },
      { to: "/portfolio", label: "Portfolio", icon: BarChart3 },
      { to: "/forecast", label: "Forecast", icon: CalendarRange },
      { to: "/scenarios", label: "Scenarios", icon: GitCompare },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { to: "/settings", label: "Settings", icon: Settings };

export const NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  SETTINGS_ITEM,
];

/** The mobile tab bar: four destinations plus More. */
export const MOBILE_PRIMARY = ["/", "/goals", "/accounts", "/transactions"] as const;

export function isActivePath(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}
