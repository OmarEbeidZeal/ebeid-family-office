import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { DataTable, type Column } from "@/components/DataTable";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { AccountDialog } from "@/components/forms/AccountDialog";
import { useAccounts, type AccountRow } from "@/hooks/useFinancials";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { DEBT_ACCOUNT_TYPES, monthsAgoLabel, titleise } from "@/lib/format";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts | Ebeid Family Office" },
      {
        name: "description",
        content:
          "Every bank, brokerage, pension and card across the UK, Egypt, Jordan and the US in one ledger.",
      },
      { property: "og:title", content: "Accounts | Ebeid Family Office" },
      {
        property: "og:description",
        content: "Every bank, brokerage, pension and card across four markets in one ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountsRoute,
});

function AccountsRoute() {
  return (
    <AppShell>
      <Accounts />
    </AppShell>
  );
}

function Accounts() {
  const { data, isLoading } = useAccounts();
  const { matches } = useScope();
  const { members } = useAuth();
  const remove = useDeleteRow("accounts", "accounts", "Account");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);

  const rows = useMemo(
    () => (data ?? []).filter((account) => matches(account.owner_profile_id)),
    [data, matches],
  );

  const groups = useMemo(() => {
    const banking = rows.filter(
      (row) =>
        !DEBT_ACCOUNT_TYPES.includes(row.account_type) &&
        !["pension", "gia", "isa", "brokerage"].includes(row.account_type),
    );
    const investing = rows.filter((row) =>
      ["pension", "gia", "isa", "brokerage"].includes(row.account_type),
    );
    const debt = rows.filter((row) => DEBT_ACCOUNT_TYPES.includes(row.account_type));
    return [
      { title: "Banking & cash", rows: banking },
      { title: "Investments & pensions", rows: investing },
      { title: "Credit & borrowing", rows: debt },
    ].filter((group) => group.rows.length > 0);
  }, [rows]);

  const ownerLabel = (id: string | null, isJoint: boolean) => {
    if (isJoint || !id) return "Joint";
    const member = members.find((m) => m.id === id);
    return member?.display_name ?? member?.full_name ?? "—";
  };

  const columns: Column<AccountRow>[] = [
    {
      key: "name",
      header: "Account",
      render: (row) => (
        <div>
          <p className="font-medium">{row.nickname}</p>
          <p className="text-xs text-muted-foreground">
            {[row.institution, titleise(row.account_type), row.country].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      render: (row) => ownerLabel(row.owner_profile_id, row.is_joint),
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {monthsAgoLabel(row.last_balance_update)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      render: (row) => (
        <Money
          amount={
            DEBT_ACCOUNT_TYPES.includes(row.account_type)
              ? -Math.abs(Number(row.current_balance))
              : Number(row.current_balance)
          }
          currency={row.currency}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${row.nickname}`}
            onClick={() => {
              setEditing(row);
              setOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${row.nickname}`}
            onClick={() => {
              if (window.confirm(`Delete ${row.nickname}? This cannot be undone.`)) {
                remove.mutate(row.id);
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Accounts"
        description="Balances you update manually today; statement import arrives in the next phase."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add account
          </Button>
        }
      />

      {isLoading ? (
        <DataTable columns={columns} rows={[]} loading />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          body="Add the everyday current account first, then savings, ISAs, the Egyptian and Jordanian accounts, and any cards. Balances feed the dashboard immediately."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Add your first account
            </Button>
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.title}>
            <SectionHeader title={group.title} />
            <DataTable columns={columns} rows={group.rows} />
          </section>
        ))
      )}

      <AccountDialog open={open} onOpenChange={setOpen} account={editing} />
    </div>
  );
}
