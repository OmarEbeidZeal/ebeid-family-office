/**
 * Putting mis-filed accounts right.
 *
 * Merging and re-filing both move records the household cares about, so the
 * work happens on the server; these hooks only ask for it and then invalidate
 * everything a balance could have changed.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { mergeAccounts, refileStatement } from "@/lib/accounts.functions";
import { findDuplicateAccounts, type DuplicateCandidate } from "@/lib/accounts/duplicates";
import { useAuth } from "./useAuth";

function useInvalidateAfterRepair() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      "accounts",
      "account-activity",
      "account-proposals",
      "import-statements",
      "statement-coverage",
      "statements",
      "transactions",
      "net-worth",
      "holdings",
      "trades",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** How much history each account is carrying — the figure a merge is judged on. */
export type AccountActivity = { statements: number; transactions: number };

export function useAccountActivity() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["account-activity", household?.id],
    enabled: !!household?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: statements, error: statementError }, { data: transactions, error: txError }] =
        await Promise.all([
          db
            .from("statements")
            .select("account_id")
            .eq("household_id", household!.id)
            .not("account_id", "is", null)
            .limit(5000),
          db
            .from("transactions")
            .select("account_id")
            .eq("household_id", household!.id)
            .not("account_id", "is", null)
            .limit(50000),
        ]);
      if (statementError) throw statementError;
      if (txError) throw txError;

      const activity = new Map<string, AccountActivity>();
      const bump = (id: string | null, field: keyof AccountActivity) => {
        if (!id) return;
        const current = activity.get(id) ?? { statements: 0, transactions: 0 };
        current[field] += 1;
        activity.set(id, current);
      };
      for (const row of (statements ?? []) as Array<{ account_id: string | null }>) {
        bump(row.account_id, "statements");
      }
      for (const row of (transactions ?? []) as Array<{ account_id: string | null }>) {
        bump(row.account_id, "transactions");
      }
      return activity;
    },
  });
}

/** Accounts that look like the same account held twice, worst offender first. */
export function useDuplicateAccounts(accounts: DuplicateCandidate[]) {
  const { data: activity } = useAccountActivity();
  return useMemo(
    () =>
      findDuplicateAccounts(
        accounts.map((account) => ({
          ...account,
          statements: activity?.get(account.id)?.statements ?? 0,
        })),
      ),
    [accounts, activity],
  );
}

export function useMergeAccounts() {
  const invalidate = useInvalidateAfterRepair();
  return useMutation({
    mutationFn: async (input: { sourceId: string; targetId: string }) =>
      mergeAccounts({ data: input }),
    onSuccess: invalidate,
  });
}

export function useRefileStatement() {
  const invalidate = useInvalidateAfterRepair();
  return useMutation({
    mutationFn: async (input: { statementId: string; accountId: string }) =>
      refileStatement({ data: input }),
    onSuccess: invalidate,
  });
}
