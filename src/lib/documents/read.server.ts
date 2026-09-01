/**
 * Turning an uploaded file into text the reader can work with.
 *
 * Same detection as the statement importer — the file itself decides what it
 * is, never the extension — with one addition that matters here: the text is
 * scrubbed of National Insurance numbers the moment it exists, before any of
 * it is classified, extracted or sent anywhere.
 */
import { StatementFailure } from "../import/failure";
import type { SourceFormat } from "../import/formats";
import { digitsLostPdfMessage, unreadablePdfMessage } from "../import/pdf-guidance";
import { sniffFormat } from "../import/sniff.server";
import {
  SCANNED_PDF_MESSAGE,
  decodeText,
  digitsLost,
  extractPdfText,
  looksScanned,
  looksUnmapped,
  parseDelimitedRows,
  parseWorkbookRows,
} from "../statement-parse.server";

import { stripNationalInsurance } from "./redact";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type LoadedDocument = {
  bytes: Uint8Array;
  format: SourceFormat;
  /** The decoded body for text formats; null for PDF and workbooks. */
  text: string | null;
};

export type DocumentSource = {
  storage_bucket?: string | null;
  file_path: string;
  file_name?: string | null;
};

export async function downloadDocumentFile(
  supabase: Client,
  document: DocumentSource,
): Promise<LoadedDocument> {
  const bucket = document.storage_bucket ?? "documents";
  const { data: file, error } = await supabase.storage.from(bucket).download(document.file_path);
  if (error || !file) {
    throw new StatementFailure(
      "The uploaded file could not be read back from storage. Upload it again.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = document.file_name ?? document.file_path;

  if (/\.(docx?|pages|rtf|odt)$/i.test(name)) {
    throw new StatementFailure(
      "Word documents cannot be read. Save the file as a PDF and upload that instead.",
    );
  }

  const sniffed = sniffFormat(bytes, name, (file as any).type);
  if (!sniffed) {
    throw new StatementFailure(
      "This file does not read as anything the reader knows. PDF is the safest choice for a policy, a tenancy agreement or a payslip.",
    );
  }
  return { format: sniffed.format, bytes, text: sniffed.text };
}

/** Roughly the first two pages — enough to say what a document is. */
export const CLASSIFY_SAMPLE = 8_000;
/** Head and tail budgets when a document is longer than one extraction can hold. */
const HEAD_BUDGET = 44_000;
const TAIL_BUDGET = 16_000;

function collapse(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The document as readable text, already stripped of National Insurance
 * numbers. Long documents keep their head and their tail — a tenancy
 * agreement puts the rent on page one and the break clause on page nine.
 */
export async function documentText(file: LoadedDocument): Promise<string> {
  let body: string;

  switch (file.format) {
    case "pdf": {
      const pdf = await extractPdfText(file.bytes);
      if (looksScanned(pdf)) throw new StatementFailure(SCANNED_PDF_MESSAGE);
      if (digitsLost(pdf)) throw new StatementFailure(digitsLostPdfMessage(pdf.text, "document"));
      if (looksUnmapped(pdf)) throw new StatementFailure(unreadablePdfMessage(pdf.text, "document"));
      body = pdf.text;
      break;
    }


    case "xlsx": {
      const rows = await parseWorkbookRows(file.bytes);
      body = rows.map((row) => row.map((cell) => (cell ?? "").trim()).join("\t")).join("\n");
      break;
    }
    case "csv": {
      const raw = file.text ?? decodeText(file.bytes);
      const rows = await parseDelimitedRows(raw);
      body = rows.length
        ? rows.map((row) => row.map((cell) => (cell ?? "").trim()).join("\t")).join("\n")
        : raw;
      break;
    }
    default:
      body = file.text ?? decodeText(file.bytes);
  }

  const clean = stripNationalInsurance(collapse(body));
  if (clean.length <= HEAD_BUDGET + TAIL_BUDGET) return clean;

  return [
    clean.slice(0, HEAD_BUDGET),
    "\n\n[… middle of the document omitted for length …]\n\n",
    clean.slice(-TAIL_BUDGET),
  ].join("");
}
