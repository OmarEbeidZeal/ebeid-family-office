import { Scale } from "lucide-react";
import { formatMoney, formatPercent } from "@/lib/format";
import type { AccountReconciliation } from "@/lib/portfolio";
import type { AccountRow } from "@/hooks/useFinancials";

/**
 * Recorded balances stay authoritative for net worth. When priced holdings
 * disagree with the account they sit in, the gap is shown rather than quietly
 * reconciled — holdings are detail inside an account, not a second asset.
 */
export function ReconciliationPanel({
  rows,
  accounts,
  base,
}: {
  rows: AccountReconciliation[];
  accounts: AccountRow[];
  base: string;
}) {
  const material = rows.filter(
    (row) => Math.abs(row.differenceBase) > 250 && (row.differencePct ?? 0) !== 0,
  );
  if (!material.length) return null;

  return (
    <section className="rounded-lg border border-warn/35 bg-warn-soft/50 p-5">
      <div className="flex items-start gap-3">
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0">
          <p className="text-sm text-warn">Holdings and account balances disagree</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Net worth is built from the balances you record on each account, so these positions are
            not double-counted. Where the market value of the holdings differs from the recorded
            balance, one of the two is out of date.
          </p>

          <ul className="mt-3 space-y-2">
            {material.map((row) => {
              const account = accounts.find((entry) => entry.id === row.accountId);
              return (
                <li
                  key={row.accountId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-border bg-surface px-3.5 py-2.5"
                >
                  <span className="text-sm text-foreground/90">
                    {account?.nickname ?? "Account"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {account?.institution}
                    </span>
                  </span>
                  <span className="num text-xs text-muted-foreground">
                    holdings {formatMoney(row.pricedValueBase, base, { decimals: 0 })} · balance{" "}
                    {formatMoney(row.recordedBalanceBase, base, { decimals: 0 })} ·{" "}
                    <span className={row.differenceBase > 0 ? "text-gain" : "text-loss"}>
                      {formatMoney(row.differenceBase, base, { decimals: 0 })}
                      {row.differencePct !== null && ` (${formatPercent(row.differencePct)})`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {material.some((row) => row.unpricedInAccount > 0) && (
            <p className="mt-2 text-[0.7rem] text-muted-foreground">
              Unpriced holdings in these accounts are excluded from the comparison.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
