import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Inbox, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { CoverageGaps } from "@/components/import/CoverageGaps";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { ImportFileRow } from "@/components/import/ImportFileRow";
import { ProposalCard } from "@/components/import/ProposalCard";
import { useAccounts } from "@/hooks/useFinancials";
import {
  IN_FLIGHT,
  useAccountProposals,
  useImportBatches,
  useImportStatements,
  useQueueDriver,
} from "@/hooks/useImports";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Import statements — Ebeid Family Office" },
      {
        name: "description",
        content:
          "Drop in statements from any UK, Egyptian, Jordanian or US bank. Each file is read on the server, matched to an account and imported without losing progress.",
      },
      { property: "og:title", content: "Import statements — Ebeid Family Office" },
      {
        property: "og:description",
        content: "Statement-led importing: drop the files, confirm the accounts, done.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const RECENT_LIMIT = 24;

function ImportPage() {
  const navigate = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const { data: statements = [], isLoading } = useImportStatements();
  const { data: batches = [] } = useImportBatches();
  const { data: proposals = [] } = useAccountProposals();
  const { waiting } = useQueueDriver(statements);

  const active = useMemo(
    () => statements.filter((row) => IN_FLIGHT.has(row.status) || row.status === "awaiting_account"),
    [statements],
  );
  const recent = useMemo(
    () => statements.filter((row) => !active.includes(row)).slice(0, RECENT_LIMIT),
    [statements, active],
  );

  const batch = batches[0] ?? null;
  const progress = batch
    ? Math.round(((batch.finished_files ?? 0) / Math.max(batch.total_files || 1, 1)) * 100)
    : 0;

  const reviewStatement = (statementId: string) =>
    void navigate({ to: "/transactions", search: { statement: statementId } as never });

  return (
    <AppShell
      title="Import"
      description="Drop in statements and the reader identifies the bank, the account and the period itself. Importing continues on the server, so you can close this tab."
    >
      <div className="space-y-8">
        <ImportDropzone />

        {batch && batch.status !== "completed" && (
          <section className="hairline rounded-lg bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs text-foreground">
                {waiting > 0 && <Loader2 className="size-3 animate-spin text-gold" />}
                <span className="num">
                  {batch.finished_files} of {batch.total_files}
                </span>{" "}
                files read
                {batch.imported_transactions > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {batch.imported_transactions.toLocaleString("en-GB")} transactions added
                  </span>
                )}
                {batch.duplicate_transactions > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {batch.duplicate_transactions.toLocaleString("en-GB")} already held
                  </span>
                )}
              </p>
              {batch.message && (
                <p className="text-[0.7rem] text-muted-foreground">{batch.message}</p>
              )}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(progress, waiting ? 4 : 0))}%` }}
              />
            </div>
          </section>
        )}

        {proposals.length > 0 && (
          <section>
            <SectionHeader
              title="Accounts to confirm"
              description="These statements describe accounts you don't hold yet. Confirm each once and every file from it imports — the account is remembered by its masked identifier, never its full number."
            />
            <div className="space-y-3">
              {proposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} accounts={accounts} />
              ))}
            </div>
          </section>
        )}

        {active.length > 0 && (
          <section>
            <SectionHeader
              title="In progress"
              description="Reading happens on the server in small batches, retrying on its own. Nothing is lost if you leave."
            />
            <ul className="hairline rounded-lg bg-surface">
              {active.map((statement) => (
                <ImportFileRow
                  key={statement.id}
                  statement={statement}
                  accounts={accounts}
                  onReview={(row) => reviewStatement(row.id)}
                />
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionHeader title="Imported files" />
          {recent.length === 0 && !isLoading ? (
            <EmptyState
              icon={<Inbox className="size-4" />}
              title="No statements imported yet"
              body="Drop a PDF, CSV or Excel statement above — from Starling, HSBC, CIB, Arab Bank or a US brokerage. Each file is stored privately, read into transactions in its own currency and converted at each transaction's date."
            />
          ) : (
            <ul className="hairline rounded-lg bg-surface">
              {recent.map((statement) => (
                <ImportFileRow
                  key={statement.id}
                  statement={statement}
                  accounts={accounts}
                  onReview={(row) => reviewStatement(row.id)}
                />
              ))}
            </ul>
          )}
        </section>

        <CoverageGaps statements={statements} accounts={accounts} />
      </div>
    </AppShell>
  );
}
