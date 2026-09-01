import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Scale } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetSheet } from "@/components/forms/AssetSheet";
import { LiabilitySheet } from "@/components/forms/LiabilitySheet";
import { AllocationPanels } from "@/components/balance-sheet/AllocationPanels";

import {
  useAccounts,
  useAssets,
  useLiabilities,
  type AccountRow,
  type AssetRow,
  type LiabilityRow,
} from "@/hooks/useFinancials";
import { useCurrency } from "@/hooks/useCurrency";
import { useNetWorth } from "@/hooks/useNetWorth";

import { useDeleteRow } from "@/hooks/useUpsertRow";
import { useQuickAdd } from "@/lib/quick-add";
import { useScope } from "@/hooks/useScope";
import {
  accountTypeLabel,
  assetClassLabel,
  DEBT_ACCOUNT_TYPES,
  formatMoney,
  formatPercent,
  liabilityTypeLabel,
  relativeAge,
  remainingTerm,
  valuationAgeTone,
  valuationMethodLabel,
} from "@/lib/format";
import { balanceKnown, statedBalance, unstatedBalanceNote } from "@/lib/balances";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/balance-sheet")({
  head: () => ({
    meta: [
      { title: "Balance Sheet — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Household assets by class against liabilities by type, with property equity netted and valuation age flagged.",
      },
      { property: "og:title", content: "Balance Sheet — Ebeid Family Office" },
      {
        property: "og:description",
        content: "A true two-column household balance sheet with the net position struck below.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BalanceSheetPage,
});

function BalanceSheetPage() {
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts();
  const { data: assets = [], isLoading: assetsLoading } = useAssets();
  const { data: liabilities = [], isLoading: liabilitiesLoading } = useLiabilities();
  const { base, convert } = useCurrency();
  const { matches, activeLabel, isHousehold } = useScope();
  const summary = useNetWorth();

  const removeAsset = useDeleteRow("assets", "assets", "Asset");
  const removeLiability = useDeleteRow("liabilities", "liabilities", "Liability");

  const [assetSheet, setAssetSheet] = useState(false);
  const [liabilitySheet, setLiabilitySheet] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null);
  const [editingLiability, setEditingLiability] = useState<LiabilityRow | null>(null);

  useQuickAdd("asset", () => {
    setEditingAsset(null);
    setAssetSheet(true);
  });
  useQuickAdd("liability", () => {
    setEditingLiability(null);
    setLiabilitySheet(true);
  });

  const loading = accountsLoading || assetsLoading || liabilitiesLoading;

  const visibleAccounts = useMemo(
    () => accounts.filter((account) => account.is_active && matches(account.owner_profile_id)),
    [accounts, matches],
  );
  const visibleAssets = useMemo(
    () => assets.filter((asset) => matches(asset.owner_profile_id)),
    [assets, matches],
  );
  const visibleLiabilities = useMemo(
    () => liabilities.filter((liability) => matches(liability.owner_profile_id)),
    [liabilities, matches],
  );

  const assetBaseValue = (asset: AssetRow) =>
    convert(
      Number(asset.current_value) * (Number(asset.ownership_pct) / 100),
      asset.currency,
      base,
    );
  const liabilityBaseValue = (liability: LiabilityRow) =>
    convert(Number(liability.outstanding_balance), liability.currency, base);
  const accountBaseValue = (account: AccountRow) => {
    // No stated balance, no contribution: the row is still listed, but it adds
    // neither a figure nor a zero to the side it sits on.
    const stated = statedBalance(account);
    return stated === null ? 0 : convert(stated, account.currency, base);
  };

  /** Cash and investment accounts sit on the asset side; cards and loan accounts on the other. */
  const cashAccounts = useMemo(
    () => visibleAccounts.filter((a) => !DEBT_ACCOUNT_TYPES.includes(a.account_type)),
    [visibleAccounts],
  );
  const debtAccounts = useMemo(
    () => visibleAccounts.filter((a) => DEBT_ACCOUNT_TYPES.includes(a.account_type)),
    [visibleAccounts],
  );

  const groupAccounts = (rows: AccountRow[], absolute: boolean) => {
    const map = new Map<string, AccountRow[]>();
    for (const account of rows) {
      const list = map.get(account.account_type) ?? [];
      list.push(account);
      map.set(account.account_type, list);
    }
    return [...map.entries()]
      .map(([type, group]) => ({
        key: `account-${type}`,
        label: accountTypeLabel(type),
        rows: group,
        total: group.reduce(
          (sum, row) => sum + (absolute ? Math.abs(accountBaseValue(row)) : accountBaseValue(row)),
          0,
        ),
      }))
      .sort((a, b) => b.total - a.total);
  };

  const cashGroups = useMemo(
    () => groupAccounts(cashAccounts, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cashAccounts, base, convert],
  );
  const debtAccountGroups = useMemo(
    () => groupAccounts(debtAccounts, true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debtAccounts, base, convert],
  );

  const assetGroups = useMemo(() => {
    const map = new Map<string, AssetRow[]>();
    for (const asset of visibleAssets) {
      const list = map.get(asset.asset_class) ?? [];
      list.push(asset);
      map.set(asset.asset_class, list);
    }
    return [...map.entries()]
      .map(([assetClass, rows]) => ({
        key: assetClass,
        label: assetClassLabel(assetClass),
        rows,
        total: rows.reduce((sum, row) => sum + assetBaseValue(row), 0),
      }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAssets, base, convert]);

  const liabilityGroups = useMemo(() => {
    const map = new Map<string, LiabilityRow[]>();
    for (const liability of visibleLiabilities) {
      const list = map.get(liability.liability_type) ?? [];
      list.push(liability);
      map.set(liability.liability_type, list);
    }
    return [...map.entries()]
      .map(([type, rows]) => ({
        key: type,
        label: liabilityTypeLabel(type),
        rows,
        total: rows.reduce((sum, row) => sum + liabilityBaseValue(row), 0),
      }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLiabilities, base, convert]);

  const totalAssets =
    cashGroups.reduce((sum, group) => sum + group.total, 0) +
    assetGroups.reduce((sum, group) => sum + group.total, 0);
  const totalLiabilities =
    debtAccountGroups.reduce((sum, group) => sum + group.total, 0) +
    liabilityGroups.reduce((sum, group) => sum + group.total, 0);
  const netPosition = totalAssets - totalLiabilities;

  /** Debt secured against each asset, so property rows can show real equity. */
  const securedAgainst = useMemo(() => {
    const map = new Map<string, number>();
    for (const liability of visibleLiabilities) {
      if (!liability.linked_asset_id) continue;
      map.set(
        liability.linked_asset_id,
        (map.get(liability.linked_asset_id) ?? 0) + liabilityBaseValue(liability),
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLiabilities, base, convert]);

  const assetNameById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset.name])),
    [assets],
  );

  const openAsset = (asset: AssetRow | null) => {
    setEditingAsset(asset);
    setAssetSheet(true);
  };
  const openLiability = (liability: LiabilityRow | null) => {
    setEditingLiability(liability);
    setLiabilitySheet(true);
  };

  const nothingRecorded =
    !visibleAccounts.length && !visibleAssets.length && !visibleLiabilities.length;

  // Accounts in view whose balance nobody has stated: listed on the sheet, but
  // absent from both columns and from the net position.
  const unstatedNote = unstatedBalanceNote(
    visibleAccounts.filter((account) => !balanceKnown(account)).length,
  );

  return (
    <AppShell
      title="Balance sheet"
      description={
        isHousehold
          ? "What the household owns, set against what it owes."
          : `${activeLabel}'s share of what the household owns and owes, including joint items.`
      }
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openLiability(null)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Liability
          </Button>
          <Button size="sm" onClick={() => openAsset(null)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Asset
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      ) : nothingRecorded ? (
        <EmptyState
          icon={<Scale className="h-4 w-4" />}
          title="Nothing on the balance sheet yet"
          body="Add property, pensions, private shareholdings and any other assets on one side, and mortgages, loans and cards on the other. Link a mortgage to its property and the equity is worked out for you."
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => openAsset(null)}>
                Add an asset
              </Button>
              <Button size="sm" variant="outline" onClick={() => openLiability(null)}>
                Add a liability
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Column
              title="Assets"
              total={totalAssets}
              base={base}
              emptyBody="No assets recorded on this side yet."
              onAdd={() => openAsset(null)}
              addLabel="Add asset"
              isEmpty={!assetGroups.length && !cashGroups.length}
            >
              {cashGroups.map((group) => (
                <GroupBlock
                  key={group.key}
                  label={group.label}
                  total={group.total}
                  base={base}
                  note="Accounts"
                >
                  {group.rows.map((account) => (
                    <AccountLine key={account.id} account={account} base={base} />
                  ))}
                </GroupBlock>
              ))}
              {assetGroups.map((group) => (
                <GroupBlock key={group.key} label={group.label} total={group.total} base={base}>
                  {group.rows.map((asset) => (
                    <AssetLine
                      key={asset.id}
                      asset={asset}
                      base={base}
                      baseValue={assetBaseValue(asset)}
                      securedDebt={securedAgainst.get(asset.id) ?? 0}
                      onEdit={() => openAsset(asset)}
                      onDelete={() => removeAsset.mutate(asset.id)}
                    />
                  ))}
                </GroupBlock>
              ))}
            </Column>

            <Column
              title="Liabilities"
              total={totalLiabilities}
              base={base}
              tone="loss"
              emptyBody="No debts recorded — if that is right, this side stays empty."
              onAdd={() => openLiability(null)}
              addLabel="Add liability"
              isEmpty={!liabilityGroups.length && !debtAccountGroups.length}
            >
              {debtAccountGroups.map((group) => (
                <GroupBlock
                  key={group.key}
                  label={group.label}
                  total={group.total}
                  base={base}
                  tone="loss"
                  note="Accounts"
                >
                  {group.rows.map((account) => (
                    <AccountLine key={account.id} account={account} base={base} tone="loss" />
                  ))}
                </GroupBlock>
              ))}

              {liabilityGroups.map((group) => (
                <GroupBlock
                  key={group.key}
                  label={group.label}
                  total={group.total}
                  base={base}
                  tone="loss"
                >
                  {group.rows.map((liability) => (
                    <LiabilityLine
                      key={liability.id}
                      liability={liability}
                      linkedAssetName={
                        liability.linked_asset_id
                          ? (assetNameById.get(liability.linked_asset_id) ?? null)
                          : null
                      }
                      onEdit={() => openLiability(liability)}
                      onDelete={() => removeLiability.mutate(liability.id)}
                    />
                  ))}
                </GroupBlock>
              ))}
            </Column>
          </div>

          <div className="hairline rounded-lg bg-surface-raised px-5 py-5">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex flex-wrap gap-8">
                <Struck label="Total assets" value={totalAssets} base={base} />
                <Struck
                  label="Total liabilities"
                  value={-totalLiabilities}
                  base={base}
                  tone="loss"
                />
              </div>
              <div className="text-right">
                <p className="eyebrow text-muted-foreground">Net position</p>
                <p className="num mt-1 text-3xl font-light tracking-tight text-foreground">
                  {formatMoney(netPosition, base, { decimals: 0 })}
                </p>
              </div>
            </div>
            {unstatedNote && (
              <p className="mt-4 border-t border-border pt-3 text-xs text-warn">
                {unstatedNote}{" "}
                <Link to="/accounts" className="underline underline-offset-4">
                  Set them on Accounts
                </Link>
                .
              </p>
            )}
          </div>

          <AllocationPanels summary={summary} />
        </div>
      )}

      <AssetSheet open={assetSheet} onOpenChange={setAssetSheet} asset={editingAsset} />
      <LiabilitySheet
        open={liabilitySheet}
        onOpenChange={setLiabilitySheet}
        liability={editingLiability}
      />
    </AppShell>
  );
}

function Column({
  title,
  total,
  base,
  tone,
  children,
  isEmpty,
  emptyBody,
  onAdd,
  addLabel,
}: {
  title: string;
  total: number;
  base: string;
  tone?: "loss";
  children: React.ReactNode;
  isEmpty: boolean;
  emptyBody: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-border pb-2">
        <h2 className="eyebrow text-foreground/70">{title}</h2>
        <span className={cn("num text-sm", tone === "loss" ? "text-loss" : "text-foreground")}>
          {formatMoney(total, base, { decimals: 0 })}
        </span>
      </div>
      {isEmpty ? (
        <div className="hairline rounded-lg bg-surface px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground">{emptyBody}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </section>
  );
}

function GroupBlock({
  label,
  total,
  base,
  tone,
  note,
  children,
}: {
  label: string;
  total: number;
  base: string;
  tone?: "loss";
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hairline overflow-hidden rounded-lg bg-surface">
      <div className="flex items-center justify-between bg-surface-raised px-4 py-2">
        <span className="eyebrow flex items-center gap-2 text-muted-foreground">
          {label}
          {note && (
            <span className="rounded-sm border border-border px-1.5 py-px text-[0.6rem] tracking-normal text-muted-foreground/80">
              {note}
            </span>
          )}
        </span>
        <span className={cn("num text-xs", tone === "loss" ? "text-loss" : "text-foreground")}>
          {formatMoney(total, base, { decimals: 0 })}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Accounts are edited on the Accounts page; here they only need to be counted honestly. */
function AccountLine({
  account,
  base,
  tone,
}: {
  account: AccountRow;
  base: string;
  tone?: "loss";
}) {
  const known = balanceKnown(account);
  const stale = account.last_balance_update
    ? Date.now() - new Date(account.last_balance_update).getTime() > 30 * 24 * 60 * 60 * 1000
    : true;

  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/accounts"
            className="truncate text-sm text-foreground transition-colors hover:text-primary"
          >
            {account.nickname}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {account.institution || accountTypeLabel(account.account_type)}
            <span className="mx-1.5 text-border">·</span>
            {known ? (
              <span className={cn(stale && "text-warn")}>
                {relativeAge(account.last_balance_update)}
              </span>
            ) : (
              <span className="text-warn">no balance recorded</span>
            )}
          </p>
        </div>
        {known ? (
          <Money
            amount={Math.abs(Number(account.current_balance))}
            currency={account.currency}
            align="right"
            className={cn("text-sm", tone === "loss" && "text-loss")}
            hideConverted={account.currency === base}
          />
        ) : (
          // Excluded from the subtotal above it, and saying so.
          <Link
            to="/accounts"
            className="shrink-0 text-xs text-muted-foreground hover:text-primary"
          >
            Not set
          </Link>
        )}
      </div>
    </div>
  );
}

function AssetLine({
  asset,
  base,
  baseValue,
  securedDebt,
  onEdit,
  onDelete,
}: {
  asset: AssetRow;
  base: string;
  baseValue: number;
  securedDebt: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tone = valuationAgeTone(asset.last_valued_at);
  const isPrivate = asset.asset_class === "private_equity";
  const metadata = asset.metadata;

  return (
    <div className="border-t border-border px-4 py-3.5 first:border-t-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm text-foreground">{asset.name}</p>
            {isPrivate && metadata?.stake_pct != null ? (
              <Badge variant="outline" className="num text-[0.65rem]">
                {formatPercent(Number(metadata.stake_pct))} stake
              </Badge>
            ) : (
              Number(asset.ownership_pct) !== 100 && (
                <Badge variant="outline" className="num text-[0.65rem]">
                  {formatPercent(Number(asset.ownership_pct))} owned
                </Badge>
              )
            )}

            {!asset.is_liquid && (
              <Badge variant="secondary" className="text-[0.65rem]">
                Illiquid
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {valuationMethodLabel(asset.valuation_method)}
            <span className="mx-1.5 text-border">·</span>
            <span className={cn(tone === "warn" && "text-warn", tone === "stale" && "text-loss")}>
              {relativeAge(asset.last_valued_at, "valued")}
            </span>
          </p>
          {isPrivate && metadata?.share_count != null && (
            <p className="num mt-1 text-[0.7rem] text-muted-foreground">
              {new Intl.NumberFormat("en-GB").format(Number(metadata.share_count))} shares
              {metadata.price_per_share != null &&
                ` at ${formatMoney(Number(metadata.price_per_share), asset.currency, { decimals: 2 })}`}
            </p>
          )}
          {isPrivate && metadata?.liquidity_restriction && (
            <p className="mt-1 text-[0.7rem] leading-relaxed text-warn">
              {metadata.liquidity_restriction}
            </p>
          )}
        </div>

        <div className="flex items-start gap-1">
          <div className="text-right">
            <Money amount={baseValue} currency={base} hideConverted className="text-sm" />
            {asset.currency !== base && (
              <p className="num text-[0.7rem] text-muted-foreground">
                {formatMoney(Number(asset.current_value), asset.currency, { decimals: 0 })} held
              </p>
            )}
            {securedDebt > 0 && (
              <p className="num text-[0.7rem] text-muted-foreground">
                Equity {formatMoney(baseValue - securedDebt, base, { decimals: 0 })}
              </p>
            )}
          </div>
          <RowActions label={asset.name} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

function LiabilityLine({
  liability,
  linkedAssetName,
  onEdit,
  onDelete,
}: {
  liability: LiabilityRow;
  linkedAssetName: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const term = remainingTerm(liability.end_date);

  return (
    <div className="border-t border-border px-4 py-3.5 first:border-t-0">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{liability.name}</p>
          <p className="num mt-1 text-xs text-muted-foreground">
            {liability.interest_rate != null
              ? `${formatPercent(Number(liability.interest_rate), 2)} interest`
              : "Rate not recorded"}
            {liability.monthly_payment != null && (
              <>
                <span className="mx-1.5 text-border">·</span>
                {formatMoney(Number(liability.monthly_payment), liability.currency, {
                  decimals: 0,
                })}
                /mo
              </>
            )}
            {term && (
              <>
                <span className="mx-1.5 text-border">·</span>
                {term}
              </>
            )}
          </p>
          {linkedAssetName && (
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              Secured against {linkedAssetName}
            </p>
          )}
        </div>

        <div className="flex items-start gap-1">
          <Money
            amount={Number(liability.outstanding_balance)}
            currency={liability.currency}
            className="text-sm text-loss"
          />
          <RowActions label={liability.name} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}

function Struck({
  label,
  value,
  base,
  tone,
}: {
  label: string;
  value: number;
  base: string;
  tone?: "loss";
}) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-lg font-light", tone === "loss" && "text-loss")}>
        {formatMoney(value, base, { decimals: 0 })}
      </p>
    </div>
  );
}
