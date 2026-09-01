import { useState } from "react";
import { Copy, Merge } from "lucide-react";
import { BankMark } from "@/components/BankMark";
import { Button } from "@/components/ui/button";
import { MergeAccountsDialog } from "@/components/accounts/MergeAccountsDialog";
import type { AccountRow } from "@/hooks/useFinancials";
import { useDuplicateAccounts } from "@/hooks/useAccountRepair";
import { accountTypeLabel } from "@/lib/format";

/**
 * The app split one account in two, so the app says so.
 *
 * A statement that prints no account number cannot be recognised on a second
 * upload, which is how one NatWest current account came to exist twice. Rather
 * than leaving the household to notice a doubled row, the pair is named here
 * with one tap to fold it back together — and never a merge performed for them.
 */
export function DuplicateAccounts({ accounts }: { accounts: AccountRow[] }) {
  const groups = useDuplicateAccounts(accounts);
  const [pair, setPair] = useState<{ keep: string; merge: string } | null>(null);

  if (!groups.length) return null;

  return (
    <section className="hairline rounded-lg bg-surface-raised">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Copy className="size-3.5 text-warn" strokeWidth={1.6} />
        <h2 className="eyebrow text-foreground/70">
          {groups.length === 1 ? "Possible duplicate" : `${groups.length} possible duplicates`}
        </h2>
      </div>

      <div className="divide-y divide-border">
        {groups.map((group) => {
          const [keeper, ...rest] = group.accounts;
          if (!keeper) return null;
          return (
            <div
              key={group.key}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <BankMark
                    institution={keeper.institution}
                    domain={keeper.institution_domain ?? null}
                    size={22}
                    className="hidden shrink-0 sm:flex"
                  />
                  <p className="truncate text-sm text-foreground">
                    {group.accounts.map((account) => account.nickname).join(" · ")}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{group.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keeping{" "}
                  <span className="text-foreground">
                    {keeper.nickname} ({accountTypeLabel(keeper.account_type)})
                  </span>{" "}
                  folds{" "}
                  <span className="num">
                    {rest.reduce((sum, account) => sum + (account.statements ?? 0), 0)}
                  </span>{" "}
                  statement
                  {rest.reduce((sum, account) => sum + (account.statements ?? 0), 0) === 1
                    ? ""
                    : "s"}{" "}
                  into it. Check they really are the same account first.
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setPair({ keep: keeper.id, merge: rest[0]!.id })}
              >
                <Merge className="size-3.5" />
                Review merge
              </Button>
            </div>
          );
        })}
      </div>

      <MergeAccountsDialog
        open={!!pair}
        onOpenChange={(open) => !open && setPair(null)}
        accounts={accounts}
        keepId={pair?.keep ?? null}
        mergeId={pair?.merge ?? null}
      />
    </section>
  );
}
