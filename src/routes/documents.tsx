import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileStack, Loader2, ShieldCheck, Receipt, Home } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentDropzone } from "@/components/documents/DocumentDropzone";
import { DocumentRow } from "@/components/documents/DocumentRow";
import {
  useDocumentQueueDriver,
  useDocuments,
  useInsurancePolicies,
  usePayslips,
  useTenancies,
  type DocumentRow as Row,
} from "@/hooks/useDocuments";
import { useImportStatements, useQueueDriver } from "@/hooks/useImports";
import { useCurrency } from "@/hooks/useCurrency";
import { formatMoney } from "@/lib/format";
import { documentOutcome } from "@/lib/documents/outcome";
import {
  INSURANCE_TYPE_LABELS,
  RENT_FREQUENCY_LABELS,
  type DocType,
  type InsuranceType,
  type RentFrequency,
} from "@/lib/documents/types";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Ebeid Family Office" },
      {
        name: "description",
        content:
          "One place for every financial document the household holds: policy schedules, tenancy agreements, payslips and bank statements, read once and turned into figures.",
      },
      { property: "og:title", content: "Documents — Ebeid Family Office" },
      {
        property: "og:description",
        content:
          "Drop in a policy, a tenancy or a payslip. The type is recognised, the numbers are extracted, and the household's cover, rent and income update themselves.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentsPage,
});

type Filter = "all" | DocType;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "insurance_policy", label: "Insurance" },
  { value: "tenancy", label: "Tenancies" },
  { value: "payslip", label: "Payslips" },
  { value: "bank_statement", label: "Statements" },
  { value: "other", label: "Other" },
];

function DocumentsPage() {
  const navigate = useNavigate();
  const { base } = useCurrency();
  const documents = useDocuments();
  const policies = useInsurancePolicies();
  const tenancies = useTenancies();
  const payslips = usePayslips();
  const statements = useImportStatements();
  const { waiting: readingDocs } = useDocumentQueueDriver(documents.data);
  // A statement handed over by the shelf keeps moving while the shelf is open,
  // exactly as it would on the import screen.
  const { waiting: importing } = useQueueDriver(statements.data);
  const [filter, setFilter] = useState<Filter>("all");

  const rows = documents.data ?? [];

  const statementsById = useMemo(
    () => new Map((statements.data ?? []).map((row) => [row.id, row])),
    [statements.data],
  );

  /** The truthful state of each row: the statement queue's, when there is one. */
  const outcomeFor = useMemo(
    () => (document: Row) =>
      documentOutcome(document, document.statement_id ? statementsById.get(document.statement_id) : null),
    [statementsById],
  );

  /**
   * What each document produced, in one line. Read from the derived row rather
   * than from the extraction, so the shelf shows what was actually kept.
   */
  const detailFor = useMemo(() => {
    const byPolicy = new Map((policies.data ?? []).map((row) => [row.id, row]));
    const byTenancy = new Map((tenancies.data ?? []).map((row) => [row.id, row]));
    const byPayslip = new Map((payslips.data ?? []).map((row) => [row.id, row]));

    return (document: Row): string | null => {
      // A statement's product is transactions, and it lives on the statement
      // row rather than in `record_id`.
      if (document.statement_id) {
        const statement = statementsById.get(document.statement_id);
        if (!statement) return null;
        const bits: string[] = [];
        if (statement.detected_institution) bits.push(statement.detected_institution);
        if (statement.detected_last4) bits.push(`•••• ${statement.detected_last4}`);
        if (statement.transaction_count) {
          const dupes = statement.duplicate_count ?? 0;
          bits.push(
            `${statement.transaction_count} transaction${statement.transaction_count === 1 ? "" : "s"}${
              dupes > 0 ? `, ${dupes} already held` : ""
            }`,
          );
        }
        return bits.length ? bits.join(" · ") : null;
      }

      if (!document.record_id) return null;

      const policy = byPolicy.get(document.record_id);
      if (policy) {
        const type = INSURANCE_TYPE_LABELS[policy.policy_type as InsuranceType] ?? policy.policy_type;
        const cover =
          policy.sum_assured !== null
            ? formatMoney(policy.sum_assured, policy.currency, { decimals: 0 })
            : policy.benefit_amount !== null
              ? formatMoney(policy.benefit_amount, policy.currency, { decimals: 0 })
              : null;
        return [policy.insurer, type, cover].filter(Boolean).join(" · ");
      }

      const tenancy = byTenancy.get(document.record_id);
      if (tenancy) {
        const rent =
          tenancy.rent_amount !== null
            ? `${formatMoney(tenancy.rent_amount, tenancy.currency, { decimals: 0 })} ${
                RENT_FREQUENCY_LABELS[tenancy.rent_frequency as RentFrequency] ?? ""
              }`.trim()
            : null;
        return [tenancy.property_address, rent].filter(Boolean).join(" · ");
      }

      const payslip = byPayslip.get(document.record_id);
      if (payslip) {
        const gross =
          payslip.gross_pay !== null
            ? `${formatMoney(payslip.gross_pay, payslip.currency, { decimals: 0 })} gross`
            : null;
        return [payslip.employer, gross, payslip.tax_code].filter(Boolean).join(" · ");
      }

      return null;
    };
  }, [policies.data, tenancies.data, payslips.data, statementsById]);

  const needsYou = rows.filter((row) => outcomeFor(row).needsYou);
  const rest = rows.filter((row) => !outcomeFor(row).needsYou);
  const shown =
    filter === "all"
      ? rest
      : rest.filter((row) => (row.doc_type ?? row.type_hint ?? row.detected_type) === filter);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rest) {
      const key = row.doc_type ?? row.type_hint ?? row.detected_type ?? "other";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [rest]);

  const openRecord = (document: Row) => {
    const type = document.doc_type ?? document.type_hint ?? document.detected_type;
    if (document.statement_id) void navigate({ to: "/import" });
    else if (type === "insurance_policy") void navigate({ to: "/protection" });
    else if (type === "tenancy") void navigate({ to: "/tenancy" });
    else if (type === "payslip") void navigate({ to: "/pay" });
    else if (type === "bank_statement") void navigate({ to: "/import" });
  };

  const loading = documents.isLoading;
  const busy = readingDocs + importing;


  return (
    <AppShell
      title="Documents"
      description="Everything on paper, read once and turned into figures."
      actions={
        busy > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-gold">
            <Loader2 className="size-3 animate-spin" />
            Reading {busy}
          </span>
        ) : null
      }

    >
      <div className="space-y-6">
        <DocumentDropzone />

        {/* Where each kind of document ends up. Named, so the shelf is a route
            through the app rather than a dead end. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <ShelfLink
            to="/protection"
            icon={<ShieldCheck className="size-3.5" strokeWidth={1.5} />}
            label="Protection"
            count={policies.data?.length ?? 0}
            noun="policy"
            plural="policies"
          />
          <ShelfLink
            to="/tenancy"
            icon={<Home className="size-3.5" strokeWidth={1.5} />}
            label="Tenancy"
            count={tenancies.data?.length ?? 0}
            noun="agreement"
            plural="agreements"
          />
          <ShelfLink
            to="/pay"
            icon={<Receipt className="size-3.5" strokeWidth={1.5} />}
            label="Pay and tax"
            count={payslips.data?.length ?? 0}
            noun="payslip"
            plural="payslips"
          />
        </div>

        {needsYou.length > 0 && (
          <section>
            <SectionHeader
              title="Waiting on you"
              description="The reader could not settle these on its own. Confirming a type here is remembered, so a re-read never overrides it; a statement waiting on an account is sorted out on the import screen."
            />
            <ul className="hairline overflow-hidden rounded-lg bg-surface">
              {needsYou.map((row) => (
                <DocumentRow
                  key={row.id}
                  document={row}
                  detail={detailFor(row)}
                  outcome={outcomeFor(row)}
                  onOpenRecord={openRecord}
                />
              ))}
            </ul>
          </section>
        )}


        <section>
          <SectionHeader
            title="On file"
            description="Original files are kept privately and never leave the household. Nothing is deleted when a figure is corrected."
          />

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : rest.length === 0 ? (
            <EmptyState
              icon={<FileStack className="h-4 w-4" />}
              title="Nothing filed yet"
              body="Drop in a life policy schedule, the tenancy agreement, or a few months of payslips. Each one is read once: cover and renewal dates feed the protection view, rent becomes a forecast outgoing and a move date, and payslips drive the running £100,000 income estimate."
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {FILTERS.map((entry) => {
                  const count = entry.value === "all" ? rest.length : (counts.get(entry.value) ?? 0);
                  if (entry.value !== "all" && count === 0) return null;
                  return (
                    <button
                      key={entry.value}
                      type="button"
                      onClick={() => setFilter(entry.value)}
                      className={cn(
                        "min-h-8 rounded-md border px-2.5 text-[0.7rem] transition-colors",
                        filter === entry.value
                          ? "border-gold-line bg-gold-soft text-gold"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {entry.label}
                      <span className="num ml-1.5 opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>

              <ul className="hairline overflow-hidden rounded-lg bg-surface">
                {shown.map((row) => (
                  <DocumentRow
                    key={row.id}
                    document={row}
                    detail={detailFor(row)}
                    outcome={outcomeFor(row)}
                    onOpenRecord={openRecord}
                  />
                ))}
              </ul>


              {shown.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nothing of that kind on file yet.
                </p>
              )}
            </>
          )}
        </section>

        <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
          National Insurance numbers are stripped before anything is stored. Policy, payroll and
          tenancy references are kept only as their last four characters. Figures in {base} are
          converted at the rate held on the day they were read.
        </p>
      </div>
    </AppShell>
  );
}

function ShelfLink({
  to,
  icon,
  label,
  count,
  noun,
  plural,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  noun: string;
  plural: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => void navigate({ to })}
      className="hairline group flex items-center gap-3 rounded-lg bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-muted-foreground group-hover:text-gold">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="num block text-[0.7rem] text-muted-foreground">
          {count} {count === 1 ? noun : plural}
        </span>
      </span>
    </button>
  );
}
