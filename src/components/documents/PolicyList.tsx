import { FileText, ShieldAlert } from "lucide-react";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { BankMark } from "@/components/BankMark";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { premiumLabel } from "@/hooks/useProtection";
import { useOwners } from "@/hooks/useOwners";
import { formatDate } from "@/lib/format";
import { referenceLabel } from "@/lib/documents/redact";
import {
  BENEFIT_FREQUENCY_LABELS,
  INSURANCE_TYPE_LABELS,
  type BenefitFrequency,
  type InsuranceType,
} from "@/lib/documents/types";
import type { InsurancePolicyRow } from "@/hooks/useDocuments";
import { cn } from "@/lib/utils";

/** Every policy on file, newest cover first, grouped by what it insures. */
export function PolicyList({
  policies,
  onEdit,
}: {
  policies: InsurancePolicyRow[];
  onEdit: (policy: InsurancePolicyRow) => void;
}) {
  const remove = useDeleteRow("insurance_policies", "insurance-policies", "Policy");
  const { nameOf } = useOwners();

  const groups = new Map<string, InsurancePolicyRow[]>();
  for (const policy of policies) {
    const list = groups.get(policy.policy_type) ?? [];
    list.push(policy);
    groups.set(policy.policy_type, list);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([type, rows]) => (
        <section key={type}>
          <p className="eyebrow mb-2">
            {INSURANCE_TYPE_LABELS[type as InsuranceType] ?? type}
            <span className="num ml-2 opacity-60">{rows.length}</span>
          </p>
          <ul className="hairline overflow-hidden rounded-lg bg-surface">
            {rows.map((policy) => {
              const lapsed = policy.status !== "active";
              const cover = policy.sum_assured ?? policy.benefit_amount;
              const coverIsBenefit = policy.sum_assured === null && policy.benefit_amount !== null;

              const facts = [
                policy.insured_person ?? nameOf(policy.owner_profile_id),
                referenceLabel(policy.policy_number_last4),
                policy.premium_amount !== null
                  ? `${premiumLabel(policy.premium_frequency)} premium`
                  : null,
                policy.renewal_date
                  ? `Renews ${formatDate(policy.renewal_date, "short")}`
                  : policy.end_date
                    ? `Ends ${formatDate(policy.end_date, "short")}`
                    : null,
                policy.deferred_period_weeks !== null
                  ? `${policy.deferred_period_weeks}-week wait`
                  : null,
              ].filter(Boolean);

              return (
                <li
                  key={policy.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 border-b border-border px-3 py-3 last:border-0",
                    lapsed && "opacity-60",
                  )}
                >
                  <BankMark institution={policy.insurer} domain={policy.insurer_domain} size={26} />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm text-foreground">
                      <span className="truncate">{policy.insurer}</span>
                      {policy.in_trust === true && (
                        <span className="shrink-0 rounded border border-gain/40 px-1.5 py-px text-[0.6rem] tracking-wide text-gain uppercase">
                          In trust
                        </span>
                      )}
                      {lapsed && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-px text-[0.6rem] tracking-wide text-muted-foreground uppercase">
                          {policy.status}
                        </span>
                      )}
                      {policy.source === "document" && (
                        <span
                          className="shrink-0 text-muted-foreground"
                          title="Read from an uploaded policy schedule"
                        >
                          <FileText className="size-3" />
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{facts.join(" · ")}</p>
                    {policy.needs_review && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] text-warn">
                        <ShieldAlert className="size-3" />
                        Some figures could not be read with confidence — worth checking against the
                        schedule.
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    {cover !== null ? (
                      <>
                        <Money amount={cover} currency={policy.currency} decimals={0} />
                        <p className="text-[0.7rem] text-muted-foreground">
                          {coverIsBenefit
                            ? (BENEFIT_FREQUENCY_LABELS[
                                policy.benefit_frequency as BenefitFrequency
                              ] ?? "benefit")
                            : "sum assured"}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Cover not stated</p>
                    )}
                  </div>

                  <RowActions
                    label={`${policy.insurer} policy`}
                    onEdit={() => onEdit(policy)}
                    onDelete={() => remove.mutate(policy.id)}
                    deleteDescription="The original document stays on the shelf. Only the extracted policy is removed."
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
