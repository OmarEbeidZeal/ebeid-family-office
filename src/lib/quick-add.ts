import { useEffect } from "react";

/**
 * Cross-page intents raised by the command palette.
 *
 * The palette navigates, then the destination page picks the intent up on
 * mount and opens the right sheet. Keeping it in a module store rather than a
 * URL parameter means a shared link never re-opens a half-filled form.
 */
export type QuickAddKind =
  | "account"
  | "asset"
  | "liability"
  | "goal"
  | "holding"
  | "income"
  | "expense"
  | "scenario"
  | "import"
  | "document";

type Intent = { kind: QuickAddKind; at: number };

let pending: Intent | null = null;
const listeners = new Set<(intent: Intent) => void>();

/** Intents older than this are stale — a page mounting later must ignore them. */
const TTL_MS = 5000;

export function requestQuickAdd(kind: QuickAddKind) {
  const intent: Intent = { kind, at: Date.now() };
  pending = intent;
  for (const listener of listeners) listener(intent);
}

export function useQuickAdd(kind: QuickAddKind, open: () => void) {
  useEffect(() => {
    if (pending && pending.kind === kind && Date.now() - pending.at < TTL_MS) {
      pending = null;
      open();
    }
    const listener = (intent: Intent) => {
      if (intent.kind !== kind) return;
      pending = null;
      open();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
    // `open` is a fresh closure on every render; the kind is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
}

let pendingSearch: { term: string; at: number } | null = null;
const searchListeners = new Set<(term: string) => void>();

/** Jump to the ledger with a search already applied. */
export function requestTransactionSearch(term: string) {
  pendingSearch = { term, at: Date.now() };
  for (const listener of searchListeners) listener(term);
}

export function useTransactionSearchIntent(apply: (term: string) => void) {
  useEffect(() => {
    if (pendingSearch && Date.now() - pendingSearch.at < TTL_MS) {
      const { term } = pendingSearch;
      pendingSearch = null;
      apply(term);
    }
    const listener = (term: string) => {
      pendingSearch = null;
      apply(term);
    };
    searchListeners.add(listener);
    return () => {
      searchListeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
