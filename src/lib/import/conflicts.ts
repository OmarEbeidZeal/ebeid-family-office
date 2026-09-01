/**
 * When two documents from the same institution disagree.
 *
 * Trading 212 will hand out an activity CSV and a statement PDF covering the
 * same weeks that do not say the same thing: the snapshot reports a position
 * the orders do not add up to, or a second export of the same period closes on
 * a different figure. Whichever one the importer happens to read last silently
 * becomes the truth, and the household never learns the two disagreed.
 *
 * So a disagreement is never resolved here. It is named — both figures, both
 * documents, the size of the gap — and the statement is held for review.
 *
 * Pure: shared by the broker importer, the statement importer and their tests.
 */
import { formatShares, type TradeLike } from "./broker";

export type ConflictKind = "position" | "balance_same_date" | "balance_seam";

export type Conflict = {
  kind: ConflictKind;
  /** Plain English, naming both figures and both documents. */
  message: string;
  /** The files that disagree, so both can be opened. */
  sources: string[];
};

/** A file name worth printing, or a neutral stand-in. */
function fileLabel(name: string | null | undefined, fallback = "an earlier import"): string {
  const trimmed = (name ?? "").trim();
  return trimmed || fallback;
}

/* ------------------------------------------------------------- positions */

/** How many shares the recorded trades leave in hand at the end of `asOf`. */
export function positionAt(trades: TradeLike[], asOf: string): number {
  let running = 0;
  for (const trade of trades) {
    if (trade.trade_date > asOf) continue;
    running += (trade.side === "sell" ? -1 : 1) * Number(trade.quantity);
  }
  return Number(running.toFixed(6));
}

/**
 * Brokers round the share count they print — 3.6659 for 3.66586264 — so a
 * disagreement has to be larger than the rounding before it is one.
 */
function shareTolerance(stated: number): number {
  return Math.max(0.0005, Math.abs(stated) * 0.0005);
}

/**
 * The broker's own snapshot against the broker's own orders.
 *
 * A snapshot larger than the orders explain is not a conflict — it is a
 * position opened before the export begins, which the importer already records
 * as an opening quantity with an unknown cost. The other direction has no
 * innocent reading: the orders say the household holds shares the same broker
 * says it does not.
 */
export function detectPositionConflict(input: {
  ticker: string;
  asOf: string;
  /** Shares the snapshot states are held on `asOf`. */
  statedShares: number;
  /** Shares the recorded orders leave in hand on that date. */
  derivedShares: number;
  /**
   * Shares the orders leave in hand a few weeks earlier. A dividend is paid on
   * the position at its ex-date, so buying between then and the payment date
   * legitimately leaves more shares on the day than the snapshot counted. Only
   * a gap that was already there before that window is a disagreement.
   */
  derivedSharesEarlier?: number;
  /** The institution both documents came from. */
  institution: string;
  /** The document stating the snapshot figure. */
  statedSource: string | null;
  /** The document the orders came from, when it is a different one. */
  derivedSource?: string | null;
}): Conflict | null {
  const tolerance = shareTolerance(input.statedShares);
  const gap = input.derivedShares - input.statedShares;
  if (gap <= tolerance) return null;
  if (
    input.derivedSharesEarlier !== undefined &&
    input.derivedSharesEarlier - input.statedShares <= tolerance
  ) {
    return null;
  }

  const stated = fileLabel(input.statedSource, "this export");
  const derived = fileLabel(input.derivedSource, "the orders already recorded");
  const sources = Array.from(new Set([stated, derived]));

  return {
    kind: "position",
    message:
      `${input.institution} disagrees with itself on ${input.ticker}: ${stated} reports ` +
      `${formatShares(input.statedShares)} shares held on ${input.asOf}, while ${derived} ` +
      `add up to ${formatShares(input.derivedShares)} by that date — ` +
      `${formatShares(gap)} shares apart. Neither figure has been overwritten; check which export is complete.`,
    sources,
  };
}

/**
 * Two snapshots of the same position on the same day that do not agree — the
 * activity export and the statement PDF, each stating a different holding.
 * There is no reading under which both are right.
 */
export function detectSnapshotConflict(input: {
  ticker: string;
  asOf: string;
  institution: string;
  held: { shares: number; source: string | null };
  incoming: { shares: number; source: string | null };
}): Conflict | null {
  const gap = Math.abs(input.incoming.shares - input.held.shares);
  if (gap <= shareTolerance(input.held.shares)) return null;

  const heldLabel = fileLabel(input.held.source);
  const incomingLabel = fileLabel(input.incoming.source, "this export");
  if (heldLabel === incomingLabel) return null;

  return {
    kind: "position",
    message:
      `${input.institution} states two different holdings of ${input.ticker} on ${input.asOf}: ` +
      `${incomingLabel} says ${formatShares(input.incoming.shares)} shares and ${heldLabel} says ` +
      `${formatShares(input.held.shares)}. The larger figure is kept so no shares are lost, but one of the two exports is wrong.`,
    sources: [incomingLabel, heldLabel],
  };
}


/* -------------------------------------------------------------- balances */

export type StatementFigure = {
  id: string;
  fileName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  currency: string | null;
};

const PENNY = 0.011;

function money(value: number, currency: string | null): string {
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

/** The calendar day before an ISO date. */
function dayBefore(date: string): string | null {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/**
 * The incoming statement against every statement already held for the same
 * account. Two shapes of disagreement, both of which mean one of the two files
 * is wrong or incomplete:
 *
 * - two documents closing the same period on different figures;
 * - a document opening on a figure the previous document did not close on.
 */
export function detectBalanceConflicts(
  incoming: StatementFigure,
  held: StatementFigure[],
): Conflict[] {
  const conflicts: Conflict[] = [];
  const currency = (incoming.currency ?? "").toUpperCase() || null;
  const incomingLabel = fileLabel(incoming.fileName, "this file");

  for (const other of held) {
    if (other.id === incoming.id) continue;
    const otherCurrency = (other.currency ?? "").toUpperCase() || null;
    if (currency && otherCurrency && currency !== otherCurrency) continue;
    const otherLabel = fileLabel(other.fileName);

    if (
      incoming.periodEnd &&
      other.periodEnd === incoming.periodEnd &&
      incoming.closingBalance !== null &&
      other.closingBalance !== null &&
      Math.abs(incoming.closingBalance - other.closingBalance) > PENNY
    ) {
      conflicts.push({
        kind: "balance_same_date",
        message:
          `Two documents close ${incoming.periodEnd} on different figures: ${incomingLabel} says ` +
          `${money(incoming.closingBalance, currency)} and ${otherLabel} says ` +
          `${money(other.closingBalance, otherCurrency ?? currency)}. The transactions from both are kept; ` +
          `the balance has not been taken from either until you say which is right.`,
        sources: [incomingLabel, otherLabel],
      });
      continue;
    }

    const seam =
      incoming.periodStart &&
      other.periodEnd &&
      (other.periodEnd === incoming.periodStart ||
        other.periodEnd === dayBefore(incoming.periodStart));

    if (
      seam &&
      incoming.openingBalance !== null &&
      other.closingBalance !== null &&
      Math.abs(incoming.openingBalance - other.closingBalance) > PENNY
    ) {
      const gap = incoming.openingBalance - other.closingBalance;
      conflicts.push({
        kind: "balance_seam",
        message:
          `${otherLabel} closes ${other.periodEnd} at ${money(other.closingBalance, otherCurrency ?? currency)} ` +
          `but ${incomingLabel} opens ${incoming.periodStart} at ${money(incoming.openingBalance, currency)} — ` +
          `${money(Math.abs(gap), currency)} unaccounted for between them. Something happened on the account that ` +
          `neither document shows.`,
        sources: [incomingLabel, otherLabel],
      });
    }
  }

  return conflicts;
}
