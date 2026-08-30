import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Receipt, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkActionsBar } from "@/components/transactions/BulkActionsBar";
import { LedgerSummary } from "@/components/transactions/LedgerSummary";
import { SplitDialog } from "@/components/transactions/SplitDialog";
import { RulesPanel } from "@/components/transactions/RulesPanel";
import { StatementsPanel } from "@/components/transactions/StatementsPanel";

import { TransactionFiltersBar } from "@/components/transactions/TransactionFiltersBar";
import { TransactionTable } from "@/components/transactions/TransactionTable";
import { useAccounts, useCategories } from "@/hooks/useFinancials";
import {
  defaultFilters,
  useCreateCategoryRule,
  useReviewCount,
  useStatements,
  useTransactionTotals,
  useTransactionsPage,
  useUpdateTransactions,
  type SortColumn,
  type TransactionFilters,
  type TransactionRow,
} from "@/hooks/useTransactions";
import { useScope } from "@/hooks/useScope";
import { suggestRulePattern } from "@/lib/text";
import { useQuickAdd, useTransactionSearchIntent } from "@/lib/quick-add";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/transactions")({
  validateSearch: (search: Record<string, unknown>): { statement?: string } =>
    typeof search["statement"] === "string" ? { statement: search["statement"] } : {},
  head: () => ({
    meta: [
      { title: "Transactions — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Import bank statements from UK, Egyptian, Jordanian and US accounts and review every categorised transaction in one dense ledger.",
      },
      { property: "og:title", content: "Transactions — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Statement imports, categorised transactions and a review queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const navigate = useNavigate();
  const { statement: scopedStatementId } = Route.useSearch();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: statements = [] } = useStatements();
  const { activeLabel, isHousehold } = useScope();

  const [tab, setTab] = useState("all");
  const [filters, setFilters] = useState<TransactionFilters>(defaultFilters);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState<TransactionRow | null>(null);

  const openImport = () => void navigate({ to: "/import" });
  useQuickAdd("import", openImport);
  useTransactionSearchIntent((term) => {
    setTab("all");
    setPage(0);
    setFilters((current) => ({ ...current, search: term }));
  });

  useEffect(() => {
    if (!scopedStatementId) return;
    // Arriving from the import workspace means "show me what this file brought
    // in" — transfers included, or the rows would silently go missing.
    setTab("all");
    setPage(0);
    setFilters({ ...defaultFilters, statementId: scopedStatementId, hideTransfers: false });
  }, [scopedStatementId]);

  const activeFilters = useMemo<TransactionFilters>(
    () => (tab === "review" ? { ...filters, reviewOnly: true } : filters),
    [filters, tab],
  );

  const {
    data: pageData,
    isLoading,
    isFetching,
  } = useTransactionsPage(activeFilters, page, PAGE_SIZE);
  const { data: totals, isLoading: totalsLoading } = useTransactionTotals(activeFilters);
  const { data: reviewCount = 0 } = useReviewCount();
  const update = useUpdateTransactions();
  const createRule = useCreateCategoryRule();

  const rows = pageData?.rows ?? [];
  const count = pageData?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [activeFilters]);

  const categoryName = (id: string | null) =>
    categories.find((category) => category.id === id)?.name ?? "Uncategorised";

  const changeCategory = async (row: TransactionRow, categoryId: string | null) => {
    await update.mutateAsync({
      ids: [row.id],
      values: { category_id: categoryId, is_reviewed: true, ai_confidence: categoryId ? 1 : null },
    });

    if (!categoryId) return;
    const pattern = suggestRulePattern(row.description ?? "", row.merchant);
    if (!pattern) return;

    toast.success(`Filed as ${categoryName(categoryId)}`, {
      description: `Always categorise “${pattern}” as ${categoryName(categoryId)}?`,
      action: {
        label: "Always",
        onClick: () => {
          createRule
            .mutateAsync({ pattern, categoryId, fromTransactionId: row.id })
            .then((updated) =>
              toast.success(
                `Rule saved${updated ? ` · ${updated} past transaction${updated === 1 ? "" : "s"} recategorised` : ""}`,
              ),
            )
            .catch(() => toast.error("Could not save that rule."));
        },
      },
    });
  };

  const bulkUpdate = async (values: Record<string, unknown>, message: string) => {
    const ids = [...selected];
    await update.mutateAsync({ ids, values });
    setSelected(new Set());
    toast.success(`${ids.length} transaction${ids.length === 1 ? "" : "s"} ${message}`);
  };

  const sort = (column: SortColumn) =>
    setFilters((current) => ({
      ...current,
      sortColumn: column,
      sortAscending: current.sortColumn === column ? !current.sortAscending : false,
    }));

  const nothingImported = statements.length === 0 && count === 0 && !isLoading;

  const scopedStatement = filters.statementId
    ? (statements.find((statement) => statement.id === filters.statementId) ?? null)
    : null;

  const ledger = (
    <div className="space-y-3">
      {scopedStatement && (
        <div className="hairline flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Showing only the rows imported from{" "}
            <span className="text-foreground">{scopedStatement.file_name ?? "this statement"}</span>
            {scopedStatement.discrepancy !== null &&
              Math.abs(scopedStatement.discrepancy) > 0.01 && (
                <span className="text-warn"> · balances don't reconcile</span>
              )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[0.7rem]"
            onClick={() => setFilters((current) => ({ ...current, statementId: null }))}
          >
            <X className="size-3" /> Clear
          </Button>
        </div>
      )}

      <TransactionFiltersBar
        filters={filters}
        onChange={setFilters}
        accounts={accounts}
        categories={categories}
      />

      <LedgerSummary totals={totals} loading={totalsLoading} />

      <BulkActionsBar
        count={selected.size}
        categories={categories}
        busy={update.isPending}
        onCategorise={(categoryId) =>
          void bulkUpdate(
            { category_id: categoryId, is_reviewed: true, ai_confidence: categoryId ? 1 : null },
            `filed as ${categoryName(categoryId)}`,
          )
        }
        onMarkReviewed={() => void bulkUpdate({ is_reviewed: true }, "marked reviewed")}
        onMarkTransfer={() =>
          void bulkUpdate({ is_transfer: true, is_reviewed: true }, "marked as transfers")
        }
        onClear={() => setSelected(new Set())}
      />

      <div className="hairline rounded-lg bg-surface">
        {rows.length === 0 && !isLoading ? (
          <EmptyState
            icon={<Receipt className="size-4" />}
            title={
              tab === "review" ? "Nothing waiting on you" : "No transactions match these filters"
            }
            body={
              tab === "review"
                ? "Every imported transaction has a category you have either confirmed or that was read with high confidence."
                : "Widen the date range, clear a filter, or import the statement that covers this period."
            }
            className="border-0"
          />
        ) : (
          <TransactionTable
            rows={rows}
            loading={isLoading}
            categories={categories}
            accounts={accounts}
            selected={selected}
            onToggle={(id) =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={(ids, checked) =>
              setSelected((current) => {
                const next = new Set(current);
                for (const id of ids) {
                  if (checked) next.add(id);
                  else next.delete(id);
                }
                return next;
              })
            }
            onCategoryChange={(row, categoryId) => void changeCategory(row, categoryId)}
            onSplit={setSplitting}
            sortColumn={filters.sortColumn}
            sortAscending={filters.sortAscending}
            onSort={sort}
          />
        )}
      </div>

      {count > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p className="num">
            {page * PAGE_SIZE + 1}–{Math.min(count, (page + 1) * PAGE_SIZE)} of{" "}
            {count.toLocaleString("en-GB")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
              disabled={page === 0 || isFetching}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </Button>
            <span className="num">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
              disabled={page + 1 >= pageCount || isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      title="Transactions"
      description={
        isHousehold
          ? "Every statement imported, read into dated transactions and categorised against your own categories."
          : `Transactions on ${activeLabel}'s accounts, plus anything held jointly.`
      }
    >
      {nothingImported ? (
        <EmptyState
          icon={<Receipt className="size-4" />}
          title="Nothing imported yet"
          body="Drag in statements from Starling, HSBC, CIB, Arab Bank or a US brokerage — PDF, CSV or Excel, up to 20MB each. You don't need to say which account: each file is read on the server, matched to the right account, converted at the rate for each transaction's date, and categorised for you."
          action={
            <Button onClick={openImport}>
              <Upload className="size-3.5" /> Import statements
            </Button>
          }
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="review" className="gap-1.5">
                Review queue
                {reviewCount > 0 && (
                  <span className="num rounded-full border border-warn/40 px-1.5 text-[0.6rem] text-warn">
                    {reviewCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="statements">Statements</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
            </TabsList>

            <Button size="sm" onClick={openImport}>
              <Upload className="size-3.5" /> Import statements
            </Button>
          </div>

          <TabsContent value="all">{tab === "all" && ledger}</TabsContent>
          <TabsContent value="review">{tab === "review" && ledger}</TabsContent>
          <TabsContent value="statements">
            <div className="hairline rounded-lg bg-surface px-4">
              <StatementsPanel
                accounts={accounts}
                onImport={openImport}
                onReview={(statement) => {
                  // Reviewing a file means every row it brought in, transfers included.
                  setFilters({
                    ...defaultFilters,
                    statementId: statement.id,
                    hideTransfers: false,
                  });
                  setPage(0);
                  setSelected(new Set());
                  setTab("all");
                }}
              />
            </div>
          </TabsContent>
          <TabsContent value="rules">
            {tab === "rules" && <RulesPanel categories={categories} />}
          </TabsContent>
        </Tabs>
      )}

      <SplitDialog
        transaction={splitting}
        categories={categories}
        onOpenChange={(open) => !open && setSplitting(null)}
      />
    </AppShell>
  );
}
