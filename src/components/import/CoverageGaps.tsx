import { CalendarX2 } from "lucide-react";
import { BankMark } from "@/components/BankMark";
import { SectionHeader } from "@/components/SectionHeader";
import { coverageGaps, monthLabel } from "@/lib/import/coverage";
import type { ImportStatementRow } from "@/hooks/useImports";
import type { AccountRow } from "@/hooks/useFinancials";

/**
 * Months with no statement behind them. Spending totals for those months are
 * incomplete, so the gap is named rather than averaged over.
 */
export function CoverageGaps({
  statements,
  accounts,
}: {
  statements: ImportStatementRow[];
  accounts: AccountRow[];
}) {
  const gaps = coverageGaps(
    statements.map((row) => ({
      accountId: row.account_id,
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
    })),
  ).filter((gap) => accounts.some((account) => account.id === gap.accountId));

  if (!gaps.length) return null;

  return (
    <section>
      <SectionHeader
        title="Missing months"
        description="Every month up to last month should have a statement behind it. These do not, so spending for them is understated until you import them."
      />
      <ul className="hairline space-y-0 rounded-lg bg-surface">
        {gaps.map((gap) => {
          const account = accounts.find((row) => row.id === gap.accountId)!;
          const shown = gap.months.slice(0, 8);
          return (
            <li
              key={gap.accountId}
              className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-3 last:border-0"
            >
              <BankMark institution={account.institution} size={26} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">
                  {account.nickname}
                  {account.institution && (
                    <span className="text-muted-foreground"> · {account.institution}</span>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                  <CalendarX2 className="size-3 text-warn" />
                  {shown.map(monthLabel).join(", ")}
                  {gap.months.length > shown.length && ` +${gap.months.length - shown.length} more`}
                </p>
              </div>
              <span className="num shrink-0 text-[0.7rem] text-warn">
                {gap.months.length} month{gap.months.length === 1 ? "" : "s"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
