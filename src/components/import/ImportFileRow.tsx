import { useState } from "react";
import { ArrowLeftRight, Check, Eraser, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { BankMark } from "@/components/BankMark";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SelectNative } from "@/components/forms/FormField";
import {
  useAssignStatementAccount,
  useCancelStatement,
  useReimportStatement,
  useRetryStatement,
  type ImportStatementRow,
  type StatementSummary,
} from "@/hooks/useImports";
import { useRefileStatement } from "@/hooks/useAccountRepair";
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

/** The disagreements recorded against a file, as plain sentences. */
function conflictsOf(summary: StatementSummary | null): StatementConflict[] {
  return (summary?.conflicts ?? []).filter(
    (entry): entry is StatementConflict =>
      Boolean(entry) && typeof entry.message === "string" && entry.message.trim().length > 0,
  );
}

/**
 * The reader's own notes about a file, as a sentence. Kept honest: it says how
 * the file was read, which model was involved if any, and repeats anything the
 * reader flagged.
 *
 * Disagreements between documents are left out — they are too important to be
 * truncated into a tail, so they get their own lines below.
 */
function summaryLine(statement: ImportStatementRow, summary: StatementSummary | null) {
  const parts: string[] = [];

  const note = formatNote(statement.source_format);
  if (note) parts.push(note);

  const spokenFor = new Set(conflictsOf(summary).map((conflict) => conflict.message));
  const notes = [...(summary?.notes ?? []), ...(summary?.extraction_notes ?? [])].filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0 && !spokenFor.has(entry),
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
  const reimport = useReimportStatement();
  const cancel = useCancelStatement();
  const assign = useAssignStatementAccount();
  const refile = useRefileStatement();
  const [chosen, setChosen] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [confirmingReimport, setConfirmingReimport] = useState(false);



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
  const conflicts = conflictsOf(statement.summary);

  const retryable = ["failed", "cancelled"].includes(statement.status);
  // A file that read fine can still be worth reading again: the reader learns
  // formats, and a second pass fills in what the first one dropped — a running
  // balance, a bank the file never named. Lines already imported are recognised
  // and left alone, so nothing is imported twice.
  const rereadable = ["imported", "parsed", "needs_review", "duplicate", "awaiting_account"].includes(
    statement.status,
  );
  const cancellable = ["queued", "extracting", "awaiting_account", "failed"].includes(
    statement.status,
  );
  const reviewable = ["imported", "parsed", "needs_review"].includes(statement.status);

  // Reading again fills gaps; starting over throws the reading away. That is the
  // right move only when the file was understood as the wrong thing — a credit
  // line read as a current account, two banks pooled into one — because no
  // amount of filling gaps corrects rows that should never have been written.
  const restartable = ["imported", "parsed", "needs_review", "duplicate", "awaiting_account"].includes(
    statement.status,
  );

  // Once a file is filed, it can still be filed wrongly — a statement that names
  // no bank lands on whatever account the pipeline could match. Moving it takes
  // its transactions and its closing balance with it.
  const movable =
    !!statement.account_id &&
    ["imported", "parsed", "needs_review", "duplicate"].includes(statement.status) &&
    accounts.length > 1;
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
          {conflicts.map((conflict, index) => (
            <p
              key={`${conflict.kind ?? "conflict"}-${index}`}
              className="mt-1.5 border-l-2 border-warn/50 pl-2 text-[0.7rem] leading-relaxed text-warn"
            >
              {conflict.message}
            </p>
          ))}
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
          {movable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem] text-muted-foreground"
              onClick={() => {
                setMoving((open) => !open);
                setMoveTo("");
              }}
            >
              <ArrowLeftRight className="size-3" /> Move
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
          {rereadable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem] text-muted-foreground"
              disabled={retry.isPending}
              title="Read the file again. Lines already imported are left as they are."
              onClick={() =>
                retry
                  .mutateAsync(statement.id)
                  .then(() => toast.success("Reading it again", { description: "Lines already imported stay as they are." }))
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              <RotateCcw className="size-3" /> Read again
            </Button>
          )}
          {restartable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[0.7rem] text-muted-foreground"
              disabled={reimport.isPending}
              title="Throw away everything this file imported and read it from nothing."
              onClick={() => setConfirmingReimport(true)}
            >
              {reimport.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Eraser className="size-3" />
              )}{" "}
              Start over
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

      {movable && moving && (
        <div className="mt-2 space-y-2 rounded-md border border-border bg-surface-sunken/60 p-2.5 sm:ml-9">
          <p className="text-[0.7rem] text-muted-foreground">
            Move this statement, its{" "}
            <span className="num">{statement.transaction_count ?? 0}</span> transaction
            {statement.transaction_count === 1 ? "" : "s"} and its closing balance to another
            account. Transactions the other account already holds are not duplicated, and both
            balances are worked out again afterwards.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-48 flex-1">
              <SelectNative
                value={moveTo}
                onChange={setMoveTo}
                options={[
                  { value: "", label: "Move to…" },
                  ...accounts
                    .filter((row) => row.id !== statement.account_id)
                    .map((row) => ({
                      value: row.id,
                      label: `${row.nickname}${row.institution ? ` · ${row.institution}` : ""} · ${row.currency}`,
                    })),
                ]}
              />
            </div>
            <Button
              size="sm"
              className="min-h-9"
              disabled={!moveTo || refile.isPending}
              onClick={() =>
                refile
                  .mutateAsync({ statementId: statement.id, accountId: moveTo })
                  .then((result) => {
                    setMoving(false);
                    setMoveTo("");
                    toast.success(
                      `Moved to ${result.accountNickname} — ${result.transactions} transaction${
                        result.transactions === 1 ? "" : "s"
                      } refiled` +
                        (result.duplicatesRemoved
                          ? `, ${result.duplicatesRemoved} already held there`
                          : ""),
                    );
                  })

                  .catch((error: Error) => toast.error(error.message))
              }
            >
              {refile.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Move it
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmingReimport} onOpenChange={setConfirmingReimport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over with {statement.file_name ?? "this file"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The{" "}
              <span className="num">{statement.transaction_count ?? 0}</span> transaction
              {statement.transaction_count === 1 ? "" : "s"} this file imported are removed, along
              with any categories or notes added to them by hand, and the file goes back to the
              queue to be read from nothing — including which account it belongs to. Nothing any
              other file imported is touched. Use this when the file was read as the wrong kind of
              account; to fill in gaps, use Read again instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it as it is</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                reimport
                  .mutateAsync(statement.id)
                  .then((result) => {
                    const undone = [
                      result.removed
                        ? `${result.removed} transaction${result.removed === 1 ? "" : "s"}`
                        : null,
                      result.trades ? `${result.trades} order${result.trades === 1 ? "" : "s"}` : null,
                    ].filter(Boolean);
                    toast.success("Reading it from nothing", {
                      description: undone.length
                        ? `${undone.join(" and ")} removed${
                            result.accountNickname ? ` from ${result.accountNickname}` : ""
                          }.`
                        : "Nothing had been imported from it yet.",
                    });
                  })
                  .catch((error: Error) => toast.error(error.message))
              }
            >
              Start over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>

  );
}
