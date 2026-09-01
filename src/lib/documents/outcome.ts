/**
 * What actually became of an uploaded file.
 *
 * A bank statement stops being a document the moment it is recognised: the
 * document row is marked `linked` and the statement queue takes over. That is
 * true of the hand-off and useless as a report — a file that later failed to
 * parse, or that is still waiting for an account, kept saying "Imported" on the
 * shelf while the import screen said otherwise. One upload cannot have two
 * answers, so the shelf reads the statement's outcome for those rows.
 *
 * Pure: statuses in, one view out. No I/O, no formatting of money or dates.
 */

export type OutcomeTone = "muted" | "gold" | "warn" | "gain" | "loss";

export type DocumentOutcomeView = {
  /** What to show as the row's state. */
  label: string;
  tone: OutcomeTone;
  /** The state is still moving on its own. */
  spin: boolean;
  /** Somebody has to decide something before this file goes any further. */
  needsYou: boolean;
  /** The queue still has work to do on it. */
  inFlight: boolean;
  /** The reason, when there is one worth reading. */
  message: string | null;
  /** Which record a retry belongs to, if a retry makes sense at all. */
  retry: "document" | "statement" | null;
  /** Whether stopping it is still meaningful. */
  cancellable: boolean;
  /** Whether the file can be removed from the shelf. */
  removable: boolean;
};

type DocumentLike = {
  status: string;
  statement_id?: string | null;
  error_message?: string | null;
};

type StatementLike = {
  status: string;
  error_message?: string | null;
  account_id?: string | null;
};

const DOCUMENT_VIEW: Record<string, Omit<DocumentOutcomeView, "message" | "retry">> = {
  queued: {
    label: "Queued",
    tone: "muted",
    spin: false,
    needsYou: false,
    inFlight: true,
    cancellable: true,
    removable: false,
  },
  extracting: {
    label: "Reading",
    tone: "gold",
    spin: true,
    needsYou: false,
    inFlight: true,
    cancellable: true,
    removable: false,
  },
  needs_type: {
    label: "Confirm the type",
    tone: "warn",
    spin: false,
    needsYou: true,
    inFlight: false,
    cancellable: true,
    removable: false,
  },
  extracted: {
    label: "Read",
    tone: "gain",
    spin: false,
    needsYou: false,
    inFlight: false,
    cancellable: false,
    removable: true,
  },
  linked: {
    label: "Imported",
    tone: "gain",
    spin: false,
    needsYou: false,
    inFlight: false,
    cancellable: false,
    removable: true,
  },
  duplicate: {
    label: "Already on file",
    tone: "muted",
    spin: false,
    needsYou: false,
    inFlight: false,
    cancellable: false,
    removable: true,
  },
  failed: {
    label: "Could not be read",
    tone: "loss",
    spin: false,
    needsYou: true,
    inFlight: false,
    cancellable: true,
    removable: true,
  },
  cancelled: {
    label: "Cancelled",
    tone: "muted",
    spin: false,
    needsYou: false,
    inFlight: false,
    cancellable: false,
    removable: true,
  },
};

/** The statement queue's own vocabulary, said the way the shelf says things. */
const STATEMENT_VIEW: Record<string, Omit<DocumentOutcomeView, "message" | "retry">> = {
  queued: DOCUMENT_VIEW["queued"]!,
  extracting: DOCUMENT_VIEW["extracting"]!,
  parsing: {
    label: "Importing",
    tone: "gold",
    spin: true,
    needsYou: false,
    inFlight: true,
    cancellable: true,
    removable: false,
  },
  awaiting_account: {
    label: "Which account?",
    tone: "warn",
    spin: false,
    needsYou: true,
    inFlight: false,
    cancellable: true,
    removable: false,
  },
  needs_review: {
    label: "Check the balances",
    tone: "warn",
    spin: false,
    needsYou: true,
    inFlight: false,
    cancellable: false,
    removable: false,
  },
  parsed: DOCUMENT_VIEW["linked"]!,
  imported: DOCUMENT_VIEW["linked"]!,
  duplicate: DOCUMENT_VIEW["duplicate"]!,
  failed: DOCUMENT_VIEW["failed"]!,
  cancelled: {
    label: "Not imported",
    tone: "muted",
    spin: false,
    needsYou: false,
    inFlight: false,
    cancellable: false,
    removable: true,
  },
};

const UNKNOWN: Omit<DocumentOutcomeView, "message" | "retry"> = {
  label: "Unknown",
  tone: "muted",
  spin: false,
  needsYou: false,
  inFlight: false,
  cancellable: false,
  removable: true,
};

/**
 * The row's real state. A document that was handed to the statement queue is
 * reported by that queue; everything else reports itself.
 */
export function documentOutcome(
  document: DocumentLike,
  statement?: StatementLike | null,
): DocumentOutcomeView {
  const handedOff = Boolean(document.statement_id) && Boolean(statement);

  if (handedOff && statement) {
    const view = STATEMENT_VIEW[statement.status] ?? UNKNOWN;
    return {
      ...view,
      message: statement.error_message ?? null,
      retry: ["failed", "cancelled"].includes(statement.status) ? "statement" : null,
    };
  }

  // Handed off, but the statement row is not loaded (or was deleted): say the
  // file went to the importer rather than claiming a result nobody has.
  if (document.statement_id) {
    return {
      label: "With the importer",
      tone: "muted",
      spin: false,
      needsYou: false,
      inFlight: false,
      message: document.error_message ?? null,
      retry: null,
      cancellable: false,
      removable: true,
    };
  }

  const view = DOCUMENT_VIEW[document.status] ?? UNKNOWN;
  return {
    ...view,
    message: document.error_message ?? null,
    retry: ["failed", "cancelled", "needs_type"].includes(document.status) ? "document" : null,
  };
}

export const TONE_CLASS: Record<OutcomeTone, string> = {
  muted: "text-muted-foreground",
  gold: "text-gold",
  warn: "text-warn",
  gain: "text-gain",
  loss: "text-loss",
};
