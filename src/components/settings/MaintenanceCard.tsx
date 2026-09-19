import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { SettingsCard } from "./SettingsCard";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useReprocessAll, useReprocessPreview } from "@/hooks/useImports";
import { useAuth } from "@/hooks/useAuth";

/** One line per thing that goes, with the figure counted now rather than guessed. */
function Count({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-foreground">{value.toLocaleString("en-GB")}</span>
    </li>
  );
}

/**
 * Reading every document again.
 *
 * The readers have been corrected repeatedly since the first import, so the
 * figures on file were produced by code that no longer exists. The files are all
 * still here, which means nothing needs re-uploading — but everything the old
 * readers concluded, including the cached readings beside each file, has to go
 * first or the same wrong answers come straight back.
 */
export function MaintenanceCard() {
  const { isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const preview = useReprocessPreview(open);
  const run = useReprocessAll();

  if (!isOwner) return null;

  const counts = preview.data;

  const start = async () => {
    try {
      const result = await run.mutateAsync();
      setOpen(false);
      toast.success("Every document is being read again", { description: result.message });
    } catch (error) {
      toast.error("That could not be started", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  return (
    <SettingsCard
      title="Read every document again"
      description="Clears everything the importer produced — transactions, orders, discovered accounts, proposals and cached readings — and puts every file you have uploaded back in the queue. Your own records are never touched: assets, liabilities, goals, income, categories, rules, mandates and people all stay exactly as they are. Nothing needs re-uploading."
      action={
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <RotateCcw className="mr-1.5 size-3.5" />
          Read everything again
        </Button>
      }
    >
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Read every document again?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview.isLoading
                ? "Counting exactly what this removes…"
                : counts?.blocked
                  ? counts.blocked
                  : "This is what will be deleted before your files are read again. Every file stays where it is."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {preview.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : counts ? (
            <ul className="space-y-1.5 text-xs">
              <Count label="Transactions from statements" value={counts.transactions} />
              <Count label="Orders (buys, sells, dividends)" value={counts.trades} />
              <Count label="Positions with no orders left" value={counts.holdings} />
              <Count label="Accounts discovered from files" value={counts.accounts} />
              <Count label="Accounts waiting to be confirmed" value={counts.proposals} />
              <Count label="Saved account identifiers" value={counts.identifiers} />
              <Count label="Advisor notes" value={counts.advisorNotes} />
              <Count label="Empty net-worth snapshots" value={counts.emptySnapshots} />
              <Count label="Duplicate uploads" value={counts.duplicates} />
              <Count label="Files going back in the queue" value={counts.statements} />
            </ul>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Leave it alone</AlertDialogCancel>
            <AlertDialogAction
              disabled={!counts || Boolean(counts.blocked) || run.isPending}
              onClick={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              {run.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              {counts?.blocked ? "Cannot run yet" : "Delete and read again"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
