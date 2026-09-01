/**
 * Separating the merchant from the transaction type on a UK bank statement.
 *
 * NatWest prints both in one column with nothing between them, so a row reads
 * `TESCO STORES 3241Debit Card Transaction`. Split blindly on whitespace and
 * the merchant keeps the type stuck to it, which means every Tesco visit files
 * under a different payee and none of them group.
 *
 * The types are a closed set the bank chooses from, so the split is exact:
 * find the type, take what is left as the merchant. Pure, so the same routine
 * serves the PDF reader and any deterministic parser written later.
 */

/**
 * NatWest's own set, longest first so `Direct Debit` never wins a row that
 * actually says `Debit Card Transaction`. Other UK banks print several of the
 * same phrases, and none of them appear inside a merchant name.
 */
export const UK_TRANSACTION_TYPES = [
  "Debit Card Transaction",
  "Mobile/Online Transaction",
  "No Description Available",
  "Cash & Dep Machine",
  "Automated Credit",
  "Standing Order",
  "Bill Payment",
  "Direct Debit",
  "Bank Giro Credit",
  "Faster Payment",
  "Cheque Paid In",
  "Point of Sale",
  "Charges",
  "Interest",
] as const;

export type UkTransactionType = (typeof UK_TRANSACTION_TYPES)[number];

/**
 * A phrase matches with any spacing, and `&` may be printed as `and`. Nothing
 * else is loosened: a fuzzy match here would eat part of a merchant name.
 */
function patternFor(type: string): RegExp {
  const body = type
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/^&$/, "(?:&|and)")
        .replace(/\//g, "\\s*/\\s*"),
    )
    .join("\\s*");
  return new RegExp(body, "i");
}

const PATTERNS: Array<{ type: UkTransactionType; pattern: RegExp }> = UK_TRANSACTION_TYPES.map(
  (type) => ({ type, pattern: patternFor(type) }),
);

export type SplitDescription = {
  /** What is left once the type is lifted out — the merchant or narrative. */
  description: string;
  /** The bank's own type, spelled as the bank spells it, or null. */
  type: UkTransactionType | null;
};

/** Trim the punctuation and whitespace a removed phrase leaves behind. */
function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:·—–-]+/, "")
    .replace(/[\s,;:·—–-]+$/, "")
    .trim();
}

/**
 * Lift the transaction type out of a description that ran the two together.
 * Returns the description unchanged, and a null type, when no type is printed.
 */
export function splitDescriptionAndType(raw: string): SplitDescription {
  const text = (raw ?? "").trim();
  if (!text) return { description: "", type: null };

  for (const { type, pattern } of PATTERNS) {
    const match = text.match(pattern);
    if (!match || match.index === undefined) continue;

    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const description = tidy(`${tidy(before)} ${tidy(after)}`);

    // A row that is nothing but its type — NatWest's "No Description
    // Available" — keeps the type as its description; there is nothing else.
    return { description: description || type, type };
  }

  return { description: text, type: null };
}
