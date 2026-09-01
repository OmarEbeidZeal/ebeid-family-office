import { useState } from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/forms/FormField";
import {
  useCancelDocument,
  useConfirmDocumentType,
  useDeleteDocument,
  useOpenDocument,
  useRetryDocument,
  type DocumentRow as Row,
} from "@/hooks/useDocuments";
import { useCancelStatement, useRetryStatement } from "@/hooks/useImports";
import { useOwners } from "@/hooks/useOwners";
import { formatDate } from "@/lib/format";
import {
  DOC_TYPE_BLURB,
  DOC_TYPE_LABELS,
  DOC_TYPES,
  type DocType,
} from "@/lib/documents/types";
import { documentOutcome, TONE_CLASS, type DocumentOutcomeView } from "@/lib/documents/outcome";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof FileText> = {
  insurance_policy: ShieldCheck,
  tenancy: FileText,
  payslip: Receipt,
  bank_statement: Receipt,
  other: FileText,
};

/**
 * One document on the shelf: what it is, what came out of it, and the two or
 * three things that can still be done to it.
 *
 * When the reader could not tell what a file was, the question is asked here
 * rather than in a modal — the answer is one click away from the file it is
 * about, and it is recorded as a hint so a re-read never overrides it.
 *
 * A statement's row reports the statement queue's outcome, not the hand-off, so
 * a file that failed to parse never sits here claiming it was imported.
 */
export function DocumentRow({
  document,
  detail,
  outcome,
  onOpenRecord,
}: {
  document: Row;
  /** What the reader produced, in one line. Computed by the page. */
  detail?: string | null;
  /** The real state of the file, statement queue included. Computed by the page. */
  outcome?: DocumentOutcomeView;
  onOpenRecord?: (document: Row) => void;
}) {
  const confirm = useConfirmDocumentType();
  const retry = useRetryDocument();
  const retryStatement = useRetryStatement();
  const cancel = useCancelDocument();
  const cancelStatement = useCancelStatement();
  const remove = useDeleteDocument();
  const open = useOpenDocument();
  const { options, nameOf } = useOwners();

  const suggested = (document.detected_type ?? "") as DocType | "";
  const [chosen, setChosen] = useState<string>(suggested);
  const [person, setPerson] = useState<string>(document.owner_profile_id ?? "");

  const type = (document.doc_type ?? document.type_hint ?? document.detected_type) as
    | DocType
    | null;
  const Icon = ICONS[type ?? "other"] ?? FileText;
  const state = outcome ?? documentOutcome(document, null);

  const facts = [
    type ? DOC_TYPE_LABELS[type] : null,
    document.owner_profile_id ? nameOf(document.owner_profile_id) : null,
    document.period_start && document.period_end
      ? `${formatDate(document.period_start, "short")} – ${formatDate(document.period_end, "short")}`
      : (document.period_end ?? document.period_start)
        ? formatDate(document.period_end ?? document.period_start, "short")
        : null,
    detail ?? null,
  ].filter(Boolean);

  const onStatement = Boolean(document.statement_id);
  const asking = document.status === "needs_type" && !onStatement;
  const busy = retry.isPending || retryStatement.isPending;

  const doRetry = () =>
    (state.retry === "statement" && document.statement_id
      ? retryStatement.mutateAsync(document.statement_id)
      : retry.mutateAsync(document.id)
    )
      .then(() => toast.success("Back in the queue"))
      .catch((error: Error) => toast.error(error.message));

  const doCancel = () =>
    (onStatement && document.statement_id
      ? cancelStatement.mutateAsync(document.statement_id)
      : cancel.mutateAsync(document.id)
    )
      .then(() => toast.success("Stopped"))
      .catch((error: Error) => toast.error(error.message));


  return (
    <li className="border-b border-border px-3 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-muted-foreground">
          <Icon className="size-3.5" strokeWidth={1.5} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-foreground">{document.file_name ?? "Document"}</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {facts.length ? facts.join(" · ") : "Not read yet"}
          </p>
          {state.message && (
            <p
              className={cn(
                "mt-0.5 text-[0.7rem] leading-relaxed",
                state.tone === "loss" || state.tone === "warn"
                  ? TONE_CLASS[state.tone]
                  : "text-muted-foreground",
              )}
            >
              {state.message}
            </p>
          )}
          {!state.message && asking && document.type_reason && (
            <p className="mt-0.5 text-[0.7rem] leading-relaxed text-warn">{document.type_reason}</p>
          )}
        </div>

        <span
          className={cn("flex shrink-0 items-center gap-1.5 text-[0.7rem]", TONE_CLASS[state.tone])}
        >
          {state.spin && <Loader2 className="size-3 animate-spin" />}
          {state.label}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {(document.record_id || onStatement) && onOpenRecord && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem]"
              onClick={() => onOpenRecord(document)}
            >
              {state.needsYou && onStatement ? "Sort it out" : "Open"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label={`View ${document.file_name ?? "document"}`}
            disabled={open.isPending}
            onClick={() =>
              open
                .mutateAsync(document.id)
                .catch((error: Error) => toast.error(error.message))
            }
          >
            <ExternalLink className="size-3.5" />
          </Button>
          {state.retry && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem]"
              disabled={busy}
              onClick={() => void doRetry()}
            >
              <RotateCcw className="size-3" /> Retry
            </Button>
          )}
          {state.cancellable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Stop reading this document"
              disabled={cancel.isPending || cancelStatement.isPending}
              onClick={() => void doCancel()}
            >
              <X className="size-3.5" />
            </Button>
          )}
          {state.removable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-loss"
              aria-label="Remove this file"
              disabled={remove.isPending}
              onClick={() =>
                remove
                  .mutateAsync(document.id)
                  .then(() =>
                    toast.success("File removed", {
                      description:
                        "What it produced stays — remove that on its own screen if you meant to.",
                    }),
                  )
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>

      </div>

      {asking && (
        <div className="mt-2 space-y-2 pl-10">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-48 flex-1">
              <SelectNative
                value={chosen}
                onChange={setChosen}
                options={[
                  { value: "", label: "What is this?" },
                  ...DOC_TYPES.map((value) => ({ value, label: DOC_TYPE_LABELS[value] })),
                ]}
              />
            </div>
            <div className="min-w-40 flex-1">
              <SelectNative
                value={person}
                onChange={setPerson}
                options={[
                  { value: "", label: "Whose is it? (optional)" },
                  ...options.filter((option) => option.value !== "joint"),
                ]}
              />
            </div>
            <Button
              size="sm"
              className="min-h-9"
              disabled={!chosen || confirm.isPending}
              onClick={() =>
                confirm
                  .mutateAsync({
                    documentId: document.id,
                    docType: chosen as DocType,
                    ownerProfileId: person || null,
                  })
                  .then(() => toast.success("Reading it now"))
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              Read it
            </Button>
          </div>
          {chosen && (
            <p className="text-[0.7rem] text-muted-foreground">
              {DOC_TYPE_BLURB[chosen as DocType]}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
