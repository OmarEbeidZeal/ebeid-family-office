import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { applyCategoryRule } from "@/lib/statements.functions";
import { expandSplits, type SplitPart } from "@/lib/spending";
import { useAuth } from "./useAuth";
import { useAccounts } from "./useFinancials";
import { useScope } from "./useScope";

export type TransactionRow = {
  id: string;
  household_id: string;
  account_id: string | null;
  statement_id: string | null;
  booked_date: string;
  description: string | null;
  raw_description: string | null;
  merchant: string | null;
  amount: number;
  direction: "debit" | "credit" | string;
  currency: string;
  amount_base: number | null;
  balance_after: number | null;
  category_id: string | null;
  is_recurring: boolean;
  is_transfer: boolean;
  is_reviewed: boolean;
  ai_confidence: number | null;
  notes: string | null;
};

export type StatementRow = {
  id: string;
  account_id: string | null;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  status: string;
  transaction_count: number | null;
  duplicate_count: number | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  discrepancy: number | null;
  currency: string | null;
  error_message: string | null;
  parsed_at: string | null;
  created_at: string;
};

export type CategoryRuleRow = {
  id: string;
  match_pattern: string;
  match_type: string;
  category_id: string;
  applied_count: number;
  is_active: boolean;
  created_at: string;
};

export type SplitRow = {
  id: string;
  transaction_id: string;
  category_id: string | null;
  amount: number;
  note: string | null;
};

export const UNCATEGORISED = "__uncategorised";
export const LOW_CONFIDENCE = 0.7;

export type SortColumn = "booked_date" | "amount" | "description" | "merchant";

export type TransactionFilters = {
  from: string | null;
  to: string | null;
  accountIds: string[];
  categoryIds: string[];
  direction: "all" | "debit" | "credit";
  search: string;
  minAmount: number | null;
  maxAmount: number | null;
  reviewOnly: boolean;
  hideTransfers: boolean;
  /** Set when reviewing the rows a single statement brought in. */
  statementId: string | null;
  sortColumn: SortColumn;
  sortAscending: boolean;
};

export const defaultFilters: TransactionFilters = {
  from: null,
  to: null,
  accountIds: [],
  categoryIds: [],
  direction: "all",
  search: "",
  minAmount: null,
  maxAmount: null,
  reviewOnly: false,
  hideTransfers: true,
  statementId: null,
  sortColumn: "booked_date",
  sortAscending: false,
};

/** PostgREST filter strings are comma-delimited, so those characters must go. */
function safeSearch(value: string) {
  return value.replace(/[,()%*\\]/g, " ").trim();
}

/** Accounts visible under the current Me / Haya / Household toggle. */
export function useScopedAccountIds(): string[] | null {
  const { data: accounts } = useAccounts();
  const { matches, isHousehold } = useScope();
  return useMemo(() => {
    if (isHousehold || !accounts) return null;
    return accounts.filter((account) => matches(account.owner_profile_id)).map((a) => a.id);
  }, [accounts, matches, isHousehold]);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(
  householdId: string,
  filters: TransactionFilters,
  scopedAccountIds: string[] | null,
  select: string,
  options?: { count?: "exact" | undefined; head?: boolean | undefined },
) {
  let query = db
    .from("transactions")
    .select(select, options as any)
    .eq("household_id", householdId);

  const accountIds = filters.accountIds.length
    ? scopedAccountIds
      ? filters.accountIds.filter((id) => scopedAccountIds.includes(id))
      : filters.accountIds
    : scopedAccountIds;

  if (accountIds) {
    // An empty list must return nothing rather than everything.
    query = query.in(
      "account_id",
      accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  if (filters.from) query = query.gte("booked_date", filters.from);
  if (filters.to) query = query.lte("booked_date", filters.to);
  if (filters.direction !== "all") query = query.eq("direction", filters.direction);
  if (filters.hideTransfers) query = query.eq("is_transfer", false);
  if (filters.statementId) query = query.eq("statement_id", filters.statementId);
  if (filters.minAmount !== null) query = query.gte("amount", filters.minAmount);
  if (filters.maxAmount !== null) query = query.lte("amount", filters.maxAmount);

  if (filters.categoryIds.length) {
    const real = filters.categoryIds.filter((id) => id !== UNCATEGORISED);
    const includeNull = filters.categoryIds.includes(UNCATEGORISED);
    if (real.length && includeNull) {
      query = query.or(`category_id.is.null,category_id.in.(${real.join(",")})`);
    } else if (includeNull) {
      query = query.is("category_id", null);
    } else if (real.length) {
      query = query.in("category_id", real);
    }
  }

  if (filters.reviewOnly) {
    query = query
      .eq("is_reviewed", false)
      .or(`ai_confidence.lt.${LOW_CONFIDENCE},ai_confidence.is.null,category_id.is.null`);
  }

  const search = safeSearch(filters.search);
  if (search) {
    query = query.or(
      `description.ilike.%${search}%,merchant.ilike.%${search}%,raw_description.ilike.%${search}%`,
    );
  }

  return query;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useTransactionsPage(filters: TransactionFilters, page: number, pageSize: number) {
  const { household } = useAuth();
  const scopedAccountIds = useScopedAccountIds();

  return useQuery({
    queryKey: ["transactions", "page", household?.id, filters, scopedAccountIds, page, pageSize],
    enabled: !!household?.id,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const query = buildQuery(household!.id, filters, scopedAccountIds, "*", { count: "exact" })
        .order(filters.sortColumn, { ascending: filters.sortAscending, nullsFirst: false })
        .order("id", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as TransactionRow[], count: count ?? 0 };
    },
  });
}

export function useTransactionTotals(filters: TransactionFilters) {
  const { household } = useAuth();
  const scopedAccountIds = useScopedAccountIds();

  return useQuery({
    queryKey: ["transactions", "totals", household?.id, filters, scopedAccountIds],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await buildQuery(
        household!.id,
        filters,
        scopedAccountIds,
        "amount, amount_base, currency, direction",
      ).limit(50000);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        amount: number;
        amount_base: number | null;
        currency: string;
        direction: string;
      }>;
      let inflow = 0;
      let outflow = 0;
      let unconverted = 0;
      for (const row of rows) {
        const value = row.amount_base;
        if (value === null) {
          unconverted += 1;
          continue;
        }
        if (row.direction === "credit") inflow += Number(value);
        else outflow += Number(value);
      }
      return { inflow, outflow, net: inflow - outflow, count: rows.length, unconverted };
    },
  });
}

/** Rows awaiting a human decision: unreviewed, and either uncategorised or a low-confidence guess. */
export function useReviewCount() {
  const { household } = useAuth();
  const scopedAccountIds = useScopedAccountIds();

  return useQuery({
    queryKey: ["transactions", "review-count", household?.id, scopedAccountIds],
    enabled: !!household?.id,
    queryFn: async () => {
      const { count, error } = await buildQuery(
        household!.id,
        { ...defaultFilters, reviewOnly: true },
        scopedAccountIds,
        "id",
        { count: "exact", head: true },
      );
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Raw rows for analytics — no pagination, capped so a runaway import can't hang the page. */
export function useTransactionHistory(monthsBack = 24) {
  const { household } = useAuth();
  const scopedAccountIds = useScopedAccountIds();

  return useQuery({
    queryKey: ["transactions", "history", household?.id, monthsBack, scopedAccountIds],
    enabled: !!household?.id,
    queryFn: async () => {
      const since = new Date();
      since.setUTCMonth(since.getUTCMonth() - monthsBack, 1);
      let query = db
        .from("transactions")
        .select(
          "id, account_id, booked_date, description, merchant, amount, amount_base, currency, direction, category_id, is_transfer, is_recurring, is_reviewed, ai_confidence",
        )
        .eq("household_id", household!.id)
        .gte("booked_date", since.toISOString().slice(0, 10))
        .order("booked_date", { ascending: false })
        .limit(50000);
      if (scopedAccountIds) {
        query = query.in(
          "account_id",
          scopedAccountIds.length ? scopedAccountIds : ["00000000-0000-0000-0000-000000000000"],
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as TransactionRow[];

      // A split transaction is several kinds of spending wearing one row. The
      // analysis has to see the parts, or a £400 shop split between groceries
      // and furniture lands wholly under whichever category is larger.
      const { data: splitData, error: splitError } = await db
        .from("transaction_splits")
        .select("transaction_id, category_id, amount")
        .eq("household_id", household!.id);
      if (splitError) throw splitError;
      return expandSplits(rows, (splitData ?? []) as SplitPart[]);
    },
  });
}

export function useStatements() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["statements", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("statements")
        .select("*")
        .eq("household_id", household!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StatementRow[];
    },
  });
}

export function useCategoryRules() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["category-rules", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("category_rules")
        .select("*")
        .eq("household_id", household!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CategoryRuleRow[];
    },
  });
}

export function useSplits(transactionId: string | null) {
  return useQuery({
    queryKey: ["transaction-splits", transactionId],
    enabled: !!transactionId,
    queryFn: async () => {
      const { data, error } = await db
        .from("transaction_splits")
        .select("*")
        .eq("transaction_id", transactionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SplitRow[];
    },
  });
}

function useInvalidateTransactions() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["statements"] });
  };
}

export function useUpdateTransactions() {
  const invalidate = useInvalidateTransactions();
  return useMutation({
    mutationFn: async ({
      ids,
      values,
    }: {
      ids: string[];
      values: Partial<Record<string, unknown>>;
    }) => {
      if (!ids.length) return 0;
      const { error } = await db.from("transactions").update(values).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: invalidate,
  });
}

export function useCreateCategoryRule() {
  const { household, profile } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTransactions();

  return useMutation({
    mutationFn: async (input: {
      pattern: string;
      categoryId: string;
      matchType?: string;
      fromTransactionId?: string | null;
    }) => {
      const { data, error } = await db
        .from("category_rules")
        .insert({
          household_id: household!.id,
          match_pattern: input.pattern,
          match_type: input.matchType ?? "contains",
          category_id: input.categoryId,
          created_by: profile?.id ?? null,
          created_from_transaction_id: input.fromTransactionId ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const result = await applyCategoryRule({ data: { ruleId: data.id as string } });
      return result.updated;
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["category-rules"] });
    },
  });
}

export function useDeleteCategoryRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("category_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["category-rules"] }),
  });
}

export function useSaveSplits() {
  const { household } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTransactions();

  return useMutation({
    mutationFn: async (input: {
      transactionId: string;
      splits: Array<{ category_id: string | null; amount: number; note: string | null }>;
    }) => {
      const { error: deleteError } = await db
        .from("transaction_splits")
        .delete()
        .eq("transaction_id", input.transactionId);
      if (deleteError) throw deleteError;

      if (input.splits.length) {
        const { error } = await db.from("transaction_splits").insert(
          input.splits.map((split) => ({
            household_id: household!.id,
            transaction_id: input.transactionId,
            category_id: split.category_id,
            amount: split.amount,
            note: split.note,
          })),
        );
        if (error) throw error;

        // The parent keeps the largest slice's category so single-category
        // views stay meaningful.
        const largest = [...input.splits].sort((a, b) => b.amount - a.amount)[0];
        await db
          .from("transactions")
          .update({ category_id: largest?.category_id ?? null, is_reviewed: true })
          .eq("id", input.transactionId);
      }
    },
    onSuccess: (_result, variables) => {
      invalidate();
      void queryClient.invalidateQueries({
        queryKey: ["transaction-splits", variables.transactionId],
      });
    },
  });
}

export { expandSplits } from "@/lib/spending";
export type { SplitPart } from "@/lib/spending";
