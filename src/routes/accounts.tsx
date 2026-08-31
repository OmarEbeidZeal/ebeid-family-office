import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUp, MoreHorizontal, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AccountListRow } from "@/components/accounts/AccountListRow";
import { AccountsEmptyState } from "@/components/accounts/AccountsEmptyState";
import { PendingAccounts } from "@/components/accounts/PendingAccounts";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSheet } from "@/components/forms/AccountSheet";
import { useAccounts, type AccountRow } from "@/hooks/useFinancials";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { useScope } from "@/hooks/useScope";
import { useStatementCoverage } from "@/hooks/useImports";
import { useQuickAdd } from "@/lib/quick-add";
import { accountCoverage } from "@/lib/import/coverage";
import { DEBT_ACCOUNT_TYPES, countryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Every bank, savings, ISA, SIPP, GIA and crypto account across the UK, Egypt, Jordan and the US, read from imported statements and converted to sterling.",
      },
      { property: "og:title", content: "Accounts — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Household accounts discovered from statements, grouped by owner and country, with statement coverage on every row.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

type Group = {
  key: string;
  label: string;
  countries: { code: string; accounts: AccountRow[] }[];
  total: number;
};

function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: statements = [] } = useStatementCoverage();
  const { members } = useAuth();
  const { base, convert } = useCurrency();
  const { matches, activeLabel, isHousehold } = useScope();
  const remove = useDeleteRow("accounts", "accounts", "Account");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  useQuickAdd("account", () => {
    setEditing(null);
    setSheetOpen(true);
  });

  const coverage = useMemo(
    () =>
      accountCoverage(
        statements.map((row) => ({
          accountId: row.account_id,
          status: row.status,
          periodStart: row.period_start,
          periodEnd: row.period_end,
        })),
      ),
    [statements],
  );

  const visible = useMemo(
    () =>
      accounts.filter(
        (account) => matches(account.owner_profile_id) && (showClosed || account.is_active),
      ),
    [accounts, matches, showClosed],
  );

  const signedBase = (account: AccountRow) => {
    const value = convert(Number(account.current_balance), account.currency, base);
    return DEBT_ACCOUNT_TYPES.includes(account.account_type) ? -value : value;
  };

  const groups = useMemo<Group[]>(() => {
    const byOwner = new Map<string, AccountRow[]>();
    for (const account of visible) {
      const key =
        account.is_joint || !account.owner_profile_id ? "joint" : account.owner_profile_id;
      const list = byOwner.get(key) ?? [];
      list.push(account);
      byOwner.set(key, list);
    }

    const ownerLabel = (key: string) => {
      if (key === "joint") return "Joint";
      const member = members.find((profile) => profile.id === key);
      return member?.display_name ?? member?.full_name ?? member?.email ?? "Unassigned";
    };

    return [...byOwner.entries()]
      .map(([key, list]) => {
        const byCountry = new Map<string, AccountRow[]>();
        for (const account of list) {
          const countryList = byCountry.get(account.country) ?? [];
          countryList.push(account);
          byCountry.set(account.country, countryList);
        }
        return {
          key,
          label: ownerLabel(key),
          countries: [...byCountry.entries()]
            .map(([code, rows]) => ({
              code,
              accounts: rows.sort((a, b) => b.current_balance - a.current_balance),
            }))
            .sort((a, b) => a.code.localeCompare(b.code)),
          total: list.reduce((sum, account) => sum + signedBase(account), 0),
        };
      })
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, members, base, convert]);

  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0);
  const closedCount = accounts.filter((account) => !account.is_active).length;

  const openSheet = (account: AccountRow | null) => {
    setEditing(account);
    setSheetOpen(true);
  };

  return (
    <AppShell
      title="Accounts"
      description={
        isHousehold
          ? "Accounts appear here from the statements you import — institution, number, currency and type read from the file. Add by hand only what no statement can reach."
          : `Accounts held by ${activeLabel}, plus everything joint.`
      }
      actions={
        <>
          <Button size="sm" asChild>
            <Link to="/import">
              <FileUp className="size-3.5" />
              Import statements
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="More account actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => openSheet(null)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add an account manually
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      <div className="space-y-8">
        <PendingAccounts />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : !visible.length ? (
          <AccountsEmptyState onAddManually={() => openSheet(null)} />
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.key}>
                <div className="mb-2 flex items-end justify-between gap-4">
                  <h2 className="eyebrow text-foreground/70">{group.label}</h2>
                  <div className="text-right">
                    <p className="eyebrow text-muted-foreground">Subtotal</p>
                    <Money amount={group.total} currency={base} hideConverted className="text-sm" />
                  </div>
                </div>

                <div className="hairline overflow-hidden rounded-lg bg-surface">
                  {group.countries.map((country, countryIndex) => (
                    <div key={country.code}>
                      <div
                        className={cn(
                          "flex items-center justify-between bg-surface-raised px-4 py-2",
                          countryIndex > 0 && "border-t border-border",
                        )}
                      >
                        <span className="eyebrow text-muted-foreground">
                          {countryLabel(country.code)}
                        </span>
                        <span className="num text-xs text-muted-foreground">
                          {country.accounts.length}{" "}
                          {country.accounts.length === 1 ? "account" : "accounts"}
                        </span>
                      </div>

                      {country.accounts.map((account) => (
                        <AccountListRow
                          key={account.id}
                          account={account}
                          coverage={coverage.get(account.id)}
                          onEdit={() => openSheet(account)}
                          onDelete={() => remove.mutate(account.id)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <div className="hairline flex items-center justify-between rounded-lg bg-surface-raised px-4 py-4">
              <div>
                <p className="eyebrow text-muted-foreground">Total account value</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Card and loan balances are netted off.
                </p>
              </div>
              <Money
                amount={grandTotal}
                currency={base}
                hideConverted
                className="text-xl font-light tracking-tight"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {closedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClosed((value) => !value)}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {showClosed ? "Hide" : "Show"} {closedCount} closed{" "}
                  {closedCount === 1 ? "account" : "accounts"}
                </button>
              )}
              <button
                type="button"
                onClick={() => openSheet(null)}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Add an account manually
              </button>
            </div>
          </>
        )}
      </div>

      <AccountSheet open={sheetOpen} onOpenChange={setSheetOpen} account={editing} />
    </AppShell>
  );
}
