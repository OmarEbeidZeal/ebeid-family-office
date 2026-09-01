/**
 * Which proposal a statement belongs to, when the files disagree about detail.
 *
 * The fingerprint that groups statements into one proposed account ends in the
 * currency, so a file whose currency could not be read produces a different key
 * from its own siblings — which is how one NatWest account came to be proposed
 * twice. The currency is the weakest part of the key: a file that states none
 * should join the account its bank and account number already point at, rather
 * than forking a second proposal for the household to answer twice.
 *
 * Ambiguity is never resolved by guessing. Two siblings in different currencies
 * are two real accounts, so a currency-less file joins neither.
 */

export type ExistingProposal = {
  id: string;
  fingerprint: string;
  currency: string | null;
};

/** `institution|identity|CURRENCY` — the currency is the last field. */
export function fingerprintPrefix(fingerprint: string): string {
  const last = fingerprint.lastIndexOf("|");
  return last < 0 ? fingerprint : fingerprint.slice(0, last);
}

function fingerprintCurrency(fingerprint: string): string {
  const last = fingerprint.lastIndexOf("|");
  return last < 0 ? "" : fingerprint.slice(last + 1);
}

export type ProposalChoice = {
  /** The proposal this statement joins, or null when it starts a new one. */
  match: ExistingProposal | null;
  /** The key the proposal should carry afterwards — always the more specific one. */
  fingerprint: string;
};

export function chooseProposal(input: {
  fingerprint: string;
  currency: string | null;
  existing: ExistingProposal[];
}): ProposalChoice {
  const currency = (input.currency ?? "").toUpperCase();
  const exact = input.existing.find((row) => row.fingerprint === input.fingerprint);
  if (exact) return { match: exact, fingerprint: input.fingerprint };

  const prefix = fingerprintPrefix(input.fingerprint);
  // A bank and account number nobody could read is not an identity to group on:
  // every anonymous file would land on the same proposal.
  if (prefix.endsWith("|noid") && prefix.startsWith("unknown|")) {
    return { match: null, fingerprint: input.fingerprint };
  }

  const siblings = input.existing.filter((row) => fingerprintPrefix(row.fingerprint) === prefix);
  if (siblings.length !== 1) return { match: null, fingerprint: input.fingerprint };

  const sibling = siblings[0]!;
  const siblingCurrency = fingerprintCurrency(sibling.fingerprint);

  // This file states no currency: join the one account its identity points at.
  if (!currency) return { match: sibling, fingerprint: sibling.fingerprint };

  // The account on file states none: this file supplies it.
  if (!siblingCurrency) return { match: sibling, fingerprint: input.fingerprint };

  return { match: null, fingerprint: input.fingerprint };
}
