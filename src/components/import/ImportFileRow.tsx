import { useState } from "react";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { BankMark } from "@/components/BankMark";
import { Button } from "@/components/ui/button";
import { SelectNative } from "@/components/forms/FormField";
import {
  useAssignStatementAccount,
  useCancelStatement,
  useRetryStatement,
  type ImportStatementRow,
  type StatementSummary,
} from "@/hooks/useImports";
import type { AccountRow } from "@/hooks/useFinancials";
import { formatDate } from "@/lib/format";
import { formatLabel, formatNote } from "@/lib/import/formats";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; tone: string; spin?: boolean }> = {
  queued: { label: "Queued", tone: "text-muted-foreground" },
  extracting: { label: "Reading", tone: "text-gold", spin: true },
  parsing: { label: "Importing", tone: "text-gold", spin: true },
  awaiting_account: { label: "Which account?", tone: "text-warn" },
  needs_review: { label: "Check balances", tone: "text-warn" },
  duplicate: { label: "Already on file", tone: "text-muted-foreground" },
  imported: { label: "Imported", tone: "text-gain" },
  parsed: { label: "Imported", tone: "text-gain" },
  failed: { label: "Failed", tone: "text-loss" },
  cancelled: { label: "Not imported", tone: "text-muted-foreground" },
  uploaded: { label: "Waiting", tone: "text-muted-foreground" },
};

/**
 * The reader's own notes about a file, as a sentence. Kept honest: it says how
 * the file was read, which model was involved if any, and repeats anything the
 * reader flagged.
 */
function summaryLine(statement: ImportStatementRow, summary: StatementSummary | null) {
  const parts: string[] = [];

  const note = formatNote(statement.source_format);
  if (note) parts.push(note);

  const notes = [...(summary?.notes ?? []), ...(summary?.extraction_notes ?? [])].filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
  parts.push(...notes);

  if (summary?.skipped_rows) {
    parts.push(`${summary.skipped_rows} row${summary.skipped_rows === 1 ? "" : "s"} unreadable`);
  }

  const by = summary?.categorised_by;
  if (by?.model) parts.push(`Categorised by ${by.model}`);

  return parts.length ? parts.join(" · ") : null;
}

/** One file in the queue, with whatever is known about it so far. */
export function ImportFileRow({
  statement,
  accounts,
  onReview,
}: {
  statement: ImportStatementRow;
  accounts: AccountRow[];
  onReview?: (statement: ImportStatementRow) => void;
}) {
  const retry = useRetryStatement();
  const cancel = useCancelStatement();
  const assign = useAssignStatementAccount();
  const [chosen, setChosen] = useState("");

  const status = STATUS[statement.status] ?? {
    label: statement.status,
    tone: "text-muted-foreground",
  };
  const account = accounts.find((row) => row.id === statement.account_id) ?? null;
  const institution = account?.institution ?? statement.detected_institution ?? null;
  const format = formatLabel(statement.source_format);
  const count = statement.statement_count ?? 1;

  const facts = [
    account?.nickname ??
      (statement.detected_last4 ? `••${statement.detected_last4}` : null) ??
      statement.detected_holder,
    count > 1 ? `Statement ${(statement.statement_index ?? 0) + 1} of ${count}` : null,
    statement.period_start && statement.period_end
      ? `${formatDate(statement.period_start, "short")} – ${formatDate(statement.period_end, "short")}`
      : null,
    statement.transaction_count !== null
      ? `${statement.transaction_count} transaction${statement.transaction_count === 1 ? "" : "s"}`
      : null,
    statement.duplicate_count ? `${statement.duplicate_count} already held` : null,
  ].filter(Boolean);

  const summary = summaryLine(statement, statement.summary);
  const retryable = ["failed", "cancelled"].includes(statement.status);
  const cancellable = ["queued", "extracting", "awaiting_account", "failed"].includes(
    statement.status,
  );
  const reviewable = ["imported", "parsed", "needs_review"].includes(statement.status);
  // A file with no proposal behind it names no bank and carries no account
  // number — QIF, usually. It is answered here, on its own row.
  const needsAccountHere =
    statement.status === "awaiting_account" && !statement.proposal_id && accounts.length > 0;

  return (
    <li className="border-b border-border px-3 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <BankMark
          institution={institution}
          domain={statement.detected_institution_domain}
          size={26}
        />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs text-foreground">
            <span className="truncate">{statement.file_name ?? "Statement"}</span>
            {format && (
              <span className="shrink-0 rounded border border-border px-1.5 py-px text-[0.6rem] tracking-wide text-muted-foreground uppercase">
                {format}
              </span>
            )}
          </p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {facts.length ? facts.join(" · ") : "Not read yet"}
          </p>
          {statement.error_message && (
            <p
              className={cn(
                "mt-0.5 text-[0.7rem] leading-relaxed",
                // Only a real failure reads as a failure. "Already on file" and a
                // stopped file are ordinary outcomes, not red ones.
                statement.status === "failed"
                  ? "text-loss"
                  : statement.status === "needs_review"
                    ? "text-warn"
                    : "text-muted-foreground",
              )}
            >
              {statement.error_message}
            </p>
          )}
          {!statement.error_message && summary && (
            <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">{summary}</p>
          )}
        </div>

        <span className={cn("flex shrink-0 items-center gap-1.5 text-[0.7rem]", status.tone)}>
          {status.spin && <Loader2 className="size-3 animate-spin" />}
          {status.label}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {reviewable && onReview && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem]"
              onClick={() => onReview(statement)}
            >
              Review
            </Button>
          )}
          {retryable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem]"
              disabled={retry.isPending}
              onClick={() =>
                retry
                  .mutateAsync(statement.id)
                  .then(() => toast.success("Back in the queue"))
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              <RotateCcw className="size-3" /> Retry
            </Button>
          )}
          {cancellable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem] text-muted-foreground"
              disabled={cancel.isPending}
              onClick={() =>
                cancel
                  .mutateAsync(statement.id)
                  .then(() => toast.success("Stopped"))
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>

      {needsAccountHere && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
          <div className="min-w-48 flex-1">
            <SelectNative
              value={chosen}
              onChange={setChosen}
              options={[
                { value: "", label: "Choose the account…" },
                ...accounts.map((row) => ({
                  value: row.id,
                  label: `${row.nickname}${row.institution ? ` · ${row.institution}` : ""} · ${row.currency}`,
                })),
              ]}
            />
          </div>
          <Button
            size="sm"
            className="min-h-9"
            disabled={!chosen || assign.isPending}
            onClick={() =>
              assign
                .mutateAsync({ statementId: statement.id, accountId: chosen })
                .then(() => toast.success("Filed — reading it now"))
                .catch((error: Error) => toast.error(error.message))
            }
          >
            <Check className="size-3.5" /> Use this account
          </Button>
        </div>
      )}
    </li>
  );
}
