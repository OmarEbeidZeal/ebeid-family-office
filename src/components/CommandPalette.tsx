import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  CalendarRange,
  FileUp,
  GitCompare,
  LayoutDashboard,
  MessageSquareText,
  PiggyBank,
  Plus,
  Receipt,
  Scale,
  Settings,
  Target,
  Wallet,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useRecentTransactions, useCategories } from "@/hooks/useFinancials";
import { requestQuickAdd, requestTransactionSearch, type QuickAddKind } from "@/lib/quick-add";
import { formatDate, formatMoney } from "@/lib/format";

type Destination =
  | "/"
  | "/accounts"
  | "/balance-sheet"
  | "/transactions"
  | "/spending"
  | "/portfolio"
  | "/goals"
  | "/forecast"
  | "/scenarios"
  | "/advisor"
  | "/settings";

const PAGES: { to: Destination; label: string; icon: typeof LayoutDashboard; hint: string }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, hint: "Net worth, liquidity, cashflow" },
  { to: "/accounts", label: "Accounts", icon: Building2, hint: "Banks, ISAs, SIPPs, crypto" },
  { to: "/balance-sheet", label: "Balance sheet", icon: Scale, hint: "Assets against liabilities" },
  {
    to: "/transactions",
    label: "Transactions",
    icon: Receipt,
    hint: "The ledger and review queue",
  },
  { to: "/spending", label: "Spending", icon: PiggyBank, hint: "Categories, recurring, merchants" },
  { to: "/portfolio", label: "Portfolio", icon: BarChart3, hint: "Holdings, policy, watchlist" },
  { to: "/goals", label: "Goals", icon: Target, hint: "Costings, contributions, SDLT" },
  { to: "/forecast", label: "Forecast", icon: CalendarRange, hint: "Five-year projection" },
  { to: "/scenarios", label: "Scenarios", icon: GitCompare, hint: "What-ifs and Monte Carlo" },
  { to: "/advisor", label: "Advisor", icon: MessageSquareText, hint: "Grounded in your numbers" },
  { to: "/settings", label: "Settings", icon: Settings, hint: "Household, FX, market data, tax" },
];

const ACTIONS: {
  kind: QuickAddKind;
  to: Destination;
  label: string;
  icon: typeof Plus;
}[] = [
  { kind: "account", to: "/accounts", label: "Add an account", icon: Building2 },
  { kind: "asset", to: "/balance-sheet", label: "Add an asset", icon: Scale },
  { kind: "liability", to: "/balance-sheet", label: "Add a liability", icon: Scale },
  { kind: "goal", to: "/goals", label: "Add a goal", icon: Target },
  { kind: "holding", to: "/portfolio", label: "Add a holding", icon: BarChart3 },
  { kind: "income", to: "/forecast", label: "Add an income stream", icon: Wallet },
  { kind: "expense", to: "/forecast", label: "Add a planned outgoing", icon: CalendarRange },
  { kind: "scenario", to: "/scenarios", label: "Add a scenario", icon: GitCompare },
  { kind: "import", to: "/transactions", label: "Import statements", icon: FileUp },
];

/** ⌘K: jump anywhere, search the ledger, start any add flow, ask the advisor. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const transactionsQuery = useRecentTransactions(12);
  const categoriesQuery = useCategories();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("efo:open-command-palette", onOpen);
    return () => window.removeEventListener("efo:open-command-palette", onOpen);
  }, []);

  const categories = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((row) => [row.id, row.name])),
    [categoriesQuery.data],
  );

  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (trimmed.length < 2) return [];
    return (transactionsQuery.data ?? [])
      .filter((row) => (row.description ?? "").toLowerCase().includes(trimmed))
      .slice(0, 6);
  }, [transactionsQuery.data, trimmed]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const go = (to: Destination) => {
    close();
    void navigate({ to });
  };

  const quickAdd = (kind: QuickAddKind, to: Destination) => {
    close();
    requestQuickAdd(kind);
    void navigate({ to });
  };

  const searchLedger = (term: string) => {
    close();
    requestTransactionSearch(term);
    void navigate({ to: "/transactions" });
  };

  return (
    <CommandDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Jump to a page, search the ledger, add an account, ask the advisor…"
      />
      <CommandList className="max-h-[22rem]">
        <CommandEmpty>Nothing matches that. Try a page name, a merchant, or “add”.</CommandEmpty>

        {matches.length > 0 && (
          <>
            <CommandGroup heading="Transactions">
              {matches.map((row) => (
                <CommandItem
                  key={row.id}
                  value={`txn-${row.id}-${row.description ?? ""}`}
                  onSelect={() => searchLedger(row.description ?? "")}
                >
                  <Receipt className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{row.description ?? "Unlabelled"}</span>
                  <span className="num ml-3 shrink-0 text-xs text-muted-foreground">
                    {formatDate(row.booked_date, "short")} ·{" "}
                    {formatMoney(Number(row.amount), row.currency, { decimals: 0 })}
                    {row.category_id && categories.get(row.category_id)
                      ? ` · ${categories.get(row.category_id)}`
                      : ""}
                  </span>
                </CommandItem>
              ))}
              {trimmed.length >= 2 && (
                <CommandItem
                  value={`search-all-${trimmed}`}
                  onSelect={() => searchLedger(query.trim())}
                >
                  <Receipt className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  Search the whole ledger for “{query.trim()}”
                </CommandItem>
              )}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          {PAGES.map((page) => (
            <CommandItem
              key={page.to}
              value={`page-${page.label}-${page.hint}`}
              onSelect={() => go(page.to)}
            >
              <page.icon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1">{page.label}</span>
              <span className="ml-3 hidden text-xs text-muted-foreground sm:inline">
                {page.hint}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Add">
          {ACTIONS.map((action) => (
            <CommandItem
              key={action.kind}
              value={`add-${action.label}`}
              onSelect={() => quickAdd(action.kind, action.to)}
            >
              <action.icon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {trimmed.length >= 2 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Advisor">
              <CommandItem value={`advisor-${trimmed}`} onSelect={() => go("/advisor")}>
                <MessageSquareText className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                Ask the advisor about “{query.trim()}”
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Anything can raise the palette without prop-drilling. */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent("efo:open-command-palette"));
}
