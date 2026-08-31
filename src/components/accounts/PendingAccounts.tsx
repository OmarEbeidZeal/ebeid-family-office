import { Landmark } from "lucide-react";
import { ProposalCard } from "@/components/import/ProposalCard";
import { useAccounts } from "@/hooks/useFinancials";
import { useAccountProposals } from "@/hooks/useImports";

/**
 * Accounts the statements describe that nobody has confirmed yet.
 *
 * It lives at the top of the Accounts page as well as in the import flow:
 * someone who imports on Monday and opens Accounts on Friday has to see that
 * there is something waiting, without going looking for it.
 */
export function PendingAccounts() {
  const { data: proposals = [] } = useAccountProposals();
  const { data: accounts = [] } = useAccounts();

  if (!proposals.length) return null;
  const count = proposals.length;

  return (
    <section
      aria-labelledby="pending-accounts"
      className="rounded-lg border border-gold-line bg-gold-soft p-3 sm:p-4"
    >
      <div className="flex items-start gap-3 px-1 pb-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-gold-line text-gold">
          <Landmark className="size-3.5" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <h2 id="pending-accounts" className="text-sm text-foreground">
            <span className="num">{count}</span> account{count === 1 ? "" : "s"} found in your
            statements, waiting to be confirmed
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Read from the statement headers themselves. Confirm each one and every file from it
            imports; merge it if you already hold it under another name. Only the last four digits
            are ever kept.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {proposals.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} accounts={accounts} />
        ))}
      </div>
    </section>
  );
}
