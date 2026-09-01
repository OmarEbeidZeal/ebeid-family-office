import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Field, SelectNative } from "./FormField";
import { FormSheet, FullRow } from "./FormSheet";
import { CURRENCIES } from "@/lib/format";
import { useOwners } from "@/hooks/useOwners";
import { useSaveRow } from "@/hooks/useUpsertRow";
import { PAY_FREQUENCY_LABELS } from "@/lib/documents/types";
import { taxYearOf } from "@/lib/documents/analysis";
import { maskReference } from "@/lib/documents/redact";
import type { PayslipRow } from "@/hooks/useDocuments";

const schema = z.object({
  profile_id: z.string(),
  employer: z.string().optional(),
  payroll_ref_last4: z.string().optional(),
  pay_date: z.string().min(4, "Give the pay date"),
  pay_frequency: z.string(),
  tax_code: z.string().optional(),
  currency: z.string(),
  gross_pay: z.string().optional(),
  net_pay: z.string().optional(),
  income_tax: z.string().optional(),
  national_insurance: z.string().optional(),
  employee_pension: z.string().optional(),
  employer_pension: z.string().optional(),
  salary_sacrifice: z.string(),
  student_loan: z.string().optional(),
  benefits_in_kind: z.string().optional(),
  ytd_gross: z.string().optional(),
  ytd_employee_pension: z.string().optional(),
  ytd_employer_pension: z.string().optional(),
  ytd_benefits_in_kind: z.string().optional(),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

const numberOrNull = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Correcting a payslip, or entering one that never arrived as a file.
 *
 * The year-to-date figures matter more than the period ones: the income
 * estimate is built from them, because they already contain every earlier slip
 * from that employer.
 */
export function PayslipSheet({
  open,
  onOpenChange,
  payslip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payslip?: PayslipRow | null;
}) {
  const { options } = useOwners();
  const save = useSaveRow("payslips", "payslips", "Payslip");

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      profile_id: "",
      employer: "",
      payroll_ref_last4: "",
      pay_date: "",
      pay_frequency: "monthly",
      tax_code: "",
      currency: "GBP",
      gross_pay: "",
      net_pay: "",
      income_tax: "",
      national_insurance: "",
      employee_pension: "",
      employer_pension: "",
      salary_sacrifice: "no",
      student_loan: "",
      benefits_in_kind: "",
      ytd_gross: "",
      ytd_employee_pension: "",
      ytd_employer_pension: "",
      ytd_benefits_in_kind: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      profile_id: payslip?.profile_id ?? "",
      employer: payslip?.employer ?? "",
      payroll_ref_last4: payslip?.payroll_ref_last4 ?? "",
      pay_date: payslip?.pay_date ?? "",
      pay_frequency: payslip?.pay_frequency ?? "monthly",
      tax_code: payslip?.tax_code ?? "",
      currency: payslip?.currency ?? "GBP",
      gross_pay: payslip?.gross_pay != null ? String(payslip.gross_pay) : "",
      net_pay: payslip?.net_pay != null ? String(payslip.net_pay) : "",
      income_tax: payslip?.income_tax != null ? String(payslip.income_tax) : "",
      national_insurance:
        payslip?.national_insurance != null ? String(payslip.national_insurance) : "",
      employee_pension: payslip?.employee_pension != null ? String(payslip.employee_pension) : "",
      employer_pension: payslip?.employer_pension != null ? String(payslip.employer_pension) : "",
      salary_sacrifice: payslip?.salary_sacrifice ? "yes" : "no",
      student_loan: payslip?.student_loan != null ? String(payslip.student_loan) : "",
      benefits_in_kind: payslip?.benefits_in_kind != null ? String(payslip.benefits_in_kind) : "",
      ytd_gross: payslip?.ytd_gross != null ? String(payslip.ytd_gross) : "",
      ytd_employee_pension:
        payslip?.ytd_employee_pension != null ? String(payslip.ytd_employee_pension) : "",
      ytd_employer_pension:
        payslip?.ytd_employer_pension != null ? String(payslip.ytd_employer_pension) : "",
      ytd_benefits_in_kind:
        payslip?.ytd_benefits_in_kind != null ? String(payslip.ytd_benefits_in_kind) : "",
      notes: payslip?.notes ?? "",
    });
  }, [open, payslip, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    await save.mutateAsync({
      id: payslip?.id,
      values: {
        profile_id: values.profile_id || null,
        employer: values.employer?.trim() || null,
        payroll_ref_last4: maskReference(values.payroll_ref_last4),
        pay_date: values.pay_date,
        pay_frequency: values.pay_frequency,
        tax_year: taxYearOf(values.pay_date),
        tax_code: values.tax_code?.trim().toUpperCase() || null,
        currency: values.currency,
        gross_pay: numberOrNull(values.gross_pay),
        net_pay: numberOrNull(values.net_pay),
        income_tax: numberOrNull(values.income_tax),
        national_insurance: numberOrNull(values.national_insurance),
        employee_pension: numberOrNull(values.employee_pension),
        employer_pension: numberOrNull(values.employer_pension),
        salary_sacrifice: values.salary_sacrifice === "yes",
        student_loan: numberOrNull(values.student_loan),
        benefits_in_kind: numberOrNull(values.benefits_in_kind),
        ytd_gross: numberOrNull(values.ytd_gross),
        ytd_employee_pension: numberOrNull(values.ytd_employee_pension),
        ytd_employer_pension: numberOrNull(values.ytd_employer_pension),
        ytd_benefits_in_kind: numberOrNull(values.ytd_benefits_in_kind),
        notes: values.notes?.trim() || null,
        source: payslip?.source === "document" ? "document" : "manual",
        needs_review: false,
      },
    });
    onOpenChange(false);
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={payslip ? "Edit payslip" : "Add payslip"}
      description="National Insurance numbers are never stored. Payroll references are kept as the last four only."
      onSubmit={onSubmit}
      pending={save.isPending}
      submitLabel={payslip ? "Save changes" : "Add payslip"}
      footerNote="Under salary sacrifice the gross figure on the slip is already net of the pension contribution — say so here, or the income estimate deducts it twice."
    >
      <Field label="Whose payslip">
        <Controller
          control={form.control}
          name="profile_id"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "", label: "Not assigned" },
                ...options.filter((option) => option.value !== "joint"),
              ]}
            />
          )}
        />
      </Field>

      <Field label="Employer">
        <Input placeholder="Zeal" {...form.register("employer")} />
      </Field>

      <Field label="Pay date" error={form.formState.errors.pay_date?.message}>
        <Input type="date" {...form.register("pay_date")} />
      </Field>

      <Field label="Paid">
        <Controller
          control={form.control}
          name="pay_frequency"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={Object.entries(PAY_FREQUENCY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          )}
        />
      </Field>

      <Field label="Tax code">
        <Input placeholder="1257L" {...form.register("tax_code")} />
      </Field>

      <Field label="Currency">
        <Controller
          control={form.control}
          name="currency"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            />
          )}
        />
      </Field>

      <Field label="Gross this period">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("gross_pay")} />
      </Field>

      <Field label="Net this period">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("net_pay")} />
      </Field>

      <Field label="Income tax">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("income_tax")} />
      </Field>

      <Field label="National Insurance">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("national_insurance")}
        />
      </Field>

      <Field label="Pension, yours">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("employee_pension")}
        />
      </Field>

      <Field label="Pension, employer">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("employer_pension")}
        />
      </Field>

      <Field label="By salary sacrifice">
        <Controller
          control={form.control}
          name="salary_sacrifice"
          render={({ field }) => (
            <SelectNative
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "no", label: "No — deducted from net pay" },
                { value: "yes", label: "Yes — taken before gross" },
              ]}
            />
          )}
        />
      </Field>

      <Field label="Student loan">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("student_loan")} />
      </Field>

      <Field label="Payrolled benefits">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("benefits_in_kind")}
        />
      </Field>

      <Field label="Payroll reference" hint="Reduced to the last four on save.">
        <Input {...form.register("payroll_ref_last4")} />
      </Field>

      <FullRow>
        <p className="eyebrow pt-1">Year to date</p>
      </FullRow>

      <Field label="Gross to date">
        <Input type="number" step="0.01" inputMode="decimal" {...form.register("ytd_gross")} />
      </Field>

      <Field label="Pension to date, yours">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("ytd_employee_pension")}
        />
      </Field>

      <Field label="Pension to date, employer">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("ytd_employer_pension")}
        />
      </Field>

      <Field label="Benefits to date">
        <Input
          type="number"
          step="0.01"
          inputMode="decimal"
          {...form.register("ytd_benefits_in_kind")}
        />
      </Field>

      <FullRow>
        <Field label="Notes">
          <Input placeholder="Bonus month" {...form.register("notes")} />
        </Field>
      </FullRow>
    </FormSheet>
  );
}
