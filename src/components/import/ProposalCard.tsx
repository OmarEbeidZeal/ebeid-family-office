import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link2, User, X } from "lucide-react";
import { toast } from "sonner";
import { BankMark } from "@/components/BankMark";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "@/components/forms/FormField";
import { useResolveProposal, type AccountProposalRow } from "@/hooks/useImports";
import { useOwners, memberName } from "@/hooks/useOwners";
import type { AccountRow } from "@/hooks/useFinancials";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  COUNTRIES,
  CURRENCIES,
  formatDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";


function typeFor(detected: string | null): string {
  const value = (detected ?? "").toLowerCase();
  if ((ACCOUNT_TYPES as readonly string[]).includes(value)) return value;
  if (value === "investment" || value === "brokerage") return "gia";
  if (value === "card") return "credit_card";
  return "current";
}

/**
 * One account the statements describe but the household does not yet hold.
 *
 * Answered once, for every file that shares it. Confirming records the salted
 * identifier so the next statement from the same account never asks again.
 */
export function ProposalCard({
  proposal,
  accounts,
}: {
  proposal: AccountProposalRow;
  accounts: AccountRow[];
}) {
  const { options: ownerOptions, matchHolder } = useOwners();
  const resolve = useResolveProposal();

  const [mode, setMode] = useState<"create" | "link">("create");
  const [details, setDetails] = useState(false);
  const [nickname, setNickname] = useState(proposal.suggested_nickname);
  const [accountType, setAccountType] = useState(typeFor(proposal.account_type));
  const [currency, setCurrency] = useState((proposal.currency ?? "GBP").toUpperCase());
  const [country, setCountry] = useState((proposal.country ?? "GB").toUpperCase());
  // The name on the statement decides this, never whoever uploaded the file.
  const [owner, setOwner] = useState("");
  const chosen = useRef(false);
  const [linkTo, setLinkTo] = useState(proposal.matched_account_id ?? accounts[0]?.id ?? "");

  const mask = proposal.identifier_last4
    ? `${proposal.identifier_kind === "iban" ? "IBAN" : proposal.identifier_kind === "card" ? "Card" : "••••"} ${proposal.identifier_last4}`
    : null;

  /**
   * `Acct/Ownr/Nm` on a CAMT.053, the holder line on a PDF. It is the only
   * evidence of whose account this is, so it is shown on its own line and
   * used to fill the owner in — the household still confirms it.
   */
  const likely = matchHolder(proposal.holder);

  useEffect(() => {
    if (chosen.current || !likely) return;
    setOwner(likely.id);
  }, [likely]);

  const ownerHint = likely
    ? `Filled in from the name on the statement — ${proposal.holder}. Change it if that is not right.`
    : proposal.holder
      ? `The statement is in the name of ${proposal.holder}, which matches nobody in the household yet. Say who it belongs to.`
      : "Uploading someone else's statement does not make it yours — say who it belongs to.";

  const period =
    proposal.period_start && proposal.period_end
      ? `${formatDate(proposal.period_start)} – ${formatDate(proposal.period_end)}`
      : null;


  const submit = async (action: "create" | "link" | "reject") => {
    try {
      const result = await resolve.mutateAsync({
        proposalId: proposal.id,
        action,
        ...(action === "link" ? { accountId: linkTo } : {}),
        ...(action === "create"
          ? {
              nickname: nickname.trim() || proposal.suggested_nickname,
              accountType,
              currency,
              country,
              institution: proposal.institution,
              ownership: owner,
            }
          : {}),
      });

      const released = result.requeued
        ? ` · ${result.requeued} statement${result.requeued === 1 ? "" : "s"} back in the queue`
        : "";
      if (action === "reject") toast.success(`Not importing ${proposal.suggested_nickname}`);
      else if (action === "link")
        toast.success(`Merged into an account you already hold${released}`);
      else toast.success(`${nickname || proposal.suggested_nickname} added${released}`);
    } catch (error) {
      toast.error("That could not be saved", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const busy = resolve.isPending;

  return (
    <div className="hairline rounded-lg bg-surface p-4">
      <div className="flex items-start gap-3">
        <BankMark
          institution={proposal.institution}
          domain={proposal.institution_domain}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {proposal.institution ?? "Unnamed institution"}
            {mask && <span className="num ml-2 text-muted-foreground">{mask}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              proposal.holder,
              (proposal.currency ?? "").toUpperCase() || null,
              period,
              `${proposal.statement_count} file${proposal.statement_count === 1 ? "" : "s"} waiting`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {proposal.reason && (
            <p className="mt-1 text-[0.7rem] text-muted-foreground">{proposal.reason}</p>
          )}
        </div>
        {proposal.closing_balance !== null && (
          <div className="hidden text-right sm:block">
            <p className="eyebrow text-muted-foreground">Closing</p>
            <Money
              amount={proposal.closing_balance}
              currency={(proposal.currency ?? "GBP").toUpperCase()}
              className="text-sm"
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={cn(
            "min-h-9 rounded-md border px-3 text-xs transition-colors",
            mode === "create"
              ? "border-gold-line bg-gold-soft text-gold"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Add as a new account
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          disabled={accounts.length === 0}
          className={cn(
            "min-h-9 rounded-md border px-3 text-xs transition-colors disabled:opacity-40",
            mode === "link"
              ? "border-gold-line bg-gold-soft text-gold"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          It's one we already hold
        </button>
      </div>

      {mode === "create" ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Account name">
              <Input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Type">
              <SelectNative
                value={accountType}
                onChange={setAccountType}
                options={ACCOUNT_TYPES.map((type) => ({
                  value: type,
                  label: ACCOUNT_TYPE_LABELS[type] ?? type,
                }))}
              />
            </Field>
          </div>

          <Field
            label="Whose account is this?"
            hint={
              holderHint ??
              "Uploading someone else's statement does not make it yours — say who it belongs to."
            }
          >
            <SelectNative
              value={owner}
              onChange={setOwner}
              options={[{ value: "", label: "Choose a person…" }, ...ownerOptions]}
            />
          </Field>

          <button
            type="button"
            onClick={() => setDetails((open) => !open)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("size-3 transition-transform", details && "rotate-180")} />
            Currency and country
          </button>

          {details && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Currency">
                <SelectNative
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                />
              </Field>
              <Field label="Country">
                <SelectNative
                  value={country}
                  onChange={setCountry}
                  options={COUNTRIES.map((entry) => ({ value: entry.code, label: entry.label }))}
                />
              </Field>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <Field label="Merge these statements into">
            <SelectNative
              value={linkTo}
              onChange={setLinkTo}
              options={accounts.map((account) => ({
                value: account.id,
                label: `${account.nickname}${account.institution ? ` · ${account.institution}` : ""} · ${account.currency}`,
              }))}
            />
          </Field>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || (mode === "link" && !linkTo) || (mode === "create" && !owner)}
          onClick={() => void submit(mode)}
          className="min-h-9"
        >
          {mode === "create" ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
          {mode === "create" ? "Add account and import" : "Merge and import"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void submit("reject")}
          className="min-h-9 text-muted-foreground"
        >
          <X className="size-3.5" /> Don't import
        </Button>
      </div>
    </div>
  );
}
