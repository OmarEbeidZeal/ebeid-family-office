import { CircleDashed } from "lucide-react";
import { BankMark } from "@/components/BankMark";
import { Button } from "@/components/ui/button";
import type { AccountRow } from "@/hooks/useFinancials";
import { accountTypeLabel } from "@/lib/format";

/**
 * Accounts that exist but hold no stated balance.
 *
 * Every one of them is missing from net worth, from the allocation charts and
 * from the advisor's context. That is the honest treatment — a placeholder zero
 * would understate the household's wealth without saying so — but it is only
 * honest if the gap is visible and one tap from being closed.
 */
export function UnstatedBalances({
  accounts,
  onSet,
}: {
  accounts: AccountRow[];
  onSet: (account: AccountRow) => void;
}) {
  if (!accounts.length) return null;

  return (
    <section className="hairline overflow-hidden rounded-lg bg-surface">
      <div className="flex items-start gap-3 border-b border-border bg-warn-soft/40 px-4 py-3">
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.6} />
        <div>
          <h2 className="text-sm text-foreground">
            {accounts.length === 1
              ? "One account has no balance yet"
              : `${accounts.length} accounts have no balance yet`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Their statements were imported, but none carried a closing figure. Until a balance is
            recorded they are left out of net worth rather than counted as nothing.
          </p>
        </div>
      </div>

      {accounts.map((account) => (
        <div
          key={account.id}
          className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
        >
          <BankMark
            institution={account.institution}
            domain={account.institution_domain}
            size={26}
            className="hidden shrink-0 sm:flex"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{account.nickname}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {account.institution ?? "Institution not recorded"}
              <span className="mx-1.5 text-border">·</span>
              {accountTypeLabel(account.account_type)}
              <span className="mx-1.5 text-border">·</span>
              <span className="num">{account.currency}</span>
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onSet(account)}>
            Set balance
          </Button>
        </div>
      ))}
    </section>
  );
}
