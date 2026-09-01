/**
 * Realised gains and losses, per wrapper.
 *
 * A closed position is not one number. Where it was closed decides whether the
 * result matters to HMRC at all: a loss inside an ISA buys nothing — it cannot
 * be set against a gain anywhere else — while the same loss in a general
 * investment account is an asset, carried forward and offsettable. The app
 * therefore records disposals against the account they happened in and never
 * pools the two.
 *
 * Basis follows the same average-cost method the database uses when it
 * recalculates a holding, and the same honesty: where the purchase price of
 * the opening shares is in no file the household holds, the gain comes back
 * null. An unknown result is reported as unknown, never as zero.
 */
import { POLICY_LIMITS, currentTaxYear, type PolicyStatus } from "@/lib/policy";
import type { ToBase } from "@/lib/portfolio";

/** How the tax treatment differs, which is the only distinction that matters here. */
export type Wrapper = "isa" | "sipp" | "taxable" | "unknown";

export const WRAPPER_LABELS: Record<Wrapper, string> = {
  isa: "ISA",
  sipp: "Pension (SIPP)",
  taxable: "General investment account",
  unknown: "Wrapper not known",
};

export const WRAPPER_NOTES: Record<Wrapper, string> = {
  isa: "Gains and losses inside an ISA fall outside capital gains tax. A loss here carries no tax benefit and cannot be set against gains elsewhere.",
  sipp: "Inside a pension, growth and disposals are outside capital gains tax. Tax is a question of what comes out, not what is realised inside.",
  taxable:
    "Gains count against the £3,000 annual exempt amount; losses can be set against gains in the same year and carried forward if reported.",
  unknown:
    "These disposals are not linked to an account, so the app cannot say whether the result is taxable. Link the holding to the account it sits in.",
};

export function wrapperOf(accountType: string | null | undefined): Wrapper {
  switch (accountType) {
    case "isa":
      return "isa";
    case "sipp":
      return "sipp";
    case "gia":
    case "crypto":
    case "current":
    case "savings":
    case "cash":
      return "taxable";
    default:
      return "unknown";
  }
}

export type RealisedHolding = {
  id: string;
  ticker: string;
  name?: string | null;
  account_id: string | null;
  owner_profile_id?: string | null;
  currency: string;
  opening_quantity?: number | null;
  opening_cost?: number | null;
};

export type RealisedTrade = {
  holding_id: string;
  account_id: string | null;
  side: string;
  trade_date: string;
  quantity: number | string;
  price: number | string;
  fees: number | string;
  currency: string;
};

export type RealisedAccount = {
  id: string;
  account_type: string;
  nickname?: string | null;
  owner_profile_id?: string | null;
};

export type Disposal = {
  holdingId: string;
  ticker: string;
  name: string | null;
  accountId: string | null;
  accountLabel: string | null;
  wrapper: Wrapper;
  ownerProfileId: string | null;
  date: string;
  taxYear: string;
  quantity: number;
  proceedsBase: number;
  costBase: number | null;
  /** Null where the purchase price of these shares is in none of the imported files. */
  gainBase: number | null;
  basisKnown: boolean;
};

const numeric = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Replays each holding's trades in date order, average cost throughout — the
 * same arithmetic the database trigger runs, so a disposal shown here and the
 * holding's stored realised figure can never tell different stories.
 */
export function realisedDisposals(input: {
  holdings: RealisedHolding[];
  trades: RealisedTrade[];
  accounts: RealisedAccount[];
  toBase: ToBase;
}): Disposal[] {
  const { holdings, trades, accounts, toBase } = input;
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const byHolding = new Map<string, RealisedTrade[]>();
  for (const trade of trades) {
    byHolding.set(trade.holding_id, [...(byHolding.get(trade.holding_id) ?? []), trade]);
  }

  const disposals: Disposal[] = [];

  for (const holding of holdings) {
    const rows = (byHolding.get(holding.id) ?? [])
      .slice()
      .sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    if (!rows.length) continue;

    const openingQuantity = numeric(holding.opening_quantity);
    const openingCost = holding.opening_cost === null || holding.opening_cost === undefined
      ? null
      : numeric(holding.opening_cost);
    // Shares bought before the earliest imported export have no cost in any
    // file, so nothing derived from them can be reported as a gain.
    const basisUnknown = openingQuantity > 0 && openingCost === null;

    let quantity = openingQuantity;
    let cost = openingCost ?? 0;

    for (const trade of rows) {
      const tradeQty = numeric(trade.quantity);
      const price = numeric(trade.price);
      const fees = numeric(trade.fees);

      if (trade.side === "buy") {
        cost += tradeQty * price + fees;
        quantity += tradeQty;
        continue;
      }

      const averageCost = quantity > 0 ? cost / quantity : 0;
      const proceedsNative = tradeQty * price - fees;
      const costNative = averageCost * tradeQty;
      const proceedsBase = toBase(proceedsNative, trade.currency || holding.currency);
      const costBase = basisUnknown
        ? null
        : toBase(costNative, trade.currency || holding.currency);

      const accountId = trade.account_id ?? holding.account_id;
      const account = accountId ? accountById.get(accountId) : undefined;

      disposals.push({
        holdingId: holding.id,
        ticker: holding.ticker,
        name: holding.name ?? null,
        accountId: accountId ?? null,
        accountLabel: account?.nickname ?? null,
        wrapper: wrapperOf(account?.account_type),
        ownerProfileId: holding.owner_profile_id ?? account?.owner_profile_id ?? null,
        date: trade.trade_date,
        taxYear: currentTaxYear(new Date(`${trade.trade_date}T12:00:00Z`)).label,
        quantity: tradeQty,
        proceedsBase,
        costBase,
        gainBase: costBase === null ? null : proceedsBase - costBase,
        basisKnown: !basisUnknown,
      });

      cost = Math.max(cost - costNative, 0);
      quantity = Math.max(quantity - tradeQty, 0);
    }
  }

  return disposals.sort((a, b) => b.date.localeCompare(a.date));
}

export type WrapperResult = {
  wrapper: Wrapper;
  label: string;
  note: string;
  disposals: number;
  proceedsBase: number;
  /** Null when every disposal in the wrapper has an unknown basis. */
  gainBase: number | null;
  gainsBase: number;
  lossesBase: number;
  unknownBasisCount: number;
  tickers: string[];
};

function summariseWrapper(wrapper: Wrapper, rows: Disposal[]): WrapperResult {
  const known = rows.filter((row) => row.gainBase !== null);
  return {
    wrapper,
    label: WRAPPER_LABELS[wrapper],
    note: WRAPPER_NOTES[wrapper],
    disposals: rows.length,
    proceedsBase: rows.reduce((sum, row) => sum + row.proceedsBase, 0),
    gainBase: known.length ? known.reduce((sum, row) => sum + (row.gainBase ?? 0), 0) : null,
    gainsBase: known
      .filter((row) => (row.gainBase ?? 0) > 0)
      .reduce((sum, row) => sum + (row.gainBase ?? 0), 0),
    lossesBase: known
      .filter((row) => (row.gainBase ?? 0) < 0)
      .reduce((sum, row) => sum + Math.abs(row.gainBase ?? 0), 0),
    unknownBasisCount: rows.length - known.length,
    tickers: Array.from(new Set(rows.map((row) => row.ticker))),
  };
}

function groupWrappers(rows: Disposal[]): WrapperResult[] {
  const order: Wrapper[] = ["taxable", "isa", "sipp", "unknown"];
  return order
    .map((wrapper) => summariseWrapper(wrapper, rows.filter((row) => row.wrapper === wrapper)))
    .filter((result) => result.disposals > 0);
}

export type CgtPosition = {
  gainsBase: number;
  lossesBase: number;
  netBase: number;
  exemptAmount: number;
  /** Headroom left in the annual exempt amount; zero once net gains exceed it. */
  headroomBase: number;
  taxableBase: number;
  unknownBasisCount: number;
  status: PolicyStatus;
  headline: string;
};

export type RealisedSummary = {
  taxYear: string;
  /** Disposals in the current tax year, split by wrapper. */
  thisYear: WrapperResult[];
  allTime: WrapperResult[];
  /** Capital gains position — general investment accounts only. */
  cgt: CgtPosition;
  /** Sheltered results, reported so a loss inside an ISA is not mistaken for a usable one. */
  shelteredNetBase: number | null;
  shelteredDisposals: number;
  disposalCount: number;
  unknownBasisCount: number;
};

const money = (value: number, base: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: base,
    maximumFractionDigits: 0,
  }).format(value);

export function summariseRealised(input: {
  disposals: Disposal[];
  base: string;
  now?: Date;
}): RealisedSummary {
  const { disposals, base } = input;
  const taxYear = currentTaxYear(input.now ?? new Date());
  const thisYearRows = disposals.filter((row) => row.taxYear === taxYear.label);

  const taxable = thisYearRows.filter((row) => row.wrapper === "taxable");
  const taxableKnown = taxable.filter((row) => row.gainBase !== null);
  const gainsBase = taxableKnown
    .filter((row) => (row.gainBase ?? 0) > 0)
    .reduce((sum, row) => sum + (row.gainBase ?? 0), 0);
  const lossesBase = taxableKnown
    .filter((row) => (row.gainBase ?? 0) < 0)
    .reduce((sum, row) => sum + Math.abs(row.gainBase ?? 0), 0);
  const netBase = gainsBase - lossesBase;
  const exempt = POLICY_LIMITS.cgtAnnualExempt;
  const headroom = Math.max(exempt - Math.max(netBase, 0), 0);
  const unknownBasisCount = taxable.length - taxableKnown.length;

  const sheltered = thisYearRows.filter(
    (row) => row.wrapper === "isa" || row.wrapper === "sipp",
  );
  const shelteredKnown = sheltered.filter((row) => row.gainBase !== null);

  const cgtStatus: PolicyStatus = !taxable.length
    ? "not_applicable"
    : unknownBasisCount
      ? "unknown"
      : netBase > exempt
        ? "watch"
        : "ok";

  const cgtHeadline = !taxable.length
    ? `No disposals in a general investment account in ${taxYear.label}, so the £${exempt.toLocaleString("en-GB")} exempt amount is untouched.`
    : unknownBasisCount
      ? `${unknownBasisCount} of ${taxable.length} taxable disposal${taxable.length === 1 ? "" : "s"} in ${taxYear.label} ${unknownBasisCount === 1 ? "has" : "have"} no purchase price on file, so the gain cannot be computed. Import the earlier export before relying on this figure.`
      : netBase > exempt
        ? `Net realised gains of ${money(netBase, base)} in ${taxYear.label} exceed the ${money(exempt, base)} annual exempt amount by ${money(netBase - exempt, base)}, which is taxable at 18% or 24%.`
        : netBase >= 0
          ? `Net realised gains of ${money(netBase, base)} in ${taxYear.label} against a ${money(exempt, base)} exempt amount — ${money(headroom, base)} of headroom left.`
          : `Net realised losses of ${money(Math.abs(netBase), base)} in ${taxYear.label} in a general investment account. Reported to HMRC, they can be set against gains this year and carried forward.`;

  return {
    taxYear: taxYear.label,
    thisYear: groupWrappers(thisYearRows),
    allTime: groupWrappers(disposals),
    cgt: {
      gainsBase,
      lossesBase,
      netBase,
      exemptAmount: exempt,
      headroomBase: headroom,
      taxableBase: Math.max(netBase - exempt, 0),
      unknownBasisCount,
      status: cgtStatus,
      headline: cgtHeadline,
    },
    shelteredNetBase: shelteredKnown.length
      ? shelteredKnown.reduce((sum, row) => sum + (row.gainBase ?? 0), 0)
      : null,
    shelteredDisposals: sheltered.length,
    disposalCount: thisYearRows.length,
    unknownBasisCount: thisYearRows.filter((row) => row.gainBase === null).length,
  };
}
