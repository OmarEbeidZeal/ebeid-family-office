import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, ListChecks, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BankMark } from "@/components/BankMark";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { useDeleteDocument, usePumpQueue, useRetryStatement } from "@/hooks/useImports";
import { useStatements, type StatementRow } from "@/hooks/useTransactions";
import type { AccountRow } from "@/hooks/useFinancials";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "Queued", tone: "text-muted-foreground border-border" },
  uploaded: { label: "Waiting", tone: "text-muted-foreground border-border" },
  extracting: { label: "Reading", tone: "text-gold border-gold-line" },
  parsing: { label: "Importing", tone: "text-gold border-gold-line" },
  awaiting_account: { label: "Which account?", tone: "text-warn border-warn/40" },
  imported: { label: "Imported", tone: "text-gain border-gain/40" },
  parsed: { label: "Imported", tone: "text-gain border-gain/40" },
  needs_review: { label: "Needs review", tone: "text-warn border-warn/40" },
  duplicate: { label: "Already on file", tone: "text-muted-foreground border-border" },
  cancelled: { label: "Not imported", tone: "text-muted-foreground border-border" },
  failed: { label: "Failed", tone: "text-loss border-loss/40" },
};

export function StatementsPanel({
  accounts,
  onImport,
  onReview,
}: {
  accounts: AccountRow[];
  onImport: () => void;
  onReview: (statement: StatementRow) => void;
}) {
  const { data: statements = [], isLoading } = useStatements();
  const queryClient = useQueryClient();
  const retryStatement = useRetryStatement();
  const pump = usePumpQueue();
  const [busy, setBusy] = useState<string | null>(null);

  const accountName = (id: string | null) =>
    accounts.find((account) => account.id === id)?.nickname ?? "Not linked to an account yet";

  const accountFor = (id: string | null) => accounts.find((account) => account.id === id) ?? null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["statements"] });
    void queryClient.invalidateQueries({ queryKey: ["import-statements"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  /** Re-reading puts the file back in the queue; the worker does the reading. */
  const retry = async (statement: StatementRow) => {
    setBusy(statement.id);
    try {
      await retryStatement.mutateAsync(statement.id);
      toast.success("Back in the queue", {
        description: "It will be read within a few minutes, or sooner while this tab is open.",
      });
      await pump.mutateAsync(2).catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue that statement.");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const deleteDocument = useDeleteDocument();

  /**
   * Removing an import means removing everything it wrote. Done on the server:
   * the browser deleted the transactions and the file and left the orders, the
   * cached reading and the account's stated balance in place.
   */
  const remove = async (statement: StatementRow) => {
    const confirmed = window.confirm(
      `Remove "${statement.file_name ?? "this statement"}", the ${statement.transaction_count ?? 0} transactions it imported, and any orders it recorded? The account's balance is restated from the statements that remain.`,
    );
    if (!confirmed) return;
    setBusy(statement.id);
    try {
      const result = await deleteDocument.mutateAsync(statement.id);
      toast.success(`${result.fileName ?? "That document"} and its data are gone`, {
        description: result.accountRemoved
          ? "The account it created went with it, since no other statement mentions it."
          : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that import.");
    } finally {
      setBusy(null);
      refresh();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!statements.length) {
    return (
      <EmptyState
        icon={<FileText className="size-4" />}
        title="No statements imported yet"
        body="Drag in a PDF or CSV from any of your banks — UK, Egyptian, Jordanian or US. You don't need to say which account: each file is read on the server, matched to the right account by its masked identifier, and turned into dated, categorised transactions."
        action={<Button onClick={onImport}>Import statements</Button>}
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {statements.map((statement) => {
        const status = STATUS[statement.status] ?? STATUS["uploaded"]!;
        const isBusy = busy === statement.id;
        const account = accountFor(statement.account_id);
        return (
          <li key={statement.id} className="flex flex-wrap items-start gap-3 py-3">
            <BankMark institution={account?.institution} size={26} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm">{statement.file_name ?? "Statement"}</p>
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-px text-[0.6rem] uppercase tracking-wider",
                    status.tone,
                  )}
                >
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {accountName(statement.account_id)}
                {statement.period_start && statement.period_end && (
                  <>
                    {" · "}
                    <span className="num">
                      {formatDate(statement.period_start, "short")} –{" "}
                      {formatDate(statement.period_end, "short")}
                    </span>
                  </>
                )}
                {statement.transaction_count !== null && (
                  <>
                    {" · "}
                    <span className="num">{statement.transaction_count}</span>{" "}
                    {statement.transaction_count === 1 ? "row held" : "rows held"}
                  </>
                )}
                {!!statement.duplicate_count && (
                  <>
                    {" · "}
                    <span className="num">{statement.duplicate_count}</span> skipped as duplicates
                  </>
                )}
              </p>

              {statement.discrepancy !== null && Math.abs(statement.discrepancy) > 0.01 && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-warn">
                  <AlertTriangle className="size-3 shrink-0" />
                  The statement's own opening balance plus its movement misses its closing balance
                  by{" "}
                  <Money
                    amount={Math.abs(statement.discrepancy)}
                    currency={statement.currency ?? "GBP"}
                    hideConverted
                    className="text-xs text-warn"
                  />
                  — a row was probably unreadable. Check the imported rows against the file.
                </p>
              )}

              {statement.error_message && (
                <p
                  className={cn(
                    "mt-1 text-xs",
                    statement.status === "failed" ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {statement.error_message}
                </p>
              )}

              {/* Two documents that disagree: both figures, both files, no verdict. */}
              {(statement.summary?.conflicts ?? [])
                .filter((conflict) => typeof conflict?.message === "string" && conflict.message)
                .map((conflict, index) => (
                  <p
                    key={`${conflict.kind ?? "conflict"}-${index}`}
                    className="mt-1.5 flex gap-1.5 border-l-2 border-warn/50 pl-2 text-xs leading-relaxed text-warn"
                  >
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <span>{conflict.message}</span>
                  </p>
                ))}

            </div>

            <div className="flex items-center gap-1">
              {!!statement.transaction_count && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[0.7rem]"
                  onClick={() => onReview(statement)}
                >
                  <ListChecks className="size-3" />
                  Review rows
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[0.7rem]"
                disabled={isBusy}
                onClick={() => void retry(statement)}
              >
                {isBusy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Re-read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove import"
                className="h-7 px-2 text-muted-foreground hover:text-loss"
                disabled={isBusy}
                onClick={() => void remove(statement)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
