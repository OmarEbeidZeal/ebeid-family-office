import { useEffect, useMemo } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Inbox, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { CoverageGaps } from "@/components/import/CoverageGaps";
import { FormatGuide } from "@/components/import/FormatGuide";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { ImportFileRow } from "@/components/import/ImportFileRow";
import { ProposalCard } from "@/components/import/ProposalCard";
import { useAccounts } from "@/hooks/useFinancials";
import { usePrefersReducedMotion } from "@/hooks/useMotion";
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
          "Import CAMT.053, MT940, QIF, CSV, Excel or PDF statements from any UK, Egyptian, Jordanian or US bank. Structured formats are read exactly, matched to an account and reconciled to the penny.",
      },
      { property: "og:title", content: "Import statements — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Statement-led importing: drop the files, confirm the accounts, done. CAMT.053 and MT940 are read from their own schema — nothing inferred.",
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
  const hash = useRouterState({ select: (state) => state.location.hash });
  const reduceMotion = usePrefersReducedMotion();
  const { data: accounts = [] } = useAccounts();
  const { data: statements = [], isLoading } = useImportStatements();
  const { data: batches = [] } = useImportBatches();
  const { data: proposals = [] } = useAccountProposals();
  const { waiting } = useQueueDriver(statements);

  const active = useMemo(
    () =>
      statements.filter((row) => IN_FLIGHT.has(row.status) || row.status === "awaiting_account"),
    [statements],
  );
  const recent = useMemo(
    () => statements.filter((row) => !active.includes(row)).slice(0, RECENT_LIMIT),
    [statements, active],
  );

  // Arriving from an account's "4 months missing" lands on the grid itself,
  // which only exists once the statements have loaded.
  useEffect(() => {
    if (hash !== "coverage" || !statements.length) return;
    const target = document.getElementById("coverage");
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [hash, statements.length, reduceMotion]);

  const batch = batches[0] ?? null;
  const progress = batch
    ? Math.round(((batch.finished_files ?? 0) / Math.max(batch.total_files || 1, 1)) * 100)
    : 0;

  const reviewStatement = (statementId: string) =>
    void navigate({ to: "/transactions", search: { statement: statementId } as never });


  return (
    <AppShell
      title="Import"
      description="Drop in statements and the reader identifies the format, the bank, the account and the period itself. Importing continues on the server, so you can close this tab."
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <ImportDropzone />
          <FormatGuide />
        </div>

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
              body="Drop an export above — CAMT.053 or MT940 if your bank offers them, otherwise CSV, Excel, QIF or PDF. Each file is stored privately, read into transactions in its own currency and converted at each transaction's date."
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
