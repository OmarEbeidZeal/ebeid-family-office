/**
 * The balance a statement never says out loud.
 *
 * NatWest, Revolut, Nationwide and most PDF statements print a running balance
 * beside every line but state no "closing balance" anywhere the reader can find
 * it. Dropping that column left the account with no balance at all — 605 real
 * transactions and a net worth of nothing — when the last line of the statement
 * had said what the account held all along.
 *
 * So: a balance derived from the last printed line is used where the statement
 * states none. It is still an inference, and it is labelled as one — a derived
 * figure never reconciles a file the way a stated figure does.
 */

export type BalanceRow = {
  booked_date: string;
  amount: number;
  direction: "debit" | "credit";
  balance_after?: number | null;
};

export type DerivedBalances = {
  opening: number | null;
  closing: number | null;
  /** The date of the line the closing figure was read from. */
  closingDate: string | null;
  derived: Array<"opening" | "closing">;
};

export const RUNNING_BALANCE_NOTE =
  "Closing balance read from the running balance on the last line, not from a figure the statement states.";

/**
 * @param rows      the statement's transactions, in any order
 * @param stated    what the statement itself said, where it said anything
 */
export function deriveBalances(
  rows: BalanceRow[],
  stated: { opening: number | null; closing: number | null } = { opening: null, closing: null },
): DerivedBalances {
  const derived: Array<"opening" | "closing"> = [];
  let opening = stated.opening;
  let closing = stated.closing;
  let closingDate: string | null = null;

  // Same date, two lines: the order they were printed in is the order they
  // happened in, so a stable sort keeps the last line last.
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) =>
      a.row.booked_date === b.row.booked_date
        ? a.index - b.index
        : a.row.booked_date.localeCompare(b.row.booked_date),
    )
    .map((entry) => entry.row);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // The balance before the first line is that line's balance with its own
  // movement taken back out.
  if (opening === null && isFigure(first?.balance_after) && first) {
    opening =
      first.direction === "debit"
        ? round(first.balance_after! + Math.abs(first.amount))
        : round(first.balance_after! - Math.abs(first.amount));
    derived.push("opening");
  }

  if (closing === null && isFigure(last?.balance_after) && last) {
    closing = round(last.balance_after!);
    closingDate = last.booked_date;
    derived.push("closing");
  } else if (closing !== null && isFigure(last?.balance_after) && last) {
    closingDate = last.booked_date;
  }

  return { opening, closing, closingDate, derived };
}

function isFigure(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
