import { ArrowDown, ArrowUp, Repeat, Scissors, Shuffle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Money } from "@/components/Money";
import { CategoryCombobox } from "./CategoryCombobox";
import { LOW_CONFIDENCE, type SortColumn, type TransactionRow } from "@/hooks/useTransactions";
import type { AccountRow, CategoryRow } from "@/hooks/useFinancials";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function needsReview(row: TransactionRow) {
  if (row.is_reviewed) return false;
  return !row.category_id || (row.ai_confidence ?? 0) < LOW_CONFIDENCE;
}

export function TransactionTable({
  rows,
  loading,
  categories,
  accounts,
  selected,
  onToggle,
  onToggleAll,
  onCategoryChange,
  onSplit,
  sortColumn,
  sortAscending,
  onSort,
}: {
  rows: TransactionRow[];
  loading: boolean;
  categories: CategoryRow[];
  accounts: AccountRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  onCategoryChange: (row: TransactionRow, categoryId: string | null) => void;
  onSplit: (row: TransactionRow) => void;
  sortColumn: SortColumn;
  sortAscending: boolean;
  onSort: (column: SortColumn) => void;
}) {
  const accountName = (id: string | null) =>
    accounts.find((account) => account.id === id)?.nickname ?? "Unlinked";

  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const header = (column: SortColumn, label: string, className?: string) => (
    <th className={cn("px-3 py-2 text-left font-normal", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 text-[0.65rem] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        {sortColumn === column &&
          (sortAscending ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />)}
      </button>
    </th>
  );

  if (loading) {
    return (
      <div className="space-y-1.5 py-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* A phone cannot hold eight columns, and the amount is the one figure
          that must never sit behind a sideways scroll. */}
      <ul className="divide-y divide-border/60 md:hidden">
        {rows.map((row) => {
          const review = needsReview(row);
          return (
            <li
              key={row.id}
              className={cn(
                "flex gap-3 px-3 py-3",
                selected.has(row.id) && "bg-surface-raised",
                review && "border-l-2 border-l-warn",
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={selected.has(row.id)}
                aria-label={`Select ${row.description ?? "transaction"}`}
                onCheckedChange={() => onToggle(row.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">
                  {row.description ?? "Unlabelled transaction"}
                </p>
                <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">
                  <span className="num">{formatDate(row.booked_date, "short")}</span>
                  {" · "}
                  {accountName(row.account_id)}
                  {row.merchant ? ` · ${row.merchant}` : ""}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <div className="hairline -ml-px rounded">
                    <CategoryCombobox
                      value={row.category_id}
                      categories={categories}
                      onChange={(categoryId) => onCategoryChange(row, categoryId)}
                      className="w-auto min-w-[7rem]"
                    />
                  </div>
                  {row.is_transfer && (
                    <Badge icon={<Shuffle className="size-2.5" />} label="Transfer" />
                  )}
                  {row.is_recurring && (
                    <Badge icon={<Repeat className="size-2.5" />} label="Recurring" />
                  )}
                  {review && (
                    <span className="text-[0.6rem] uppercase tracking-wider text-warn">Check</span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Money
                  amount={row.direction === "credit" ? row.amount : -row.amount}
                  currency={row.currency}
                  className={cn("text-xs", row.direction === "credit" && "text-gain")}
                />
                <button
                  type="button"
                  aria-label="Split transaction"
                  onClick={() => onSplit(row)}
                  className="inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wider text-muted-foreground"
                >
                  <Scissors className="size-3" />
                  Split
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[44rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="w-8 px-2 py-2">
                <Checkbox
                  checked={allChecked}
                  aria-label="Select all on this page"
                  onCheckedChange={(checked) =>
                    onToggleAll(
                      rows.map((row) => row.id),
                      checked === true,
                    )
                  }
                />
              </th>
              {header("booked_date", "Date", "w-24")}
              {header("description", "Description")}
              {header("merchant", "Merchant", "hidden lg:table-cell w-40")}
              <th className="hidden w-36 px-3 py-2 text-left text-[0.65rem] font-normal uppercase tracking-wider text-muted-foreground md:table-cell">
                Account
              </th>
              <th className="w-44 px-3 py-2 text-left text-[0.65rem] font-normal uppercase tracking-wider text-muted-foreground">
                Category
              </th>
              {header("amount", "Amount", "w-32 text-right [&>button]:justify-end")}
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const review = needsReview(row);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group border-b border-border/60 transition-colors hover:bg-surface-raised",
                    selected.has(row.id) && "bg-surface-raised",
                    review && "border-l-2 border-l-warn",
                  )}
                >
                  <td className="px-2 py-2 align-top">
                    <Checkbox
                      checked={selected.has(row.id)}
                      aria-label={`Select ${row.description ?? "transaction"}`}
                      onCheckedChange={() => onToggle(row.id)}
                    />
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2 align-top text-muted-foreground">
                    {formatDate(row.booked_date, "short")}
                  </td>
                  <td className="max-w-0 px-3 py-2 align-top">
                    <p className="truncate text-foreground" title={row.description ?? ""}>
                      {row.description ?? "Unlabelled transaction"}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 lg:hidden">
                      {row.merchant && (
                        <span className="truncate text-[0.65rem] text-muted-foreground">
                          {row.merchant}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {row.is_transfer && (
                        <Badge icon={<Shuffle className="size-2.5" />} label="Transfer" />
                      )}
                      {row.is_recurring && (
                        <Badge icon={<Repeat className="size-2.5" />} label="Recurring" />
                      )}
                      {review && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-[0.6rem] uppercase tracking-wider text-warn">
                              Check
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-56 text-xs">
                            {row.category_id
                              ? "The category was a low-confidence guess. Confirm or change it."
                              : "No category could be worked out from the description."}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className="hidden max-w-0 px-3 py-2 align-top text-muted-foreground lg:table-cell">
                    <span className="block truncate">{row.merchant ?? "—"}</span>
                  </td>
                  <td className="hidden max-w-0 px-3 py-2 align-top text-muted-foreground md:table-cell">
                    <span className="block truncate">{accountName(row.account_id)}</span>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <CategoryCombobox
                      value={row.category_id}
                      categories={categories}
                      onChange={(categoryId) => onCategoryChange(row, categoryId)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <Money
                      amount={row.direction === "credit" ? row.amount : -row.amount}
                      currency={row.currency}
                      className={cn("text-xs", row.direction === "credit" && "text-gain")}
                    />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      aria-label="Split transaction"
                      onClick={() => onSplit(row)}
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Scissors className="size-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[0.6rem] uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}
