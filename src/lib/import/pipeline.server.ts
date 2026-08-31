/**
 * One statement, start to finish.
 *
 * The order matters: hash the file before spending anything on it (the same
 * export dragged in twice is the commonest mistake), cache the extraction so a
 * statement whose account is confirmed tomorrow is not read again at cost, and
 * only import into an account the household has actually confirmed.
 */
import { bankDomain, findBank } from "../ai/banks";
import {
  EMPTY_IDENTITY,
  type ExtractionResult,
  type StatementIdentity,
} from "../statement-extract.server";
import {
  downloadStatementFile,
  extractStatementContent,
  importExtracted,
  StatementFailure,
  type ImportResult,
  type LoadedStatementFile,
} from "../statement-import.server";
import {
  candidateLastFourHashes,
  identityCountry,
  loadAccountCandidates,
  matchAccount,
  maskIdentifier,
  normaliseIdentifier,
  proposalFingerprint,
  rememberIdentifier,
  type NormalisedIdentifier,
} from "./identity.server";
import { formatLabel } from "./formats";
import { failStatement, releaseStatement, type QueuedStatement } from "./queue.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

export type ProcessOutcome =
  | { kind: "imported"; result: ImportResult }
  | { kind: "awaiting_account"; proposalId: string | null; reason: string }
  | { kind: "duplicate"; message: string }
  | { kind: "failed"; message: string };

/* ------------------------------------------------------------ file hashing */

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/* ----------------------------------------------------- extraction caching */

function cachePath(filePath: string): string {
  return `${filePath}.extract.json`;
}

/**
 * A file yields a list of statements, not one: a CAMT.053 export routinely
 * carries several accounts, and an MT940 file several periods. The cache holds
 * the whole list so the siblings never re-read the file.
 */
async function readCachedExtraction(
  supabase: Client,
  filePath: string,
): Promise<ExtractionResult[] | null> {
  const { data } = await supabase.storage.from("statements").download(cachePath(filePath));
  if (!data) return null;
  try {
    const parsed = JSON.parse(await data.text()) as ExtractionResult[] | ExtractionResult;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    if (!list.length) return null;
    return list.every((entry) => Array.isArray(entry?.transactions)) ? list : null;
  } catch {
    return null;
  }
}

async function writeCachedExtraction(
  supabase: Client,
  filePath: string,
  extractions: ExtractionResult[],
): Promise<void> {
  await supabase.storage
    .from("statements")
    .upload(
      cachePath(filePath),
      new Blob([JSON.stringify(extractions)], { type: "application/json" }),
      {
        upsert: true,
        contentType: "application/json",
      },
    );
}

export async function removeCachedExtraction(supabase: Client, filePath: string): Promise<void> {
  await supabase.storage.from("statements").remove([cachePath(filePath)]);
}

/* ------------------------------------------------------------- proposals */

function suggestNickname(identity: StatementIdentity, mask: string | null): string {
  const bank = findBank(identity.institution)?.name ?? identity.institution ?? "Imported account";
  const type = identity.account_type
    ? identity.account_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const tail = mask ? mask.replace(/^•+\s*/, "···· ") : null;
  return [bank, type, tail].filter(Boolean).join(" ").slice(0, 80);
}

export type ProposalRow = {
  id: string;
  status: string;
  resolved_account_id: string | null;
  matched_account_id: string | null;
  match_confidence: number;
  match_reason: string | null;
};

async function upsertProposal(
  supabase: Client,
  input: {
    householdId: string;
    identity: StatementIdentity;
    identifier: NormalisedIdentifier | null;
    currency: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    openingBalance: number | null;
    closingBalance: number | null;
    match: { account_id: string | null; confidence: number; reason: string };
  },
): Promise<ProposalRow> {
  const fingerprint = proposalFingerprint({
    institution: input.identity.institution,
    identifierHash: input.identifier?.hash ?? null,
    lastFour: input.identifier?.lastFour ?? null,
    currency: input.currency,
  });

  const { data: existing } = await supabase
    .from("account_proposals")
    .select(
      "id, status, resolved_account_id, matched_account_id, match_confidence, match_reason, statement_count",
    )
    .eq("household_id", input.householdId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  const payload = {
    household_id: input.householdId,
    fingerprint,
    institution: input.identity.institution,
    institution_domain: bankDomain(input.identity.institution),
    holder: input.identity.statement_holder,
    identifier_kind: input.identifier?.kind ?? null,
    identifier_last4: input.identifier?.lastFour ?? null,
    identifier_hash: input.identifier?.hash ?? null,
    currency: input.currency,
    country: identityCountry(input.identity, input.currency),
    account_type: input.identity.account_type,
    suggested_nickname: suggestNickname(input.identity, input.identifier?.mask ?? null),
    opening_balance: input.openingBalance,
    closing_balance: input.closingBalance,
    closing_balance_date: input.periodEnd,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    matched_account_id: input.match.account_id,
    match_confidence: input.match.confidence,
    match_reason: input.match.reason,
  };

  if (existing) {
    const { data } = await supabase
      .from("account_proposals")
      .update({
        ...payload,
        // A decision already taken is never overwritten by a later file.
        ...(existing.status === "pending"
          ? {}
          : {
              matched_account_id: existing.matched_account_id,
              match_confidence: existing.match_confidence,
              match_reason: existing.match_reason,
            }),
        statement_count: (existing.statement_count ?? 0) + 1,
        closing_balance_date: input.periodEnd ?? existing["closing_balance_date"],
      })
      .eq("id", existing.id)
      .select("id, status, resolved_account_id, matched_account_id, match_confidence, match_reason")
      .maybeSingle();
    return (data ?? existing) as ProposalRow;
  }

  const { data, error } = await supabase
    .from("account_proposals")
    .insert({ ...payload, statement_count: 1, status: "pending" })
    .select("id, status, resolved_account_id, matched_account_id, match_confidence, match_reason")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ProposalRow;
}

/* ------------------------------------------------------- multi-statement */

/**
 * One file, several statements.
 *
 * A CAMT.053 export commonly carries every account the bank holds for you, and
 * an MT940 file a run of monthly periods. Each is its own statement: its own
 * account, its own opening and closing balance, its own reconciliation. So the
 * uploaded row keeps the first, and the rest are created here as siblings that
 * the queue picks up like any other file.
 *
 * Done once: a retry finds the siblings already there and leaves them alone.
 */
async function fanOutStatements(
  supabase: Client,
  statement: Record<string, any>,
  results: ExtractionResult[],
): Promise<void> {
  const count = results.length;
  if (count < 2) {
    if ((statement["statement_count"] ?? 1) !== 1) {
      await supabase
        .from("statements")
        .update({ statement_index: 0, statement_count: 1 })
        .eq("id", statement["id"]);
    }
    return;
  }

  const { data: siblings } = await supabase
    .from("statements")
    .select("id")
    .eq("household_id", statement["household_id"])
    .eq("file_path", statement["file_path"])
    .neq("id", statement["id"])
    .limit(1);

  await supabase
    .from("statements")
    .update({ statement_index: Number(statement["statement_index"] ?? 0), statement_count: count })
    .eq("id", statement["id"]);

  if (siblings?.length) return;

  const rows = results.slice(1).map((result, offset) => ({
    household_id: statement["household_id"],
    account_id: null,
    import_batch_id: statement["import_batch_id"] ?? null,
    uploaded_by: statement["uploaded_by"] ?? null,
    file_path: statement["file_path"],
    file_name: statement["file_name"],
    file_size: statement["file_size"] ?? null,
    // The hash is copied deliberately: it stops each sibling being read as a
    // duplicate of the row it came from, while a genuine re-upload of the same
    // file still matches.
    file_hash: statement["file_hash"] ?? null,
    source_format: result.format ?? null,
    statement_index: offset + 1,
    statement_count: count,
    currency: result.meta.currency ?? null,
    period_start: result.meta.period_start ?? null,
    period_end: result.meta.period_end ?? null,
    status: "queued",
  }));

  const { error } = await supabase.from("statements").insert(rows);
  if (error) return;

  // The batch counts files, and this file just became several of them.
  if (statement["import_batch_id"]) {
    const { data: batch } = await supabase
      .from("import_batches")
      .select("total_files")
      .eq("id", statement["import_batch_id"])
      .maybeSingle();
    if (batch) {
      await supabase
        .from("import_batches")
        .update({ total_files: Number(batch.total_files ?? 1) + rows.length })
        .eq("id", statement["import_batch_id"]);
    }
  }
}

/* ---------------------------------------------------------------- process */

/**
 * Runs one claimed statement to a terminal state. Never throws for an ordinary
 * failure — every outcome is written to the row so the import screen can say
 * what happened.
 */
export async function processStatement(
  supabase: Client,
  claimed: QueuedStatement,
): Promise<ProcessOutcome> {
  const { data: statement } = await supabase
    .from("statements")
    .select("*")
    .eq("id", claimed.id)
    .maybeSingle();
  if (!statement) return { kind: "failed", message: "That statement is no longer in the system." };

  try {
    /* ------------------------------------------------- download and hash */
    let file: LoadedStatementFile | null = null;
    let fileHash: string = statement.file_hash ?? "";

    if (!fileHash) {
      file = await downloadStatementFile(supabase, statement);
      fileHash = await sha256(file.bytes);

      const { data: twin } = await supabase
        .from("statements")
        .select("id, file_name, status")
        .eq("household_id", statement.household_id)
        .eq("file_hash", fileHash)
        .neq("id", statement.id)
        .not("status", "in", "(failed,cancelled,duplicate)")
        .limit(1)
        .maybeSingle();

      if (twin) {
        const message = `This is the same file as ${twin.file_name ?? "one already imported"}, so nothing was read from it again.`;
        await supabase
          .from("statements")
          .update({
            status: "duplicate",
            file_hash: fileHash,
            locked_at: null,
            error_message: message,
            parsed_at: new Date().toISOString(),
          })
          .eq("id", statement.id);
        return { kind: "duplicate", message };
      }

      await supabase.from("statements").update({ file_hash: fileHash }).eq("id", statement.id);
    }

    /* ------------------------------------------------------ extraction */
    let results = await readCachedExtraction(supabase, statement.file_path);
    if (!results) {
      file = file ?? (await downloadStatementFile(supabase, statement));
      results = await extractStatementContent(file);
      await writeCachedExtraction(supabase, statement.file_path, results);
    }
    if (!results.length) {
      throw new StatementFailure(
        "Nothing in this file reads as a bank statement. Check you exported the transaction list from your bank.",
      );
    }

    await fanOutStatements(supabase, statement, results);

    const index = Math.min(Number(statement.statement_index ?? 0), results.length - 1);
    const extraction = results[index]!;

    if (extraction.notes.length) {
      await supabase
        .from("statements")
        .update({ summary: { extraction_notes: extraction.notes } })
        .eq("id", statement.id);
    }

    const identity: StatementIdentity = extraction.meta.identity ?? EMPTY_IDENTITY;
    const currency = extraction.meta.currency;

    // A file the reader understood nothing in is not a statement waiting for an
    // account — it is a file that could not be read, and it says so rather than
    // proposing an account nobody holds.
    const understoodSomething = Boolean(
      identity.institution ||
      identity.account_identifier ||
      extraction.meta.period_start ||
      extraction.meta.period_end ||
      extraction.meta.opening_balance !== null ||
      extraction.meta.closing_balance !== null,
    );
    if (!extraction.transactions.length && !understoodSomething) {
      throw new StatementFailure(
        "Nothing in this file reads as a bank statement — no transactions, no account and no statement period. Check you exported the transaction list from your bank.",
      );
    }
    /* -------------------------------------------------------- identity */
    let identifier: NormalisedIdentifier | null = null;
    try {
      identifier = normaliseIdentifier(identity.account_identifier, identity.identifier_kind);
    } catch {
      // No salt configured: matching degrades to picking the account by hand,
      // which is exactly what the awaiting-account state is for.
      identifier = null;
    }

    const accounts = await loadAccountCandidates(supabase, statement.household_id);
    const match = statement.account_id
      ? {
          account_id: statement.account_id as string,
          confidence: 1,
          reason: "You chose this account for the file.",
        }
      : matchAccount(
          {
            institution: identity.institution,
            identifierHash: identifier?.hash ?? null,
            lastFourHashes: candidateLastFourHashes(identifier?.lastFour ?? null),
            lastFour: identifier?.lastFour ?? null,
            currency,
            country: identityCountry(identity, currency),
          },
          accounts,
        );

    await supabase
      .from("statements")
      .update({
        source_format: extraction.format ?? null,
        detected_institution: identity.institution,
        detected_institution_domain: bankDomain(identity.institution),
        detected_holder: identity.statement_holder,
        detected_last4: identifier?.lastFour ?? null,
        detected_identifier_kind: identifier?.kind ?? null,
        detected_country: identityCountry(identity, currency),
        detected_account_type: identity.account_type,
        match_confidence: match.confidence,
        match_reason: match.reason,
        currency: currency ?? statement.currency,
        period_start: extraction.meta.period_start ?? statement.period_start,
        period_end: extraction.meta.period_end ?? statement.period_end,
      })
      .eq("id", statement.id);

    /* ------------------------------------------------------- proposals */
    let accountId: string | null = statement.account_id ?? null;
    let proposalId: string | null = statement.proposal_id ?? null;

    // A file that names no bank and carries no account number — a QIF export,
    // most often — cannot be proposed as an account: there is nothing to
    // recognise it by, and pooling every such file under one "unknown account"
    // would file two different accounts into the same place. It is asked about
    // on its own row instead.
    const anonymous = !identity.institution && !identifier;

    if (!accountId && !anonymous) {
      const proposal = await upsertProposal(supabase, {
        householdId: statement.household_id,
        identity,
        identifier,
        currency,
        periodStart: extraction.meta.period_start,
        periodEnd: extraction.meta.period_end,
        openingBalance: extraction.meta.opening_balance,
        closingBalance: extraction.meta.closing_balance,
        match,
      });
      proposalId = proposal.id;

      // A decision already made for this account applies to every later file
      // from it — the household is asked once, not once per statement.
      if (proposal.resolved_account_id) accountId = proposal.resolved_account_id;
      // An exact identifier match is the only automatic link. Everything softer
      // is a suggestion the household confirms.
      else if (match.account_id && match.confidence >= 1) accountId = match.account_id;

      await supabase
        .from("statements")
        .update({ proposal_id: proposalId, ...(accountId ? { account_id: accountId } : {}) })
        .eq("id", statement.id);
    }

    if (!accountId) {
      const reason = anonymous
        ? `${formatLabel(extraction.format ?? "qif")} carries no account number and no bank name, so this file cannot be matched on its own — choose the account it belongs to.`
        : match.reason;

      await supabase
        .from("statements")
        .update({
          status: "awaiting_account",
          locked_at: null,
          error_message: anonymous ? reason : null,
          parsed_at: null,
        })
        .eq("id", statement.id);
      return { kind: "awaiting_account", proposalId, reason };
    }

    /* ---------------------------------------------------------- import */
    if (identifier) {
      await rememberIdentifier(supabase, {
        householdId: statement.household_id,
        accountId,
        identifier,
        source: "statement",
      }).catch(() => undefined);
    }

    await supabase
      .from("statements")
      .update({ status: "parsing", error_message: null })
      .eq("id", statement.id);

    const result = await importExtracted(
      supabase,
      { ...statement, account_id: accountId },
      extraction,
    );
    await releaseStatement(supabase, statement.id);

    if (result.status !== "failed") {
      await touchAccountFromStatement(supabase, accountId, extraction, currency);
    }

    return { kind: "imported", result };
  } catch (error) {
    const message =
      error instanceof StatementFailure
        ? error.message
        : error instanceof Error
          ? error.message
          : "The statement could not be read.";
    // A StatementFailure is a verdict about the file: retrying will not change
    // it, so the row is failed outright rather than parked for another go.
    if (error instanceof StatementFailure) {
      await failStatement(supabase, statement.id, message);
      return { kind: "failed", message };
    }
    throw error;
  }
}

/**
 * A statement's closing balance is a better figure than a balance last typed in
 * months ago — but only when this statement is the most recent thing we have
 * seen for the account.
 */
async function touchAccountFromStatement(
  supabase: Client,
  accountId: string,
  extraction: ExtractionResult,
  currency: string | null,
): Promise<void> {
  const closing = extraction.meta.closing_balance;
  const periodEnd = extraction.meta.period_end;
  if (closing === null || !periodEnd) return;

  const { data: account } = await supabase
    .from("accounts")
    .select("currency, last_balance_update, current_balance")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return;
  if (currency && account.currency !== currency) return;

  const statementTime = new Date(`${periodEnd}T23:59:59Z`).getTime();
  const lastUpdate = account.last_balance_update
    ? new Date(account.last_balance_update).getTime()
    : 0;
  if (statementTime <= lastUpdate) return;

  await supabase
    .from("accounts")
    .update({
      current_balance: closing,
      last_balance_update: new Date(`${periodEnd}T23:59:59Z`).toISOString(),
    })
    .eq("id", accountId);
}

export { maskIdentifier };
