import { FileText } from "lucide-react";
import { Money } from "@/components/Money";
import { RowActions } from "@/components/RowActions";
import { useDeleteRow } from "@/hooks/useUpsertRow";
import { formatDate } from "@/lib/format";
import { RECONCILIATION_LABELS, type Reconciliation } from "@/lib/documents/types";
import type { PayslipRow } from "@/hooks/useDocuments";
import { cn } from "@/lib/utils";

const RECONCILIATION_TONE: Record<Reconciliation, string> = {
  unchecked: "text-muted-foreground",
  matched: "text-gain",
  mismatch: "text-loss",
  no_credit_found: "text-warn",
};

/** Every slip on file for the chosen year, newest first. */
export function PayslipTable({
  payslips,
  onEdit,
}: {
  payslips: PayslipRow[];
  onEdit: (payslip: PayslipRow) => void;
}) {
  const remove = useDeleteRow("payslips", "payslips", "Payslip");

  return (
    <div className="hairline overflow-x-auto rounded-lg bg-surface">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <Th>Pay date</Th>
            <Th>Employer</Th>
            <Th>Code</Th>
            <Th align="right">Gross</Th>
            <Th align="right">Net</Th>
            <Th align="right">Pension</Th>
            <Th align="right">Gross to date</Th>
            <Th>Against the bank</Th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {payslips.map((slip) => {
            const reconciliation = (slip.reconciliation ?? "unchecked") as Reconciliation;
            return (
              <tr key={slip.id} className="border-b border-border last:border-0">
                <Td>
                  <span className="flex items-center gap-1.5">
                    {formatDate(slip.pay_date, "short")}
                    {slip.source === "document" && (
                      <FileText
                        className="size-3 text-muted-foreground"
                        aria-label="Read from an uploaded payslip"
                      />
                    )}
                  </span>
                </Td>
                <Td className="text-muted-foreground">{slip.employer ?? "—"}</Td>
                <Td>
                  <span className="num text-xs">{slip.tax_code ?? "—"}</span>
                </Td>
                <Td align="right">
                  {slip.gross_pay !== null ? (
                    <Money amount={slip.gross_pay} currency={slip.currency} hideConverted />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td align="right">
                  {slip.net_pay !== null ? (
                    <Money amount={slip.net_pay} currency={slip.currency} hideConverted />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td align="right">
                  {slip.employee_pension !== null ? (
                    <span className="flex flex-col items-end">
                      <Money
                        amount={slip.employee_pension}
                        currency={slip.currency}
                        hideConverted
                      />
                      {slip.salary_sacrifice && (
                        <span className="text-[0.65rem] text-muted-foreground">sacrifice</span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td align="right">
                  {slip.ytd_gross !== null ? (
                    <Money
                      amount={slip.ytd_gross}
                      currency={slip.currency}
                      decimals={0}
                      hideConverted
                    />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  <span className={cn("text-xs", RECONCILIATION_TONE[reconciliation])}>
                    {RECONCILIATION_LABELS[reconciliation] ?? reconciliation}
                    {reconciliation === "mismatch" && slip.reconciliation_delta !== null && (
                      <span className="num ml-1">
                        ({slip.reconciliation_delta > 0 ? "+" : ""}
                        {slip.reconciliation_delta.toFixed(2)})
                      </span>
                    )}
                  </span>
                </Td>
                <td className="px-2 py-2 text-right">
                  <RowActions
                    label={`payslip dated ${slip.pay_date}`}
                    onEdit={() => onEdit(slip)}
                    onDelete={() => remove.mutate(slip.id)}
                    deleteDescription="The original file stays on the documents shelf. Only the extracted payslip is removed."
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children?: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-[0.7rem] font-normal tracking-wide text-muted-foreground uppercase",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2.5", align === "right" && "text-right", className)}>{children}</td>
  );
}
