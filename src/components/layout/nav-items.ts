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

export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { to: "/accounts", label: "Accounts", icon: Building2, ready: true },
  { to: "/balance-sheet", label: "Balance Sheet", icon: Scale, ready: true },
  { to: "/transactions", label: "Transactions", icon: Receipt, ready: true },
  { to: "/spending", label: "Spending", icon: PiggyBank, ready: true },
  { to: "/portfolio", label: "Portfolio", icon: BarChart3, ready: true },
  { to: "/goals", label: "Goals", icon: Target, ready: true },
  { to: "/forecast", label: "Forecast", icon: CalendarRange, ready: true },
  { to: "/scenarios", label: "Scenarios", icon: GitCompare, ready: true },
  { to: "/advisor", label: "Advisor", icon: MessageSquareText, ready: true },
  { to: "/settings", label: "Settings", icon: Settings, ready: true },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

/** Shown in the mobile tab bar; the rest live behind "More". */
export const MOBILE_PRIMARY = ["/", "/accounts", "/transactions", "/spending"] as const;
