import { Link } from "@tanstack/react-router";
import { CalendarX2, FileText, Lock } from "lucide-react";
import { BankMark } from "@/components/BankMark";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { AccountRow } from "@/hooks/useFinancials";
import type { AccountCoverage } from "@/lib/import/coverage";
import { monthLabel } from "@/lib/import/coverage";
import {
  DEBT_ACCOUNT_TYPES,
  accountTypeLabel,
  balanceAgeTone,
  formatDate,
  relativeAge,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One account, with its records made honest: where the balance came from, how
 * many statements stand behind it, and what months are missing.
 */
export function AccountListRow({
  account,
  coverage,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onSelectedChange,
}: {
  account: AccountRow;
  coverage?: AccountCoverage | undefined;
  onEdit: () => void;
  onDelete: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: ((selected: boolean) => void) | undefined;
}) {
  const isDebt = DEBT_ACCOUNT_TYPES.includes(account.account_type);
  // An account discovered from a statement is usually named with its own last
  // four, so the masked identifier is only worth repeating when the name omits it.
  const maskDigits = account.identifier_mask?.replace(/\D/g, "") ?? "";
  const showMask = Boolean(account.identifier_mask) && !account.nickname.includes(maskDigits);

  const fromStatement = account.balance_source === "statement" && !!account.last_balance_update;
  const tone = balanceAgeTone(account.last_balance_update);
  const range =
    coverage?.earliest && coverage.latest
      ? coverage.earliest === coverage.latest
        ? monthLabel(coverage.latest)
        : `${monthLabel(coverage.earliest)} – ${monthLabel(coverage.latest)}`
      : null;

  const provenance = fromStatement ? (
    // The date is the statement's own period end, so read it as written.
    <span>closing balance, {formatDate(account.last_balance_update!.slice(0, 10), "short")}</span>
  ) : (
    <span className={cn(tone === "warn" && "text-warn")}>
      {relativeAge(account.last_balance_update)}
    </span>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border px-4 py-3.5 first:border-t-0 sm:gap-4",
        selected && "bg-gold-soft/40",
      )}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectedChange?.(value === true)}
          aria-label={`Select ${account.nickname}`}
          className="shrink-0"
        />
      )}
      <BankMark
        institution={account.institution}
        domain={account.institution_domain}
        size={28}
        className="hidden shrink-0 sm:flex"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm text-foreground">{account.nickname}</p>
          <Badge variant="outline" className="text-[0.65rem]">
            {accountTypeLabel(account.account_type)}
          </Badge>
          {account.discovered_from === "statement" && (
            <Badge variant="secondary" className="text-[0.65rem]">
              From a statement
            </Badge>
          )}
          {account.visibility === "private" && (
            <Badge variant="outline" className="gap-1 text-[0.65rem]">
              <Lock className="size-2.5" strokeWidth={2} />
              Private
            </Badge>
          )}
          {!account.is_active && (
            <Badge variant="secondary" className="text-[0.65rem]">
              Closed
            </Badge>
          )}
        </div>

        {/* Wraps on a phone rather than truncating: a half-shown provenance
            date is worse than a second line. */}
        <p className="mt-1 text-xs text-muted-foreground sm:truncate">

          {account.institution ?? "Institution not recorded"}
          {showMask ? (
            <>
              <span className="mx-1.5 text-border">·</span>
              <span className="num">••{account.identifier_mask}</span>
            </>
          ) : null}
          <span className="mx-1.5 text-border">·</span>
          {account.balance_statement_id ? (
            <Link
              to="/transactions"
              search={{ statement: account.balance_statement_id } as never}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {provenance}
            </Link>
          ) : (
            provenance
          )}
        </p>

        {coverage && coverage.statements > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.7rem] text-muted-foreground">
            <FileText className="size-3 shrink-0" strokeWidth={1.6} />
            <span>
              <span className="num">{coverage.statements}</span> statement
              {coverage.statements === 1 ? "" : "s"}
            </span>
            {range && (
              <>
                <span className="text-border">·</span>
                <span className="num">{range}</span>
              </>
            )}
            {coverage.missing > 0 && (
              <>
                <span className="text-border">·</span>
                <Link
                  to="/import"
                  hash="coverage"
                  className="inline-flex items-center gap-1 text-warn underline-offset-4 hover:underline"
                >
                  <CalendarX2 className="size-3" strokeWidth={1.6} />
                  <span className="num">{coverage.missing}</span> month
                  {coverage.missing === 1 ? "" : "s"} missing
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <Money
        amount={isDebt ? -Number(account.current_balance) : Number(account.current_balance)}
        currency={account.currency}
        className={cn("shrink-0 text-right text-sm", isDebt && "text-loss")}
      />


      {!selectable && (
      <RowActions
        label={account.nickname}
        onEdit={onEdit}
        onDelete={onDelete}
        deleteDescription="The account and its recorded balance are removed from every total. Transactions linked to it are not deleted."
      />
      )}
    </div>
  );
}
