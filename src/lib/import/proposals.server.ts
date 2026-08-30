/**
 * Turning a proposed account into a real one.
 *
 * The household is asked about an account once. Confirming it — as a new
 * account or as one already held — releases every statement waiting on that
 * answer, and records the identifier so the next file from it never asks
 * again.
 */
import { bankDomain } from "../ai/banks";
import { lastFourHash, maskIdentifier, type IdentifierKind } from "./identity.server";
import { refreshBatch } from "./queue.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = any;

const ACCOUNT_TYPES = [
  "current",
  "savings",
  "isa",
  "sipp",
  "gia",
  "crypto",
  "cash",
  "credit_card",
  "loan",
  "mortgage",
] as const;

type AccountType = (typeof ACCOUNT_TYPES)[number];

/** What a statement calls itself, mapped to the types accounts actually hold. */
function accountType(detected: string | null | undefined): AccountType {
  const value = (detected ?? "").toLowerCase();
  if ((ACCOUNT_TYPES as readonly string[]).includes(value)) return value as AccountType;
  if (value === "investment" || value === "brokerage") return "gia";
  if (value === "card") return "credit_card";
  return "current";
}

export type ResolveInput = {
  householdId: string;
  userId: string;
  proposalId: string;
  action: "create" | "link" | "reject";
  accountId?: string | null | undefined;
  nickname?: string | null | undefined;
  accountType?: AccountType | null | undefined;
  currency?: string | null | undefined;
  country?: string | null | undefined;
  institution?: string | null | undefined;
  ownerProfileId?: string | null | undefined;
  isJoint?: boolean | undefined;
};

export type ResolveOutcome = {
  accountId: string | null;
  status: "confirmed" | "merged" | "rejected";
  requeued: number;
};

export async function resolveProposal(
  supabase: Client,
  input: ResolveInput,
): Promise<ResolveOutcome> {
  const { data: proposal } = await supabase
    .from("account_proposals")
    .select("*")
    .eq("id", input.proposalId)
    .eq("household_id", input.householdId)
    .maybeSingle();
  if (!proposal) throw new Error("That proposed account no longer exists.");

  /* ------------------------------------------------------------- reject */
  if (input.action === "reject") {
    await supabase
      .from("account_proposals")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", proposal.id);

    const { data: cancelled } = await supabase
      .from("statements")
      .update({
        status: "cancelled",
        locked_at: null,
        error_message: "You chose not to import this account.",
      })
      .eq("household_id", input.householdId)
      .eq("proposal_id", proposal.id)
      .eq("status", "awaiting_account")
      .select("id, import_batch_id");

    await refreshBatches(supabase, cancelled);
    return { accountId: null, status: "rejected", requeued: 0 };
  }

  /* --------------------------------------------------------- the account */
  let accountId: string;

  if (input.action === "link") {
    if (!input.accountId) throw new Error("Choose the account this statement belongs to.");
    const { data: account } = await supabase
      .from("accounts")
      .select("id, institution, institution_domain, identifier_mask, statement_holder")
      .eq("id", input.accountId)
      .eq("household_id", input.householdId)
      .maybeSingle();
    if (!account) throw new Error("That account is not part of this household.");
    accountId = account.id;

    // Fill in what the account was missing, without overwriting what the
    // household typed themselves.
    const patch: Record<string, unknown> = {};
    if (!account.institution && proposal.institution) {
      patch["institution"] = proposal.institution;
      patch["institution_domain"] = proposal.institution_domain ?? bankDomain(proposal.institution);
    }
    if (!account.identifier_mask && proposal.identifier_last4) {
      patch["identifier_mask"] = maskIdentifier(
        proposal.identifier_last4,
        (proposal.identifier_kind ?? "account_number") as IdentifierKind,
      );
    }
    if (!account.statement_holder && proposal.holder) patch["statement_holder"] = proposal.holder;
    if (Object.keys(patch).length) {
      await supabase.from("accounts").update(patch).eq("id", accountId);
    }
  } else {
    const { data: household } = await supabase
      .from("households")
      .select("base_currency")
      .eq("id", input.householdId)
      .maybeSingle();

    const institution = input.institution ?? proposal.institution ?? null;
    const closingDate = proposal.closing_balance_date ?? proposal.period_end ?? null;

    const { data: created, error } = await supabase
      .from("accounts")
      .insert({
        household_id: input.householdId,
        owner_profile_id: input.ownerProfileId ?? null,
        nickname: (input.nickname ?? proposal.suggested_nickname).slice(0, 80),
        institution,
        institution_domain: institution ? bankDomain(institution) : null,
        statement_holder: proposal.holder,
        identifier_mask: proposal.identifier_last4
          ? maskIdentifier(
              proposal.identifier_last4,
              (proposal.identifier_kind ?? "account_number") as IdentifierKind,
            )
          : null,
        discovered_from: "statement",
        country: (input.country ?? proposal.country ?? "GB").toUpperCase().slice(0, 2),
        account_type: input.accountType ?? accountType(proposal.account_type),
        currency: (input.currency ?? proposal.currency ?? household?.base_currency ?? "GBP")
          .toUpperCase()
          .slice(0, 3),
        current_balance: proposal.closing_balance ?? 0,
        last_balance_update: closingDate
          ? new Date(`${closingDate}T23:59:59Z`).toISOString()
          : new Date().toISOString(),
        is_joint: input.isJoint ?? false,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    accountId = created.id;
  }

  /* ------------------------------------------------------- the identifier */
  if (proposal.identifier_hash || proposal.identifier_last4) {
    const kind = (proposal.identifier_kind ?? "account_number") as IdentifierKind;
    const rows: Array<Record<string, unknown>> = [];
    if (proposal.identifier_hash) {
      rows.push({
        household_id: input.householdId,
        account_id: accountId,
        kind,
        identifier_hash: proposal.identifier_hash,
        last4: proposal.identifier_last4,
        source: "statement",
      });
    }
    if (proposal.identifier_last4) {
      try {
        rows.push({
          household_id: input.householdId,
          account_id: accountId,
          kind,
          identifier_hash: lastFourHash(proposal.identifier_last4, kind),
          last4: proposal.identifier_last4,
          source: "statement",
        });
      } catch {
        // No salt configured — matching stays manual, which is safe.
      }
    }
    if (rows.length) {
      await supabase
        .from("account_identifiers")
        .upsert(rows, { onConflict: "household_id,identifier_hash" });
    }
  }

  /* --------------------------------------------------------- the release */
  const status = input.action === "create" ? "confirmed" : "merged";
  await supabase
    .from("account_proposals")
    .update({
      status,
      resolved_account_id: accountId,
      resolved_at: new Date().toISOString(),
      matched_account_id: proposal.matched_account_id ?? accountId,
    })
    .eq("id", proposal.id);

  const { data: released } = await supabase
    .from("statements")
    .update({
      account_id: accountId,
      status: "queued",
      attempts: 0,
      next_attempt_at: null,
      locked_at: null,
      error_message: null,
    })
    .eq("household_id", input.householdId)
    .eq("proposal_id", proposal.id)
    .in("status", ["awaiting_account", "cancelled"])
    .select("id, import_batch_id");

  await refreshBatches(supabase, released);

  return { accountId, status, requeued: (released ?? []).length };
}

async function refreshBatches(
  supabase: Client,
  rows: Array<{ import_batch_id: string | null }> | null,
): Promise<void> {
  const batches = new Set((rows ?? []).map((row) => row.import_batch_id).filter(Boolean) as string[]);
  for (const batchId of batches) await refreshBatch(supabase, batchId).catch(() => undefined);
}
