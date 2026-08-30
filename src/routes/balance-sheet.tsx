import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHeader } from "@/components/SectionHeader";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { DataTable, type Column } from "@/components/DataTable";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { AssetDialog } from "@/components/forms/AssetDialog";
import { LiabilityDialog } from "@/components/forms/LiabilityDialog";
import { useAssets, useLiabilities, type AssetRow, type LiabilityRow } from "@/hooks/useFinancials";
import { useNetWorth } from "@/hooks/useNetWorth";
import { useScope } from "@/hooks/useScope";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { formatMoney, monthsAgoLabel, titleise } from "@/lib/format";

export const Route = createFileRoute("/balance-sheet")({
  head: () => ({
    meta: [
      { title: "Balance Sheet | Ebeid Family Office" },
      {
        name: "description",
        content:
          "Property, private holdings, pensions and every debt — valued, owned and tracked in one statement of position.",
      },
      { property: "og:title", content: "Balance Sheet | Ebeid Family Office" },
      {
        property: "og:description",
        content: "Property, private holdings and every debt in one statement of position.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BalanceSheetRoute,
});

function BalanceSheetRoute() {
  return (
    <AppShell>
      <BalanceSheet />
    </AppShell>
  );
}

function BalanceSheet() {
  const { data: assets, isLoading: assetsLoading } = useAssets();
  const { data: liabilities, isLoading: liabilitiesLoading } = useLiabilities();
  const { matches } = useScope();
  const metrics = useNetWorth();
  const removeAsset = useDeleteRow("assets", "assets", "Asset");
  const removeLiability = useDeleteRow("liabilities", "liabilities", "Liability");

  const [assetOpen, setAssetOpen] = useState(false);
  const [liabilityOpen, setLiabilityOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null);
  const [editingLiability, setEditingLiability] = useState<LiabilityRow | null>(null);

  const assetRows = useMemo(
    () => (assets ?? []).filter((row) => matches(row.owner_profile_id)),
    [assets, matches],
  );
  const liabilityRows = useMemo(
    () => (liabilities ?? []).filter((row) => matches(row.owner_profile_id)),
    [liabilities, matches],
  );

  const assetColumns: Column<AssetRow>[] = [
    {
      key: "name",
      header: "Asset",
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {[titleise(row.asset_class), row.country, row.is_liquid ? "Liquid" : "Illiquid"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "ownership",
      header: "Share",
      render: (row) => <span className="num text-sm">{Number(row.ownership_pct).toFixed(0)}%</span>,
    },
    {
      key: "valued",
      header: "Valuation",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {titleise(row.valuation_method)} · {monthsAgoLabel(row.last_valued_at)}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      render: (row) => (
        <Money
          amount={Number(row.current_value) * (Number(row.ownership_pct) / 100)}
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
            aria-label={`Edit ${row.name}`}
            onClick={() => {
              setEditingAsset(row);
              setAssetOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${row.name}`}
            onClick={() => {
              if (window.confirm(`Delete ${row.name}?`)) removeAsset.mutate(row.id);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const liabilityColumns: Column<LiabilityRow>[] = [
    {
      key: "name",
      header: "Liability",
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {[titleise(row.liability_type), row.interest_rate ? `${row.interest_rate}%` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "payment",
      header: "Monthly",
      render: (row) =>
        row.monthly_payment ? (
          <span className="num text-sm">{formatMoney(Number(row.monthly_payment), row.currency)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "end",
      header: "Ends",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.end_date ? new Date(row.end_date).toLocaleDateString("en-GB") : "—"}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Outstanding",
      align: "right",
      render: (row) => <Money amount={-Number(row.outstanding_balance)} currency={row.currency} />,
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
            aria-label={`Edit ${row.name}`}
            onClick={() => {
              setEditingLiability(row);
              setLiabilityOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${row.name}`}
            onClick={() => {
              if (window.confirm(`Delete ${row.name}?`)) removeLiability.mutate(row.id);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-10">
      <SectionHeader
        title="Balance sheet"
        description="Everything owned and owed, converted into your base currency."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Assets"
          loading={metrics.loading}
          value={formatMoney(metrics.totalAssets, metrics.base, { decimals: 0 })}
        />
        <StatTile
          label="Liabilities"
          tone="loss"
          loading={metrics.loading}
          value={formatMoney(metrics.totalLiabilities, metrics.base, { decimals: 0 })}
        />
        <StatTile
          label="Net position"
          tone="gold"
          loading={metrics.loading}
          value={formatMoney(metrics.netWorth, metrics.base, { decimals: 0 })}
        />
      </div>

      <section>
        <SectionHeader
          title="Assets"
          action={
            <Button
              onClick={() => {
                setEditingAsset(null);
                setAssetOpen(true);
              }}
            >
              <Plus className="size-4" /> Add asset
            </Button>
          }
        />
        <DataTable
          columns={assetColumns}
          rows={assetRows}
          loading={assetsLoading}
          empty={
            <EmptyState
              title="No assets recorded"
              body="Property in London or Cairo, private company equity, pensions held outside a platform, land, vehicles and valuables all belong here."
            />
          }
        />
      </section>

      <section>
        <SectionHeader
          title="Liabilities"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setEditingLiability(null);
                setLiabilityOpen(true);
              }}
            >
              <Plus className="size-4" /> Add liability
            </Button>
          }
        />
        <DataTable
          columns={liabilityColumns}
          rows={liabilityRows}
          loading={liabilitiesLoading}
          empty={
            <EmptyState
              title="No liabilities recorded"
              body="Mortgages, family loans, car finance and any credit balances you want tracked against the assets they fund."
            />
          }
        />
      </section>

      <AssetDialog open={assetOpen} onOpenChange={setAssetOpen} asset={editingAsset} />
      <LiabilityDialog
        open={liabilityOpen}
        onOpenChange={setLiabilityOpen}
        liability={editingLiability}
      />
    </div>
  );
}
