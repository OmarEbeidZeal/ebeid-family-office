import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Merge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountRow } from "@/hooks/useFinancials";
import { useAccountActivity, useMergeAccounts } from "@/hooks/useAccountRepair";
import { accountTypeLabel } from "@/lib/format";

/**
 * Folding one account into another.
 *
 * The dialog states plainly what moves and what disappears, because a merge
 * cannot be undone from the app: transactions, statements, holdings and trades
 * are re-filed, entries the receiving account already holds for the same days
 * are dropped once, and the emptied row goes.
 */
export function MergeAccountsDialog({
  open,
  onOpenChange,
  accounts,
  keepId,
  mergeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountRow[];
  keepId?: string | null;
  mergeId?: string | null;
}) {
  const merge = useMergeAccounts();
  const { data: activity } = useAccountActivity();

  const [keep, setKeep] = useState<string>(keepId ?? "");
  const [absorb, setAbsorb] = useState<string>(mergeId ?? "");

  useEffect(() => {
    if (!open) return;
    setKeep(keepId ?? "");
    setAbsorb(mergeId ?? "");
  }, [open, keepId, mergeId]);

  const keeper = accounts.find((account) => account.id === keep) ?? null;

  /** Only accounts in the same currency can be folded together. */
  const absorbable = useMemo(
    () =>
      accounts.filter(
        (account) => account.id !== keep && (!keeper || account.currency === keeper.currency),
      ),
    [accounts, keep, keeper],
  );

  const source = accounts.find((account) => account.id === absorb) ?? null;
  const sourceActivity = source ? activity?.get(source.id) : undefined;

  const label = (account: AccountRow) =>
    `${account.nickname} · ${accountTypeLabel(account.account_type)} · ${account.currency}`;

  const submit = async () => {
    if (!keep || !absorb) return;
    try {
      const result = await merge.mutateAsync({ sourceId: absorb, targetId: keep });
      const parts = [
        `${result.transactions} transaction${result.transactions === 1 ? "" : "s"}`,
        `${result.statements} statement${result.statements === 1 ? "" : "s"}`,
      ];
      toast.success(`Merged into ${result.keptNickname}`, {
        description: `${parts.join(" and ")} moved${
          result.duplicatesRemoved
            ? `, ${result.duplicatesRemoved} overlapping ${
                result.duplicatesRemoved === 1 ? "entry" : "entries"
              } dropped`
            : ""
        }.${
          result.deactivatedInstead
            ? ` ${result.removedNickname} could not be deleted, so it is marked closed.`
            : ""
        }`,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That merge did not go through.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge two accounts</DialogTitle>
          <DialogDescription>
            Everything on the second account moves to the first. Entries the first already holds for
            the same days are kept once, not twice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="eyebrow text-muted-foreground" htmlFor="merge-keep">
              Keep this account
            </label>
            <Select value={keep} onValueChange={setKeep}>
              <SelectTrigger id="merge-keep">
                <SelectValue placeholder="Choose the account that stays" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {label(account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="eyebrow text-muted-foreground" htmlFor="merge-source">
              Merge this one into it
            </label>
            <Select value={absorb} onValueChange={setAbsorb} disabled={!keep}>
              <SelectTrigger id="merge-source">
                <SelectValue
                  placeholder={keep ? "Choose the account that goes" : "Pick the keeper first"}
                />
              </SelectTrigger>
              <SelectContent>
                {absorbable.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {label(account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {keeper && absorbable.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No other {keeper.currency} account to merge in — a merge never mixes currencies.
              </p>
            )}
          </div>

          {keeper && source && (
            <div className="hairline rounded-lg bg-surface-raised px-4 py-3 text-xs">
              <p className="flex flex-wrap items-center gap-2 text-foreground">
                <span className="truncate">{source.nickname}</span>
                <ArrowRight className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{keeper.nickname}</span>
              </p>
              <p className="mt-2 text-muted-foreground">
                <span className="num">{sourceActivity?.transactions ?? 0}</span> transaction
                {(sourceActivity?.transactions ?? 0) === 1 ? "" : "s"} and{" "}
                <span className="num">{sourceActivity?.statements ?? 0}</span> statement
                {(sourceActivity?.statements ?? 0) === 1 ? "" : "s"} move across.{" "}
                {source.nickname} is then removed. This cannot be undone.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!keep || !absorb || merge.isPending}>
            <Merge className="size-3.5" />
            {merge.isPending ? "Merging…" : "Merge accounts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
