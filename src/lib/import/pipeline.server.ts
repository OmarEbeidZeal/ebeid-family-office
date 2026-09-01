/**
 * One statement, start to finish.
 *
 * The order matters: hash the file before spending anything on it (the same
 * export dragged in twice is the commonest mistake), cache the extraction so a
 * statement whose account is confirmed tomorrow is not read again at cost, and
 * only import into an account the household has actually confirmed.
 */
import { bankDomain, findBank } from "../ai/banks";
import { DEBT_ACCOUNT_TYPES } from "../format";
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
import { chooseProposal } from "./proposal-key";
import { scrubDeep } from "../text";
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

/** Whether a cached reading is worth reusing, or was a misreading. */
function worthKeeping(list: ExtractionResult[]): boolean {
  return list.some((entry) => {
    if (!Array.isArray(entry?.transactions)) return false;
    if (entry.transactions.length) return true;
    const meta = entry.meta ?? null;
    return Boolean(
      meta &&
        (meta.identity?.institution ||
          meta.identity?.account_identifier ||
          meta.period_start ||
          meta.period_end ||
          meta.opening_balance !== null ||
          meta.closing_balance !== null),
    );
  });
}

/**
 * A file yields a list of statements, not one: a CAMT.053 export routinely
 * carries several accounts, and an MT940 file several periods. The cache holds
 * the whole list so the siblings never re-read the file.
 *
 * The cache sits beside the file, in whichever bucket the file was uploaded to.
 *
 * A cache that understood nothing is treated as no cache at all. Otherwise a
 * file the reader could not make sense of once — a format it had not learnt
 * yet — would keep returning that same emptiness long after the reader could
 * do better, and "Retry" would be a button that changes nothing.
 */
async function readCachedExtraction(
  supabase: Client,
  bucket: string,
  filePath: string,
): Promise<ExtractionResult[] | null> {
  const { data } = await supabase.storage.from(bucket).download(cachePath(filePath));
  if (!data) return null;
  try {
    const raw = await data.text();
    // A cache written before the reader learnt to check font maps can carry
    // characters the database refuses — JSON keeps a NUL byte quite happily,
    // Postgres does not. That cache came from a PDF whose glyphs never decoded,
    // so it is not merely unstorable, it is wrong: throw it away and read the
    // file again, where the unmapped-font check now gives an honest answer.
    if (raw.includes("\\u0000") || raw.includes("\u0000")) return null;
    const parsed = JSON.parse(raw) as ExtractionResult[] | ExtractionResult;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    if (!list.length) return null;
    if (!list.every((entry) => Array.isArray(entry?.transactions))) return null;
    if (!worthKeeping(list)) return null;
    return scrubDeep(list);
  } catch {
    return null;
  }
}


async function writeCachedExtraction(
  supabase: Client,
  bucket: string,
  filePath: string,
  extractions: ExtractionResult[],
): Promise<void> {
  // Nothing understood is not worth remembering: writing it would freeze the
  // misreading in place for every later attempt.
  if (!extractions.length || !worthKeeping(extractions)) return;

  await supabase.storage
    .from(bucket)
    .upload(
      cachePath(filePath),
      new Blob([JSON.stringify(extractions)], { type: "application/json" }),
      {
        upsert: true,
        contentType: "application/json",
      },
    );
}


export async function removeCachedExtraction(
  supabase: Client,
  filePath: string,
  bucket = "statements",
): Promise<void> {
  await supabase.storage.from(bucket).remove([cachePath(filePath)]);
}


/* ------------------------------------------------------------- proposals */

/** "Flex" reads as the account the household actually has; "Credit Card" does not. */
const LEDGER_LABELS: Record<string, string> = { flex: "Flex" };

function suggestNickname(identity: StatementIdentity, mask: string | null): string {
  const bank = findBank(identity.institution)?.name ?? identity.institution ?? "Imported account";
  const ledger = identity.ledger ? LEDGER_LABELS[identity.ledger.toLowerCase()] : null;
  const type = identity.account_type
    ? identity.account_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const tail = mask ? mask.replace(/^•+\s*/, "···· ") : null;
  return [bank, ledger ?? type, tail].filter(Boolean).join(" ").slice(0, 80);
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
    ledger: input.identity.ledger ?? null,
  });


  // Proposals are few — a handful per household — so they are read whole and
  // matched here, where a file that could not state its currency can still be
  // recognised as the account it names.
  const { data: known } = await supabase
    .from("account_proposals")
    .select(
      "id, fingerprint, currency, institution, institution_domain, holder, identifier_kind, identifier_last4, identifier_hash, country, account_type, suggested_nickname, opening_balance, closing_balance, closing_balance_date, period_start, period_end, status, resolved_account_id, matched_account_id, match_confidence, match_reason, statement_count",
    )
    .eq("household_id", input.householdId)
    .limit(500);

  const rows = (known ?? []) as Array<Record<string, any>>;
  const choice = chooseProposal({
    fingerprint,
    currency: input.currency,
    existing: rows.map((row) => ({
      id: row["id"] as string,
      fingerprint: row["fingerprint"] as string,
      currency: (row["currency"] ?? null) as string | null,
    })),
  });
  const existing = choice.match ? (rows.find((row) => row["id"] === choice.match!.id) ?? null) : null;

  // Balances belong to the newest period on file; an older statement joining the
  // same proposal extends its span without restating what the account holds now.
  const endsLater =
    !existing?.["period_end"] || (input.periodEnd ?? "") >= (existing["period_end"] as string);
  const startsEarlier =
    !existing?.["period_start"] ||
    (input.periodStart !== null && input.periodStart < (existing["period_start"] as string));

  const nickname = suggestNickname(input.identity, input.identifier?.mask ?? null);

  const payload = {
    household_id: input.householdId,
    fingerprint: choice.fingerprint,
    institution: input.identity.institution ?? existing?.["institution"] ?? null,
    institution_domain:
      bankDomain(input.identity.institution) ?? existing?.["institution_domain"] ?? null,
    holder: input.identity.statement_holder ?? existing?.["holder"] ?? null,
    identifier_kind: input.identifier?.kind ?? existing?.["identifier_kind"] ?? null,
    identifier_last4: input.identifier?.lastFour ?? existing?.["identifier_last4"] ?? null,
    identifier_hash: input.identifier?.hash ?? existing?.["identifier_hash"] ?? null,
    currency: input.currency ?? existing?.["currency"] ?? null,
    country:
      identityCountry(input.identity, input.currency ?? (existing?.["currency"] as string | null)) ??
      existing?.["country"] ??
      null,
    account_type: input.identity.account_type ?? existing?.["account_type"] ?? null,
    suggested_nickname:
      input.identity.institution || !existing?.["suggested_nickname"]
        ? nickname
        : (existing["suggested_nickname"] as string),
    opening_balance: startsEarlier
      ? (input.openingBalance ?? existing?.["opening_balance"] ?? null)
      : (existing?.["opening_balance"] ?? null),
    closing_balance: endsLater
      ? (input.closingBalance ?? existing?.["closing_balance"] ?? null)
      : (existing?.["closing_balance"] ?? null),
    closing_balance_date: endsLater
      ? (input.periodEnd ?? existing?.["closing_balance_date"] ?? null)
      : (existing?.["closing_balance_date"] ?? null),
    period_start: startsEarlier
      ? (input.periodStart ?? existing?.["period_start"] ?? null)
      : (existing?.["period_start"] ?? null),
    period_end: endsLater
      ? (input.periodEnd ?? existing?.["period_end"] ?? null)
      : (existing?.["period_end"] ?? null),
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
        ...(existing["status"] === "pending"
          ? {}
          : {
              matched_account_id: existing["matched_account_id"],
              match_confidence: existing["match_confidence"],
              match_reason: existing["match_reason"],
            }),
        statement_count: ((existing["statement_count"] as number | null) ?? 0) + 1,
      })
      .eq("id", existing["id"])
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
  fileHash: string,
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
    storage_bucket: statement["storage_bucket"] ?? "statements",
    file_path: statement["file_path"],
    file_name: statement["file_name"],
    file_size: statement["file_size"] ?? null,

    // The hash is copied deliberately: it stops each sibling being read as a
    // duplicate of the row it came from, while a genuine re-upload of the same
    // file still matches.
    file_hash: fileHash || (statement["file_hash"] ?? null),

    source_format: result.format ?? null,
    format_version: result.formatVersion ?? null,
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
        // A file holding several statements becomes several rows over the one
        // stored file. Those are not copies of each other — only a separately
        // uploaded file, which lands at its own path, counts as the same file
        // arriving twice.
        .neq("file_path", statement.file_path)
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
    const bucket: string = statement.storage_bucket ?? "statements";
    let results = await readCachedExtraction(supabase, bucket, statement.file_path);
    if (!results) {
      file = file ?? (await downloadStatementFile(supabase, statement));
      results = await extractStatementContent(file);
      await writeCachedExtraction(supabase, bucket, statement.file_path, results);
    }

    if (!results.length) {
      throw new StatementFailure(
        "Nothing in this file reads as a bank statement. Check you exported the transaction list from your bank.",
      );
    }

    await fanOutStatements(supabase, statement, results, fileHash);

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
        format_version: extraction.formatVersion ?? null,
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
      await touchAccountFromStatement(supabase, accountId, statement.id, extraction, currency);
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
    // it, so the row is failed outright rather than parked for another go. The
    // cached reading goes with it — a later attempt, once the reader has learnt
    // the format, must start from the file rather than from this verdict.
    if (error instanceof StatementFailure) {
      await removeCachedExtraction(
        supabase,
        statement.file_path,
        statement.storage_bucket ?? "statements",
      ).catch(() => undefined);
      await failStatement(supabase, statement.id, message);
      return { kind: "failed", message };
    }

    throw error;
  }
}

/**
 * A statement's closing balance is a better figure than a balance last typed in
 * months ago — but only when this statement is the most recent thing we have
 * seen for the account. The account records that the figure came from a
 * statement, so the page can say so rather than implying someone typed it.
 */
async function touchAccountFromStatement(
  supabase: Client,
  accountId: string,
  statementId: string,
  extraction: ExtractionResult,
  currency: string | null,
): Promise<void> {
  const closing = extraction.meta.closing_balance;
  const periodEnd = extraction.meta.period_end;
  if (closing === null || !periodEnd) return;

  const { data: account } = await supabase
    .from("accounts")
    .select("currency, account_type, last_balance_update, current_balance, balance_source, balance_statement_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return;
  if (currency && account.currency !== currency) return;

  const statementTime = new Date(`${periodEnd}T23:59:59Z`).getTime();
  const lastUpdate = account.last_balance_update
    ? new Date(account.last_balance_update).getTime()
    : 0;
  // Reading this same file again may produce a figure the first pass could not
  // find, and an account with no balance at all takes any figure over none.
  const correctingOwnFigure = account.balance_statement_id === statementId;
  const hasNoBalance = account.balance_source === "unknown";
  if (statementTime <= lastUpdate && !correctingOwnFigure && !hasNoBalance) return;


  // Debt is held as the amount owed, positive, everywhere in the app: a card
  // statement closing at -1,240.18 is 1,240.18 owed, not a negative asset.
  const owed = DEBT_ACCOUNT_TYPES.includes(account.account_type);

  await supabase
    .from("accounts")
    .update({
      current_balance: owed ? Math.abs(closing) : closing,
      balance_source: "statement",
      balance_statement_id: statementId,
      last_balance_update: new Date(`${periodEnd}T23:59:59Z`).toISOString(),
    })
    .eq("id", accountId);
}


export { maskIdentifier };
