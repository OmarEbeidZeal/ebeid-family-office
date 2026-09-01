/**
 * Repairing the accounts the importer got wrong.
 *
 * Two things went wrong with real files. A NatWest statement whose currency the
 * reader could not name asked its own question, so one account was confirmed
 * twice and its history split down the middle. And two exporters that name no
 * bank in the file — Monzo and Trading 212 — were pooled under a single
 * "imported account", so a current account and a stocks account share one row.
 *
 * Both are recoverable, and neither should need a database console. Merging
 * moves every transaction, statement, holding, trade and remembered identifier
 * onto the account that stays; re-filing moves one statement and the
 * transactions that came from it. Balances are recomputed from the statements
 * that remain, so a figure is never carried by an account that no longer holds
 * the statement it came from.
 */
import { DEBT_ACCOUNT_TYPES } from "../format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const PAGE = 1000;
const CHUNK = 200;

/** PostgREST caps a read at 1,000 rows; a busy current account holds more. */
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 40; page += 1) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/** The part of an import fingerprint that identifies the transaction itself. */
function baseFingerprint(value: string | null): string | null {
  if (!value) return null;
  const hash = value.lastIndexOf("#");
  return hash > 0 ? value.slice(0, hash) : value;
}

type MovableTransaction = {
  id: string;
  booked_date: string;
  import_fingerprint: string | null;
};

/**
 * Move transactions onto another account, dropping the ones that would land on
 * top of a row already there.
 *
 * Two statements from the same account overlap at their edges, so a merge that
 * moved everything blindly would double a week of spending. Only the dates the
 * receiving account already covers are deduplicated, and only up to the number
 * of copies it already holds: a coffee bought twice on the same day stays
 * bought twice.
 */
async function moveTransactions(
  supabase: Client,
  input: { householdId: string; rows: MovableTransaction[]; targetId: string },
): Promise<{ moved: number; duplicatesRemoved: number }> {
  if (!input.rows.length) return { moved: 0, duplicatesRemoved: 0 };

  const held = await fetchAll<MovableTransaction>((from, to) =>
    supabase
      .from("transactions")
      .select("id, booked_date, import_fingerprint")
      .eq("household_id", input.householdId)
      .eq("account_id", input.targetId)
      .order("booked_date", { ascending: true })
      .range(from, to),
  );

  const counts = new Map<string, number>();
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const row of held) {
    const key = baseFingerprint(row.import_fingerprint);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!earliest || row.booked_date < earliest) earliest = row.booked_date;
    if (!latest || row.booked_date > latest) latest = row.booked_date;
  }

  const duplicates: string[] = [];
  const keep: string[] = [];
  for (const row of input.rows) {
    const key = baseFingerprint(row.import_fingerprint);
    const overlaps = Boolean(
      earliest && latest && row.booked_date >= earliest && row.booked_date <= latest,
    );
    const remaining = key ? (counts.get(key) ?? 0) : 0;
    if (key && overlaps && remaining > 0) {
      counts.set(key, remaining - 1);
      duplicates.push(row.id);
      continue;
    }
    keep.push(row.id);
  }

  for (const batch of chunk(duplicates)) {
    // Splits hang off transactions and would orphan otherwise.
    await supabase.from("transaction_splits").delete().in("transaction_id", batch);
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("household_id", input.householdId)
      .in("id", batch);
    if (error) throw new Error(error.message);
  }

  for (const batch of chunk(keep)) {
    const { error } = await supabase
      .from("transactions")
      .update({ account_id: input.targetId })
      .eq("household_id", input.householdId)
      .in("id", batch);
    if (error) throw new Error(error.message);
  }

  return { moved: keep.length, duplicatesRemoved: duplicates.length };
}

/**
 * Restate an account's balance from the statements it actually holds.
 *
 * A figure typed by hand is never overwritten — only one that came from a
 * statement, or one that was never stated at all. When the last statement
 * carrying a closing figure has moved away, the account goes back to saying it
 * does not know rather than keeping a number it can no longer point at.
 */
export async function recomputeAccountBalance(
  supabase: Client,
  householdId: string,
  accountId: string,
): Promise<void> {
  const { data: account } = await supabase
    .from("accounts")
    .select("id, currency, account_type, balance_source")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!account) return;
  if ((account.balance_source ?? "manual") === "manual") return;

  const { data: statement } = await supabase
    .from("statements")
    .select("id, closing_balance, period_end, currency")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .eq("status", "parsed")
    .not("closing_balance", "is", null)
    .not("period_end", "is", null)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!statement) {
    await supabase
      .from("accounts")
      .update({
        current_balance: 0,
        balance_source: "unknown",
        balance_statement_id: null,
        last_balance_update: null,
      })
      .eq("id", accountId)
      .eq("household_id", householdId);
    return;
  }

  const owed = DEBT_ACCOUNT_TYPES.includes(account.account_type);
  const closing = Number(statement.closing_balance);

  await supabase
    .from("accounts")
    .update({
      current_balance: owed ? Math.abs(closing) : closing,
      balance_source: "statement",
      balance_statement_id: statement.id,
      last_balance_update: new Date(`${statement.period_end}T23:59:59Z`).toISOString(),
    })
    .eq("id", accountId)
    .eq("household_id", householdId);
}

/* ----------------------------------------------------------------- merging */

export type MergeOutcome = {
  keptId: string;
  keptNickname: string;
  removedNickname: string;
  transactions: number;
  duplicatesRemoved: number;
  statements: number;
  holdings: number;
  trades: number;
  identifiers: number;
  /** True when the emptied account had to stay, deactivated, rather than go. */
  deactivatedInstead: boolean;
};

export async function mergeAccounts(
  supabase: Client,
  input: { householdId: string; sourceId: string; targetId: string },
): Promise<MergeOutcome> {
  if (input.sourceId === input.targetId) {
    throw new Error("Choose two different accounts to merge.");
  }

  const { data: rows, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", input.householdId)
    .in("id", [input.sourceId, input.targetId]);
  if (error) throw new Error(error.message);

  const source = (rows ?? []).find((row: any) => row.id === input.sourceId);
  const target = (rows ?? []).find((row: any) => row.id === input.targetId);
  if (!source || !target) throw new Error("Both accounts must belong to this household.");

  if (source.currency !== target.currency) {
    throw new Error(
      `These accounts hold different currencies (${source.currency} and ${target.currency}). Merging them would mix the money — move the statements one at a time instead.`,
    );
  }

  /* ------------------------------------------------------- transactions */
  const movable = await fetchAll<MovableTransaction>((from, to) =>
    supabase
      .from("transactions")
      .select("id, booked_date, import_fingerprint")
      .eq("household_id", input.householdId)
      .eq("account_id", input.sourceId)
      .order("booked_date", { ascending: true })
      .range(from, to),
  );

  const moved = await moveTransactions(supabase, {
    householdId: input.householdId,
    rows: movable,
    targetId: input.targetId,
  });

  /* --------------------------------------------- statements and holdings */
  const counted = async (table: string, patch: Record<string, unknown>) => {
    const { data, error: updateError } = await supabase
      .from(table)
      .update(patch)
      .eq("household_id", input.householdId)
      .eq("account_id", input.sourceId)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    return (data ?? []).length as number;
  };

  const statements = await counted("statements", { account_id: input.targetId });
  const holdings = await counted("holdings", { account_id: input.targetId });
  const trades = await counted("trades", { account_id: input.targetId });

  /* -------------------------------------------------------- identifiers */
  const { data: heldIdentifiers } = await supabase
    .from("account_identifiers")
    .select("identifier_hash")
    .eq("household_id", input.householdId)
    .eq("account_id", input.targetId);
  const heldHashes = new Set(
    ((heldIdentifiers ?? []) as Array<{ identifier_hash: string }>).map(
      (row) => row.identifier_hash,
    ),
  );

  const { data: sourceIdentifiers } = await supabase
    .from("account_identifiers")
    .select("id, identifier_hash")
    .eq("household_id", input.householdId)
    .eq("account_id", input.sourceId);

  let identifiers = 0;
  for (const row of (sourceIdentifiers ?? []) as Array<{ id: string; identifier_hash: string }>) {
    if (heldHashes.has(row.identifier_hash)) {
      await supabase.from("account_identifiers").delete().eq("id", row.id);
      continue;
    }
    await supabase
      .from("account_identifiers")
      .update({ account_id: input.targetId })
      .eq("id", row.id);
    identifiers += 1;
  }

  /* ---------------------------------------------------------- proposals */
  await supabase
    .from("account_proposals")
    .update({ resolved_account_id: input.targetId })
    .eq("household_id", input.householdId)
    .eq("resolved_account_id", input.sourceId);
  await supabase
    .from("account_proposals")
    .update({ matched_account_id: input.targetId })
    .eq("household_id", input.householdId)
    .eq("matched_account_id", input.sourceId);

  /* ------------------------------------------- what the survivor inherits */
  const patch: Record<string, unknown> = {};
  const inherit = (field: string) => {
    if (!target[field] && source[field]) patch[field] = source[field];
  };
  inherit("institution");
  inherit("institution_domain");
  inherit("identifier_mask");
  inherit("statement_holder");
  inherit("owner_profile_id");
  if (target.discovered_from === "manual" && source.discovered_from === "statement") {
    patch["discovered_from"] = "statement";
  }
  if (Object.keys(patch).length) {
    await supabase
      .from("accounts")
      .update(patch)
      .eq("id", input.targetId)
      .eq("household_id", input.householdId);
  }

  /* -------------------------------------------------------------- tidy up */
  await supabase
    .from("accounts")
    .update({ balance_statement_id: null })
    .eq("id", input.sourceId)
    .eq("household_id", input.householdId);

  let deactivatedInstead = false;
  const { error: deleteError } = await supabase
    .from("accounts")
    .delete()
    .eq("id", input.sourceId)
    .eq("household_id", input.householdId);
  if (deleteError) {
    deactivatedInstead = true;
    await supabase
      .from("accounts")
      .update({ is_active: false, nickname: `${source.nickname} (merged)` })
      .eq("id", input.sourceId)
      .eq("household_id", input.householdId);
  }

  // The survivor's balance now follows the newest statement it holds, which may
  // be one that just arrived from the account that went.
  await recomputeAccountBalance(supabase, input.householdId, input.targetId);

  return {
    keptId: input.targetId,
    keptNickname: target.nickname,
    removedNickname: source.nickname,
    transactions: moved.moved,
    duplicatesRemoved: moved.duplicatesRemoved,
    statements,
    holdings,
    trades,
    identifiers,
    deactivatedInstead,
  };
}

/* ----------------------------------------------------------- re-filing one */

export type RefileOutcome = {
  transactions: number;
  duplicatesRemoved: number;
  fileName: string | null;
  accountNickname: string;
};

/**
 * Move one statement, and everything it imported, to another account.
 *
 * This is the tool for a pooled account: the Trading 212 exports leave, the
 * Monzo history stays, and both accounts restate their balance from the
 * statements they are left holding.
 */
export async function refileStatement(
  supabase: Client,
  input: { householdId: string; statementId: string; accountId: string },
): Promise<RefileOutcome> {
  const { data: statement } = await supabase
    .from("statements")
    .select("id, account_id, file_name, currency")
    .eq("id", input.statementId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (!statement) throw new Error("That statement is not part of this household.");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, nickname, currency")
    .eq("id", input.accountId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (!account) throw new Error("That account is not part of this household.");

  if (statement.account_id === input.accountId) {
    return {
      transactions: 0,
      duplicatesRemoved: 0,
      fileName: statement.file_name,
      accountNickname: account.nickname,
    };
  }

  if (statement.currency && statement.currency !== account.currency) {
    throw new Error(
      `This statement is in ${statement.currency} and ${account.nickname} holds ${account.currency}. Choose an account in the same currency.`,
    );
  }

  const movable = await fetchAll<MovableTransaction>((from, to) =>
    supabase
      .from("transactions")
      .select("id, booked_date, import_fingerprint")
      .eq("household_id", input.householdId)
      .eq("statement_id", input.statementId)
      .order("booked_date", { ascending: true })
      .range(from, to),
  );

  const moved = await moveTransactions(supabase, {
    householdId: input.householdId,
    rows: movable,
    targetId: input.accountId,
  });

  const previous: string | null = statement.account_id;

  // Orders read from this file belong wherever the file belongs; a holding whose
  // every trade has moved moves with them, so a position is never split across
  // the account it was bought in and the one the file now sits under.
  const orders = await fetchAll<{ id: string; holding_id: string }>((from, to) =>
    supabase
      .from("trades")
      .select("id, holding_id")
      .eq("household_id", input.householdId)
      .eq("statement_id", input.statementId)
      .range(from, to),
  );
  if (orders.length) {
    for (const batch of chunk(orders.map((row) => row.id))) {
      const { error: tradeError } = await supabase
        .from("trades")
        .update({ account_id: input.accountId })
        .eq("household_id", input.householdId)
        .in("id", batch);
      if (tradeError) throw new Error(tradeError.message);
    }

    for (const holdingId of Array.from(new Set(orders.map((row) => row.holding_id)))) {
      const { count } = await supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("household_id", input.householdId)
        .eq("holding_id", holdingId)
        .neq("account_id", input.accountId);
      if ((count ?? 0) > 0) continue;
      await supabase
        .from("holdings")
        .update({ account_id: input.accountId })
        .eq("id", holdingId)
        .eq("household_id", input.householdId);
    }
  }

  const { error } = await supabase
    .from("statements")
    .update({ account_id: input.accountId })
    .eq("id", input.statementId)
    .eq("household_id", input.householdId);
  if (error) throw new Error(error.message);

  // An account whose balance came from this statement must not keep the figure.
  if (previous) {
    await supabase
      .from("accounts")
      .update({ balance_statement_id: null })
      .eq("id", previous)
      .eq("household_id", input.householdId)
      .eq("balance_statement_id", input.statementId);
    await recomputeAccountBalance(supabase, input.householdId, previous);
  }
  await recomputeAccountBalance(supabase, input.householdId, input.accountId);

  return {
    transactions: moved.moved,
    duplicatesRemoved: moved.duplicatesRemoved,
    fileName: statement.file_name,
    accountNickname: account.nickname,
  };
}

export type UnfileOutcome = {
  removed: number;
  trades: number;
  holdingsRemoved: number;
  fileName: string | null;
  accountNickname: string | null;
};

/**
 * Take back the orders a broker export wrote.
 *
 * A holding's quantity, average cost and realised profit come from its trades,
 * so removing the trades is enough — the database recomputes the position. A
 * name that existed only because this file mentioned it goes with the file; one
 * the household typed in stays, minus the trades this file added.
 */
async function unwindTrades(
  supabase: Client,
  householdId: string,
  statementId: string,
): Promise<{ trades: number; holdingsRemoved: number }> {
  const rows = await fetchAll<{ id: string; holding_id: string }>((from, to) =>
    supabase
      .from("trades")
      .select("id, holding_id")
      .eq("household_id", householdId)
      .eq("statement_id", statementId)
      .range(from, to),
  );
  if (!rows.length) return { trades: 0, holdingsRemoved: 0 };

  const holdingIds = Array.from(new Set(rows.map((row) => row.holding_id)));

  for (const batch of chunk(rows.map((row) => row.id))) {
    const { error } = await supabase
      .from("trades")
      .delete()
      .eq("household_id", householdId)
      .in("id", batch);
    if (error) throw new Error(error.message);
  }

  let holdingsRemoved = 0;
  for (const holdingId of holdingIds) {
    const { count } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("holding_id", holdingId);
    if ((count ?? 0) > 0) continue;

    const { data: holding } = await supabase
      .from("holdings")
      .select("id, discovered_from")
      .eq("id", holdingId)
      .eq("household_id", householdId)
      .maybeSingle();
    if (!holding) continue;

    if (holding.discovered_from === "statement") {
      await supabase.from("holdings").delete().eq("id", holdingId).eq("household_id", householdId);
      holdingsRemoved += 1;
      continue;
    }

    // A hand-entered position keeps its own figures, but the shares an import
    // inferred were held before the file begins are the file's claim, not the
    // household's.
    await supabase
      .from("holdings")
      .update({ opening_quantity: 0, opening_cost: null, position_evidence: null })
      .eq("id", holdingId)
      .eq("household_id", householdId);
  }

  return { trades: rows.length, holdingsRemoved };
}

/**
 * Undo an import, so the file can be read as if it had never arrived.
 *
 * "Move" is for a file that was read correctly and filed in the wrong place.
 * This is for the other case: the file was read wrongly — a Monzo Flex export
 * pooled with a current account, every repayment between the two counted as
 * spending — and no amount of moving rows fixes rows that should never have
 * been written that way. The transactions this file produced are removed, the
 * file lets go of its account, and it goes back into the queue for a reader
 * that now understands it. What other files imported is untouched.
 */
export async function unfileStatement(
  supabase: Client,
  input: { householdId: string; statementId: string },
): Promise<UnfileOutcome> {
  const { data: statement } = await supabase
    .from("statements")
    .select("id, account_id, file_name")
    .eq("id", input.statementId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (!statement) throw new Error("That statement is not part of this household.");

  const doomed = await fetchAll<{ id: string }>((from, to) =>
    supabase
      .from("transactions")
      .select("id")
      .eq("household_id", input.householdId)
      .eq("statement_id", input.statementId)
      .range(from, to),
  );

  for (const batch of chunk(doomed.map((row) => row.id))) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("household_id", input.householdId)
      .in("id", batch);
    if (error) throw new Error(error.message);
  }

  const previous: string | null = statement.account_id;
  let nickname: string | null = null;

  if (previous) {
    const { data: account } = await supabase
      .from("accounts")
      .select("nickname")
      .eq("id", previous)
      .eq("household_id", input.householdId)
      .maybeSingle();
    nickname = account?.nickname ?? null;

    // A balance this file supplied leaves with it, rather than lingering as a
    // figure whose statement is no longer there.
    await supabase
      .from("accounts")
      .update({ balance_statement_id: null })
      .eq("id", previous)
      .eq("household_id", input.householdId)
      .eq("balance_statement_id", input.statementId);
  }

  const { error: detached } = await supabase
    .from("statements")
    .update({
      account_id: null,
      proposal_id: null,
      status: "queued",
      attempts: 0,
      next_attempt_at: null,
      locked_at: null,
      error_message: null,
      parsed_at: null,
      file_hash: null,
      transaction_count: null,
      duplicate_count: 0,
      discrepancy: null,
      opening_balance: null,
      closing_balance: null,
      summary: null,
      // What the last reader thought it saw is cleared too: a file misread as
      // nameless must be free to name its bank on the next pass.
      detected_institution: null,
      detected_institution_domain: null,
      detected_holder: null,
      detected_last4: null,
      detected_identifier_kind: null,
      detected_country: null,
      detected_account_type: null,
      match_confidence: null,
      match_reason: null,
    })
    .eq("id", input.statementId)
    .eq("household_id", input.householdId);
  if (detached) throw new Error(detached.message);

  const orders = await unwindTrades(supabase, input.householdId, input.statementId);

  if (previous) await recomputeAccountBalance(supabase, input.householdId, previous);

  return {
    removed: doomed.length,
    trades: orders.trades,
    holdingsRemoved: orders.holdingsRemoved,
    fileName: statement.file_name,
    accountNickname: nickname,
  };
}
