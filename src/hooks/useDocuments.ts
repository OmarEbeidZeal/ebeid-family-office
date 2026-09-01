/**
 * The documents layer's data hooks.
 *
 * One shelf, four readers. Uploading is the only thing the browser does; the
 * queue reads on the server and these hooks watch it, nudge it while the tab is
 * open, and surface the single question the reader cannot answer for itself.
 */
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import {
  cancelDocument,
  confirmDocumentType,
  deleteDocument,
  documentFileUrl,
  pumpDocumentQueue,
  queueDocuments,
  retryDocument,
} from "@/lib/documents.functions";
import { DOCUMENT_IN_FLIGHT, type DocType } from "@/lib/documents/types";
import { useAuth } from "./useAuth";

export type DocumentRow = {
  id: string;
  household_id: string;
  owner_profile_id: string | null;
  uploaded_by: string | null;
  import_batch_id: string | null;
  statement_id: string | null;
  record_id: string | null;
  storage_bucket: string;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  file_hash: string | null;
  doc_type: string | null;
  detected_type: string | null;
  type_hint: string | null;
  type_confidence: number | null;
  type_reason: string | null;
  source_format: string | null;
  confidence: number | null;
  status: string;
  attempts: number;
  period_start: string | null;
  period_end: string | null;
  error_message: string | null;
  extracted_at: string | null;
  created_at: string;
};

export type InsurancePolicyRow = {
  id: string;
  household_id: string;
  document_id: string | null;
  owner_profile_id: string | null;
  insurer: string;
  insurer_domain: string | null;
  policy_type: string;
  policy_number_last4: string | null;
  insured_person: string | null;
  beneficiaries: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  premium_amount: number | null;
  premium_frequency: string;
  currency: string;
  sum_assured: number | null;
  benefit_amount: number | null;
  benefit_frequency: string | null;
  benefit_period_months: number | null;
  deferred_period_weeks: number | null;
  in_trust: boolean | null;
  exclusions: string | null;
  notes: string | null;
  status: string;
  source: string;
  needs_review: boolean;
  confidence: number | null;
  created_at: string;
};

export type TenancyRow = {
  id: string;
  household_id: string;
  document_id: string | null;
  owner_profile_id: string | null;
  role: string;
  property_address: string;
  landlord_name: string | null;
  tenant_names: string | null;
  agent_name: string | null;
  reference_last4: string | null;
  term_start: string | null;
  term_end: string | null;
  break_clause_date: string | null;
  break_clause_notes: string | null;
  notice_period_months: number | null;
  rent_amount: number | null;
  rent_frequency: string;
  currency: string;
  deposit_amount: number | null;
  deposit_scheme: string | null;
  rent_review_terms: string | null;
  utilities_responsibility: string | null;
  council_tax_responsibility: string | null;
  repairs_responsibility: string | null;
  permitted_occupiers: string | null;
  linked_expense_id: string | null;
  linked_income_id: string | null;
  linked_asset_id: string | null;
  linked_goal_id: string | null;
  notes: string | null;
  status: string;
  source: string;
  needs_review: boolean;
  confidence: number | null;
  created_at: string;
};

export type PayslipRow = {
  id: string;
  household_id: string;
  document_id: string | null;
  profile_id: string | null;
  employer: string | null;
  employee_name: string | null;
  payroll_ref_last4: string | null;
  pay_date: string;
  period_start: string | null;
  period_end: string | null;
  pay_frequency: string | null;
  tax_year: string | null;
  tax_code: string | null;
  currency: string;
  gross_pay: number | null;
  net_pay: number | null;
  income_tax: number | null;
  national_insurance: number | null;
  employee_pension: number | null;
  employer_pension: number | null;
  salary_sacrifice: boolean;
  student_loan: number | null;
  other_deductions: number | null;
  benefits_in_kind: number | null;
  ytd_gross: number | null;
  ytd_income_tax: number | null;
  ytd_national_insurance: number | null;
  ytd_employee_pension: number | null;
  ytd_employer_pension: number | null;
  ytd_benefits_in_kind: number | null;
  ytd_student_loan: number | null;
  ytd_net_pay: number | null;
  matched_transaction_id: string | null;
  reconciliation: string;
  reconciliation_delta: number | null;
  notes: string | null;
  source: string;
  needs_review: boolean;
  confidence: number | null;
  created_at: string;
};

/* ------------------------------------------------------------- queries */

export function useDocuments() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["documents", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("documents")
        .select("*")
        .eq("household_id", household!.id)
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as DocumentRow[];
    },
  });
}

export function useInsurancePolicies() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["insurance-policies", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("insurance_policies")
        .select("*")
        .eq("household_id", household!.id)
        .order("policy_type", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InsurancePolicyRow[];
    },
  });
}

export function useTenancies() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["tenancies", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("tenancies")
        .select("*")
        .eq("household_id", household!.id)
        .order("term_start", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TenancyRow[];
    },
  });
}

export function usePayslips() {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["payslips", household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("payslips")
        .select("*")
        .eq("household_id", household!.id)
        .order("pay_date", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as PayslipRow[];
    },
  });
}

/* ----------------------------------------------------------- mutations */

function useInvalidateDocuments() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      "documents",
      "insurance-policies",
      "tenancies",
      "payslips",
      "import-batches",
      "import-statements",
      "account-proposals",
      "income_streams",
      "forecast_expenses",
      "assets",
      "goals",
      "transactions",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

const SAFE_NAME = /[^a-zA-Z0-9._-]+/g;

export type DocumentUploadProgress = {
  name: string;
  state: "uploading" | "done" | "error";
  message?: string;
};

/** Uploads files into the private bucket, then registers them as one batch. */
export function useQueueDocuments() {
  const { household } = useAuth();
  const invalidate = useInvalidateDocuments();

  return useMutation({
    mutationFn: async ({
      files,
      typeHint,
      ownerProfileId,
      onProgress,
    }: {
      files: File[];
      typeHint?: DocType | null;
      ownerProfileId?: string | null;
      onProgress?: (progress: DocumentUploadProgress) => void;
    }) => {
      if (!household?.id) throw new Error("No household is linked to this account.");

      const uploaded: Array<{
        path: string;
        name: string;
        size: number;
        mimeType: string | null;
      }> = [];
      const rejected: Array<{ name: string; message: string }> = [];

      for (const file of files) {
        onProgress?.({ name: file.name, state: "uploading" });
        const safe = file.name.replace(SAFE_NAME, "-").slice(-120);
        const path = `${household.id}/inbox/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from("documents").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (error) {
          rejected.push({ name: file.name, message: error.message });
          onProgress?.({ name: file.name, state: "error", message: error.message });
          continue;
        }
        uploaded.push({
          path,
          name: file.name.slice(0, 300),
          size: file.size,
          mimeType: file.type || null,
        });
        onProgress?.({ name: file.name, state: "done" });
      }

      if (!uploaded.length) {
        throw new Error(rejected[0]?.message ?? "None of those files could be uploaded.");
      }

      const result = await queueDocuments({
        data: {
          files: uploaded,
          typeHint: typeHint ?? null,
          ownerProfileId: ownerProfileId ?? null,
        },
      });
      return { ...result, uploaded: uploaded.length, rejected };
    },
    onSuccess: invalidate,
  });
}

export function useConfirmDocumentType() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      docType: DocType;
      ownerProfileId?: string | null;
    }) => confirmDocumentType({ data: input }),
    onSuccess: invalidate,
  });
}

export function useRetryDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: async (documentId: string) => retryDocument({ data: { documentId } }),
    onSuccess: invalidate,
  });
}

export function useCancelDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: async (documentId: string) => cancelDocument({ data: { documentId } }),
    onSuccess: invalidate,
  });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: async (documentId: string) => deleteDocument({ data: { documentId } }),
    onSuccess: invalidate,
  });
}

/** Opens the original file in a new tab through a short-lived signed link. */
export function useOpenDocument() {
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { url } = await documentFileUrl({ data: { documentId } });
      return url;
    },
    onSuccess: (url) => {
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
  });
}

/**
 * Keeps the queue moving while the shelf is open. The five-minute scheduled run
 * does the same job unattended, so closing the tab only slows things down.
 */
export function useDocumentQueueDriver(documents: DocumentRow[] | undefined) {
  const queryClient = useQueryClient();
  const pumping = useRef(false);

  const waiting = useMemo(
    () => (documents ?? []).filter((row) => DOCUMENT_IN_FLIGHT.has(row.status)).length,
    [documents],
  );

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || pumping.current) return;
      pumping.current = true;
      try {
        await pumpDocumentQueue({ data: { limit: 2 } });
      } catch {
        // A failed pump is not fatal: the scheduled run picks the work up.
      } finally {
        pumping.current = false;
        if (!cancelled) {
          for (const key of [
            "documents",
            "insurance-policies",
            "tenancies",
            "payslips",
            "import-batches",
            "import-statements",
          ]) {
            void queryClient.invalidateQueries({ queryKey: [key] });
          }
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
