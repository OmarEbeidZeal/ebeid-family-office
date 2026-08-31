/**
 * The formats a statement can arrive in, ranked by how much they actually
 * tell us.
 *
 * The distinction that matters is whether the file states its own structure.
 * CAMT.053, MT940 and QIF do: every field is where the specification says it
 * is, so they are read by code alone and no model ever sees them. CSV, Excel
 * and PDF do not, so their structure has to be inferred — reliably, but never
 * with the certainty of a schema.
 *
 * This module is shared by the reader and the import screen, so it holds no
 * server-only code.
 */

export type SourceFormat = "camt053" | "mt940" | "qif" | "csv" | "xlsx" | "pdf";

/** Formats parsed by code alone, with no model involved in extraction. */
export const DETERMINISTIC_FORMATS = new Set<SourceFormat>(["camt053", "mt940", "qif"]);

/** Formats whose balances must reconcile to the penny. */
export const EXACT_BALANCE_FORMATS = new Set<SourceFormat>(["camt053", "mt940"]);

export const FORMAT_LABELS: Record<SourceFormat, string> = {
  camt053: "CAMT.053",
  mt940: "MT940",
  qif: "QIF",
  csv: "CSV",
  xlsx: "Excel",
  pdf: "PDF",
};

export function formatLabel(format: string | null | undefined): string | null {
  if (!format) return null;
  return FORMAT_LABELS[format as SourceFormat] ?? null;
}

/** One line on how a format was read, for the file row in the import list. */
export function formatNote(format: string | null | undefined): string | null {
  switch (format) {
    case "camt053":
      return "Read from the file's own schema — nothing inferred";
    case "mt940":
      return "Read from the file's own tags — nothing inferred";
    case "qif":
      return "Read from the file's own fields — no balances to check against";
    case "csv":
    case "xlsx":
      return "Columns inferred from the file";
    case "pdf":
      return "Read from the PDF text layer";
    default:
      return null;
  }
}

export type FormatGuideEntry = {
  id: string;
  /** What the bank calls it in its export menu. */
  name: string;
  verdict: string;
  why: string;
  formats: SourceFormat[];
};

/**
 * What to export, best first. Worth saying plainly: choosing CAMT.053 over PDF
 * is the difference between an exact ledger and a careful reconstruction.
 */
export const FORMAT_GUIDE: FormatGuideEntry[] = [
  {
    id: "camt053",
    name: "CAMT.053 (XML)",
    verdict: "Best",
    why: "Exact balances, account identified automatically, nothing inferred.",
    formats: ["camt053"],
  },
  {
    id: "mt940",
    name: "MT940",
    verdict: "Very good",
    why: "Exact amounts and balances, less merchant detail.",
    formats: ["mt940"],
  },
  {
    id: "tabular",
    name: "CSV / XLSX",
    verdict: "Good",
    why: "Reliable amounts, but the account and column meanings are inferred.",
    formats: ["csv", "xlsx"],
  },
  {
    id: "qif",
    name: "QIF",
    verdict: "Workable",
    why: "No balances to check against, and you'll need to pick the account.",
    formats: ["qif"],
  },
  {
    id: "pdf",
    name: "PDF",
    verdict: "Last resort",
    why: "Slowest and least reliable — use only if your bank offers nothing else.",
    formats: ["pdf"],
  },
];

/** Everything the dropzone accepts. Detection is by content, not extension. */
export const UPLOAD_ACCEPT =
  ".xml,.camt,.sta,.mt940,.940,.txt,.qif,.csv,.tsv,.pdf,.xls,.xlsx,.xlsm";
