import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Landmark } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BankMark } from "@/components/BankMark";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSheet } from "@/components/forms/AccountSheet";
import { useAccounts, type AccountRow } from "@/hooks/useFinancials";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { useScope } from "@/hooks/useScope";
import { useQuickAdd } from "@/lib/quick-add";
import {
  DEBT_ACCOUNT_TYPES,
  accountTypeLabel,
  balanceAgeTone,
  countryLabel,
  relativeAge,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Every bank, savings, ISA, SIPP, GIA and crypto account across the UK, Egypt, Jordan and the US, with balances converted to sterling.",
      },
      { property: "og:title", content: "Accounts — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Household cash and investment accounts, grouped by owner and country.",
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
          ? "Cash and investment accounts across every jurisdiction, converted to sterling."
          : `Accounts held by ${activeLabel}, plus everything joint.`
      }
      actions={
        <Button size="sm" onClick={() => openSheet(null)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add account
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : !visible.length ? (
        <EmptyState
          icon={<Landmark className="h-4 w-4" />}
          title="No accounts recorded yet"
          body="Add the current accounts, savings, ISAs, SIPPs, brokerage and crypto accounts you hold — in any currency, in any country. Balances stay exactly as you enter them."
          action={
            <Button size="sm" onClick={() => openSheet(null)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first account
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
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
                      <AccountRowItem
                        key={account.id}
                        account={account}
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
        </div>
      )}

      <AccountSheet open={sheetOpen} onOpenChange={setSheetOpen} account={editing} />
    </AppShell>
  );
}

function AccountRowItem({
  account,
  onEdit,
  onDelete,
}: {
  account: AccountRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDebt = DEBT_ACCOUNT_TYPES.includes(account.account_type);
  const tone = balanceAgeTone(account.last_balance_update);
  // An account discovered from a statement is usually named with its own last
  // four, so the masked identifier is only worth repeating when the name omits it.
  const maskDigits = account.identifier_mask?.replace(/\D/g, "") ?? "";
  const showMask = Boolean(account.identifier_mask) && !account.nickname.includes(maskDigits);

  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-3.5 first:border-t-0 sm:gap-4">
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
          {!account.is_active && (
            <Badge variant="secondary" className="text-[0.65rem]">
              Closed
            </Badge>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {account.institution ?? "Institution not recorded"}
          {showMask ? (
            <>
              <span className="mx-1.5 text-border">·</span>
              <span className="num">••{account.identifier_mask}</span>
            </>
          ) : null}

          <span className="mx-1.5 text-border">·</span>
          <span className={cn(tone === "warn" && "text-warn")}>
            {relativeAge(account.last_balance_update)}
          </span>
        </p>
      </div>

      <Money
        amount={isDebt ? -Number(account.current_balance) : Number(account.current_balance)}
        currency={account.currency}
        className={cn("text-sm", isDebt && "text-loss")}
      />

      <RowActions
        label={account.nickname}
        onEdit={onEdit}
        onDelete={onDelete}
        deleteDescription="The account and its recorded balance are removed from every total. Transactions linked to it are not deleted."
      />
    </div>
  );
}
