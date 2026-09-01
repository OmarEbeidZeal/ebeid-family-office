/**
 * One document, start to finish.
 *
 * The order is the same as the statement pipeline's, for the same reasons:
 * hash before spending anything on the file, decide what it is before reading
 * it, and never guess when a wrong guess is expensive. A payslip filed as an
 * insurance policy would quietly put the £100,000 tracker out by a year's
 * salary, so an uncertain classification stops and asks instead.
 *
 * A bank statement is handed straight to the statement queue rather than
 * reimplemented here. There is one importer, and it is the one that already
 * reconciles balances.
 */
import { StatementFailure } from "../import/failure";
import { scrubDeep } from "../text";

import { classifyDocument, CONFIRM_BELOW } from "./classify.server";
import { extractDocument, type DocumentExtract } from "./extract.server";
import { loadPeople } from "./people.server";
import { persistInsurance } from "./persist/insurance.server";
import { persistPayslip, PayslipUnreadable } from "./persist/payslip.server";
import { persistTenancy } from "./persist/tenancy.server";
import { CLASSIFY_SAMPLE, documentText, downloadDocumentFile } from "./read.server";
import { redactExtracted } from "./redact";
import { failDocument, releaseDocument, type QueuedDocument } from "./queue.server";
import { DOC_TYPE_LABELS, type DocType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type DocumentOutcome =
  | { kind: "linked"; docType: DocType; summary: string; needsReview: boolean }
  | { kind: "statement"; statementId: string }
  | { kind: "needs_type"; detected: DocType | null; reason: string }
  | { kind: "filed"; message: string }
  | { kind: "duplicate"; message: string }
  | { kind: "failed"; message: string };

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isoDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return match ? match[0]! : null;
}

/** The window a document covers, for the shelf it sits on. */
function periodOf(type: DocType, extract: any): { start: string | null; end: string | null } {
  if (type === "insurance_policy") {
    return { start: isoDate(extract.start_date), end: isoDate(extract.end_date) };
  }
  if (type === "tenancy") {
    return { start: isoDate(extract.term_start), end: isoDate(extract.term_end) };
  }
  if (type === "payslip") {
    return {
      start: isoDate(extract.period_start),
      end: isoDate(extract.period_end) ?? isoDate(extract.pay_date),
    };
  }
  return { start: null, end: null };
}

/* ------------------------------------------------------------ hand-offs */

/**
 * A bank statement stops being a document here and becomes a statement.
 *
 * The document row stays as the receipt for the upload and points at the
 * statement, so the documents shelf can still show every file the household
 * ever sent and the import screen keeps owning the parsing.
 */
async function handOffToStatements(
  supabase: Client,
  document: QueuedDocument,
  detail: { detected: DocType | null; confidence: number; reason: string; format: string | null },
): Promise<DocumentOutcome> {
  if (document.statement_id) {
    return { kind: "statement", statementId: document.statement_id };
  }

  const { data: statement, error } = await supabase
    .from("statements")
    .insert({
      household_id: document.household_id,
      account_id: null,
      import_batch_id: document.import_batch_id,
      uploaded_by: document.uploaded_by,
      storage_bucket: document.storage_bucket ?? "documents",
      file_path: document.file_path,
      file_name: document.file_name,
      file_size: document.file_size,
      file_hash: document.file_hash,
      source_format: detail.format,
      status: "queued",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from("documents")
    .update({
      doc_type: "bank_statement",
      detected_type: detail.detected,
      type_confidence: detail.confidence,
      type_reason: detail.reason,
      source_format: detail.format,
      statement_id: statement.id,
      status: "linked",
      locked_at: null,
      error_message: null,
      extracted_at: new Date().toISOString(),
    })
    .eq("id", document.id);

  return { kind: "statement", statementId: statement.id as string };
}

/* ---------------------------------------------------------------- process */

/**
 * Runs one claimed document to a terminal state.
 *
 * A `StatementFailure` is a verdict about the file — a scanned PDF, a Word
 * document, something that reads as nothing at all — and fails the row outright
 * rather than retrying. Anything else throws, and the worker decides whether it
 * is worth another go.
 */
export async function processDocument(
  supabase: Client,
  claimed: QueuedDocument,
): Promise<DocumentOutcome> {
  const { data: document } = await supabase
    .from("documents")
    .select("*")
    .eq("id", claimed.id)
    .maybeSingle();
  if (!document) return { kind: "failed", message: "That document is no longer in the system." };

  try {
    /* ------------------------------------------------- download and hash */
    const file = await downloadDocumentFile(supabase, document);
    let fileHash: string = document.file_hash ?? "";

    if (!fileHash) {
      fileHash = await sha256(file.bytes);

      const { data: twin } = await supabase
        .from("documents")
        .select("id, file_name")
        .eq("household_id", document.household_id)
        .eq("file_hash", fileHash)
        .neq("id", document.id)
        .not("status", "in", "(failed,cancelled,duplicate)")
        .limit(1)
        .maybeSingle();

      if (twin) {
        const message = `This is the same file as ${twin.file_name ?? "one already on file"}, so nothing was read from it again.`;
        await supabase
          .from("documents")
          .update({
            status: "duplicate",
            file_hash: fileHash,
            locked_at: null,
            error_message: message,
            extracted_at: new Date().toISOString(),
          })
          .eq("id", document.id);
        return { kind: "duplicate", message };
      }

      await supabase
        .from("documents")
        .update({ file_hash: fileHash, source_format: file.format })
        .eq("id", document.id);
    }

    /* ------------------------------------------------------ what is it */
    const text = await documentText(file);

    let docType: DocType | null = (document.doc_type as DocType | null) ?? null;
    let confidence = Number(document.type_confidence ?? 0);
    let reason: string = document.type_reason ?? "";
    let detected: DocType | null = (document.detected_type as DocType | null) ?? null;

    // A type already on the row was either confirmed by a person or decided on
    // an earlier attempt. Either way it is not re-litigated at cost.
    if (!docType) {
      const classification = await classifyDocument({
        format: file.format,
        text: text.slice(0, CLASSIFY_SAMPLE),
        fileName: document.file_name,
        hint: (document.type_hint as DocType | null) ?? null,
      });
      detected = classification.type;
      confidence = classification.confidence;
      reason = classification.reason;

      if (!classification.type || classification.confidence < CONFIRM_BELOW) {
        await supabase
          .from("documents")
          .update({
            status: "needs_type",
            detected_type: detected,
            type_confidence: confidence,
            type_reason: reason,
            source_format: file.format,
            locked_at: null,
            error_message: null,
            next_attempt_at: null,
          })
          .eq("id", document.id);
        return { kind: "needs_type", detected, reason };
      }

      docType = classification.type;
    }

    if (docType === "bank_statement") {
      return await handOffToStatements(supabase, document, {
        detected,
        confidence,
        reason,
        format: file.format,
      });
    }

    if (docType === "other") {
      const message =
        "Filed as it is. Nothing on this document maps to a policy, a tenancy or a payslip, so nothing was read from it.";
      await supabase
        .from("documents")
        .update({
          doc_type: "other",
          detected_type: detected,
          type_confidence: confidence,
          type_reason: reason,
          source_format: file.format,
          status: "extracted",
          locked_at: null,
          error_message: null,
          extracted_at: new Date().toISOString(),
        })
        .eq("id", document.id);
      return { kind: "filed", message };
    }

    /* -------------------------------------------------------- extraction */
    const extract = scrubDeep(
      (await extractDocument(docType, text, document.file_name)) as DocumentExtract,
    );


    await supabase
      .from("documents")
      .update({
        doc_type: docType,
        detected_type: detected,
        type_confidence: confidence,
        type_reason: reason,
        source_format: file.format,
        extracted: redactExtracted(extract as unknown as Record<string, unknown>) as any,
        confidence: Number.isFinite((extract as any).confidence)
          ? Math.max(0, Math.min(1, (extract as any).confidence))
          : null,
      })
      .eq("id", document.id);

    /* ----------------------------------------------------------- persist */
    const people = await loadPeople(supabase, document.household_id);
    const input = {
      householdId: document.household_id as string,
      documentId: document.id as string,
      ownerProfileId: (document.owner_profile_id as string | null) ?? null,
      people,
    };

    const persisted =
      docType === "insurance_policy"
        ? await persistInsurance(supabase, input, extract as any)
        : docType === "tenancy"
          ? await persistTenancy(supabase, input, extract as any)
          : await persistPayslip(supabase, input, extract as any);

    const period = periodOf(docType, extract);

    await supabase
      .from("documents")
      .update({
        record_id: persisted.id,
        status: "linked",
        locked_at: null,
        error_message: null,
        period_start: period.start,
        period_end: period.end,
        extracted_at: new Date().toISOString(),
      })
      .eq("id", document.id);

    await releaseDocument(supabase, document.id);

    return {
      kind: "linked",
      docType,
      summary: persisted.summary,
      needsReview: persisted.needsReview,
    };
  } catch (error) {
    // A verdict about the file. Retrying reads the same bytes and reaches the
    // same conclusion, so the row is failed outright and says why.
    if (error instanceof StatementFailure || error instanceof PayslipUnreadable) {
      await failDocument(supabase, document.id, error.message);
      return { kind: "failed", message: error.message };
    }
    throw error;
  }
}

/**
 * A document whose type the household has just confirmed goes back into the
 * queue, with its attempt count reset — the earlier attempts were spent asking
 * the question, not failing to answer it.
 */
export async function confirmDocumentType(
  supabase: Client,
  documentId: string,
  docType: DocType,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({
      doc_type: docType,
      type_reason: `You confirmed this is ${DOC_TYPE_LABELS[docType].toLowerCase()}.`,
      type_confidence: 1,
      status: "queued",
      attempts: 0,
      next_attempt_at: null,
      locked_at: null,
      error_message: null,
    })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
}
