import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/forms/FormField";
import { MultiSelect } from "./MultiSelect";
import { UNCATEGORISED, type TransactionFilters } from "@/hooks/useTransactions";
import type { AccountRow, CategoryRow } from "@/hooks/useFinancials";
import { accountTypeLabel } from "@/lib/format";

const RANGES = [
  { value: "all", label: "All time" },
  { value: "1m", label: "This month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function rangeToDates(range: string): { from: string | null; to: string | null } {
  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  switch (range) {
    case "1m":
      return {
        from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
        to: null,
      };
    case "3m":
    case "6m":
    case "12m": {
      const months = Number(range.replace("m", ""));
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months + 1, 1));
      return { from: iso(start), to: null };
    }
    case "ytd":
      return { from: `${today.getUTCFullYear()}-01-01`, to: null };
    default:
      return { from: null, to: null };
  }
}

export function TransactionFiltersBar({
  filters,
  onChange,
  accounts,
  categories,
}: {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  accounts: AccountRow[];
  categories: CategoryRow[];
}) {
  const [range, setRange] = useState("all");
  const [search, setSearch] = useState(filters.search);

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== filters.search) onChange({ ...filters, search });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, filters, onChange]);

  const set = (values: Partial<TransactionFilters>) => onChange({ ...filters, ...values });

  const active =
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.direction !== "all" ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    !!filters.from ||
    !!filters.to ||
    !!filters.search ||
    !filters.hideTransfers;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-44 flex-1 sm:max-w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search description or merchant"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <div className="w-36">
        <SelectNative
          value={range}
          onChange={(value) => {
            setRange(value);
            if (value !== "custom") set(rangeToDates(value));
          }}
          options={RANGES}
          className="h-8 bg-surface-raised text-xs"
        />
      </div>

      {range === "custom" && (
        <>
          <Input
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => set({ from: event.target.value || null })}
            className="num h-8 w-36 text-xs"
          />
          <Input
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => set({ to: event.target.value || null })}
            className="num h-8 w-36 text-xs"
          />
        </>
      )}

      <MultiSelect
        label="Accounts"
        selected={filters.accountIds}
        onChange={(accountIds) => set({ accountIds })}
        emptyLabel="No accounts yet."
        options={accounts.map((account) => ({
          value: account.id,
          label: account.nickname,
          hint: `${accountTypeLabel(account.account_type)} · ${account.currency}`,
        }))}
      />

      <MultiSelect
        label="Categories"
        selected={filters.categoryIds}
        onChange={(categoryIds) => set({ categoryIds })}
        emptyLabel="No categories yet."
        options={[
          { value: UNCATEGORISED, label: "Uncategorised" },
          ...categories.map((category) => ({
            value: category.id,
            label: category.name,
            hint: category.category_group,
          })),
        ]}
      />

      <div className="w-28">
        <SelectNative
          value={filters.direction}
          onChange={(value) => set({ direction: value as TransactionFilters["direction"] })}
          options={[
            { value: "all", label: "In & out" },
            { value: "debit", label: "Money out" },
            { value: "credit", label: "Money in" },
          ]}
          className="h-8 bg-surface-raised text-xs"
        />
      </div>

      <div className="flex items-center gap-1">
        <Input
          inputMode="decimal"
          value={filters.minAmount ?? ""}
          onChange={(event) =>
            set({ minAmount: event.target.value === "" ? null : Number(event.target.value) })
          }
          placeholder="Min"
          className="num h-8 w-20 text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          inputMode="decimal"
          value={filters.maxAmount ?? ""}
          onChange={(event) =>
            set({ maxAmount: event.target.value === "" ? null : Number(event.target.value) })
          }
          placeholder="Max"
          className="num h-8 w-20 text-xs"
        />
      </div>

      <label className="flex h-8 cursor-pointer items-center gap-2 rounded border border-border bg-surface-raised px-2.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={!filters.hideTransfers}
          onChange={(event) => set({ hideTransfers: !event.target.checked })}
          className="size-3 accent-[var(--gold)]"
        />
        Show transfers
      </label>

      {active && (
        <button
          type="button"
          onClick={() => {
            setRange("all");
            setSearch("");
            onChange({
              ...filters,
              from: null,
              to: null,
              accountIds: [],
              categoryIds: [],
              direction: "all",
              search: "",
              minAmount: null,
              maxAmount: null,
              hideTransfers: true,
            });
          }}
          className="flex h-8 items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3" /> Clear
        </button>
      )}
    </div>
  );
}
