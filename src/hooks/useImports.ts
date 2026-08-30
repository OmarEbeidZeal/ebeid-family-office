/**
 * The import workspace's data layer.
 *
 * Uploading is the only thing the browser does; everything after that happens
 * on the server queue. These hooks watch that queue, nudge it along while the
 * tab is open, and surface the one question the reader cannot answer itself:
 * which account a file belongs to.
 */
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import {
  cancelStatement,
  pumpImportQueue,
  queueStatements,
  resolveAccountProposal,
  retryStatement,
} from "@/lib/statements.functions";
import { useAuth } from "./useAuth";

export type ImportStatementRow = {
  id: string;
  household_id: string;
  account_id: string | null;
  import_batch_id: string | null;
  proposal_id: string | null;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  file_hash: string | null;
  status: string;
  attempts: number | null;
  next_attempt_at: string | null;
  transaction_count: number | null;
  duplicate_count: number | null;
  period_start: string | null;
  period_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  discrepancy: number | null;
  currency: string | null;
  detected_institution: string | null;
  detected_institution_domain: string | null;
  detected_holder: string | null;
  detected_last4: string | null;
  detected_identifier_kind: string | null;
  detected_country: string | null;
  detected_account_type: string | null;
  match_confidence: number | null;
  match_reason: string | null;
  summary: string | null;
  error_message: string | null;
  parsed_at: string | null;
  created_at: string;
};

export type ImportBatchRow = {
  id: string;
  status: string;
  total_files: number;
  finished_files: number;
  failed_files: number;
  duplicate_files: number;
  imported_transactions: number;
  duplicate_transactions: number;
  proposed_accounts: number;
  message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type AccountProposalRow = {
  id: string;
  household_id: string;
  status: string;
  suggested_nickname: string;
  institution: string | null;
  institution_domain: string | null;
  holder: string | null;
  identifier_last4: string | null;
  identifier_kind: string | null;
  account_type: string | null;
  currency: string | null;
  country: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  closing_balance_date: string | null;
  period_start: string | null;
  period_end: string | null;
  statement_count: number;
  matched_account_id: string | null;
  resolved_account_id: string | null;
  confidence: number | null;
  reason: string | null;
  created_at: string;
};

/** Statuses that mean the queue still has work to do on this file. */
export const IN_FLIGHT = new Set(["queued", "extracting", "parsing"]);
/** Statuses that mean a person has to decide something. */
export const NEEDS_YOU = new Set(["awaiting_account", "failed", "needs_review"]);

export function useImportStatements() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["import-statements", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("statements")
        .select("*")
        .eq("household_id", household!.id)
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as ImportStatementRow[];
    },
  });
}

export function useImportBatches() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["import-batches", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("import_batches")
        .select("*")
        .eq("household_id", household!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ImportBatchRow[];
    },
  });
}

export function useAccountProposals() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["account-proposals", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("account_proposals")
        .select("*")
        .eq("household_id", household!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AccountProposalRow[];
    },
  });
}

function useInvalidateImports() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["import-statements"] });
    void queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    void queryClient.invalidateQueries({ queryKey: ["account-proposals"] });
    void queryClient.invalidateQueries({ queryKey: ["statements"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };
}

const SAFE_NAME = /[^a-zA-Z0-9._-]+/g;

export type UploadProgress = {
  name: string;
  state: "uploading" | "done" | "error";
  message?: string;
};

/**
 * Uploads files, then registers them as one batch. No account is asked for:
 * the reader identifies each statement, and only asks when it truly cannot.
 */
export function useQueueImport() {
  const { household } = useAuth();
  const invalidate = useInvalidateImports();

  return useMutation({
    mutationFn: async ({
      files,
      accountId,
      onProgress,
    }: {
      files: File[];
      accountId?: string | null;
      onProgress?: (progress: UploadProgress) => void;
    }) => {
      if (!household?.id) throw new Error("No household is linked to this account.");

      const uploaded: Array<{ path: string; name: string; size: number }> = [];
      const rejected: Array<{ name: string; message: string }> = [];

      for (const file of files) {
        onProgress?.({ name: file.name, state: "uploading" });
        const safe = file.name.replace(SAFE_NAME, "-").slice(-120);
        const path = `${household.id}/inbox/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from("statements").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (error) {
          rejected.push({ name: file.name, message: error.message });
          onProgress?.({ name: file.name, state: "error", message: error.message });
          continue;
        }
        uploaded.push({ path, name: file.name.slice(0, 300), size: file.size });
        onProgress?.({ name: file.name, state: "done" });
      }

      if (!uploaded.length) {
        throw new Error(rejected[0]?.message ?? "None of those files could be uploaded.");
      }

      const result = await queueStatements({
        data: { files: uploaded, accountId: accountId ?? null },
      });
      return { ...result, uploaded: uploaded.length, rejected };
    },
    onSuccess: invalidate,
  });
}

/** Asks the server to read a couple of queued files right now. */
export function usePumpQueue() {
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async (limit?: number) => pumpImportQueue({ data: limit ? { limit } : {} }),
    onSuccess: invalidate,
  });
}

export function useRetryStatement() {
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async (statementId: string) => retryStatement({ data: { statementId } }),
    onSuccess: invalidate,
  });
}

export function useCancelStatement() {
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async (statementId: string) => cancelStatement({ data: { statementId } }),
    onSuccess: invalidate,
  });
}

export type ResolveProposalInput = {
  proposalId: string;
  action: "create" | "link" | "reject";
  accountId?: string | null;
  nickname?: string | null;
  accountType?: string | null;
  currency?: string | null;
  country?: string | null;
  institution?: string | null;
  ownerProfileId?: string | null;
  isJoint?: boolean;
};

export function useResolveProposal() {
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async (input: ResolveProposalInput) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolveAccountProposal({ data: input as any }),
    onSuccess: invalidate,
  });
}

/**
 * Keeps the queue moving while the workspace is open: poll for progress, and
 * pump the server whenever work is waiting. The five-minute scheduled run does
 * the same job unattended, so closing the tab only slows things down.
 */
export function useQueueDriver(statements: ImportStatementRow[] | undefined) {
  const queryClient = useQueryClient();
  const pumping = useRef(false);

  const waiting = useMemo(
    () => (statements ?? []).filter((row) => IN_FLIGHT.has(row.status)).length,
    [statements],
  );

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || pumping.current) return;
      pumping.current = true;
      try {
        await pumpImportQueue({ data: { limit: 2 } });
      } catch {
        // A failed pump is not fatal: the scheduled run picks the work up.
      } finally {
        pumping.current = false;
        if (!cancelled) {
          void queryClient.invalidateQueries({ queryKey: ["import-statements"] });
          void queryClient.invalidateQueries({ queryKey: ["import-batches"] });
          void queryClient.invalidateQueries({ queryKey: ["account-proposals"] });
          void queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [waiting, queryClient]);

  return { waiting };
}
