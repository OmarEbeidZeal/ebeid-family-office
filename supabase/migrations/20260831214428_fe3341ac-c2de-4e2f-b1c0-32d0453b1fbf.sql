-- Statements can now live in either bucket. Everything uploaded from here on
-- lands in `documents`; the files already imported stay where they are.
ALTER TABLE public.statements
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'statements';

ALTER TABLE public.statements DROP CONSTRAINT IF EXISTS statements_storage_bucket_check;
ALTER TABLE public.statements
  ADD CONSTRAINT statements_storage_bucket_check
  CHECK (storage_bucket IN ('statements', 'documents'));

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  doc_type text
    CHECK (doc_type IS NULL OR doc_type IN
      ('bank_statement', 'insurance_policy', 'tenancy', 'payslip', 'other')),
  detected_type text,
  type_confidence numeric CHECK (type_confidence IS NULL OR (type_confidence >= 0 AND type_confidence <= 1)),
  type_reason text,
  type_hint text,
  storage_bucket text NOT NULL DEFAULT 'documents'
    CHECK (storage_bucket IN ('statements', 'documents')),
  file_path text NOT NULL,
  file_name text,
  file_size bigint,
  file_hash text,
  mime_type text,
  source_format text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'extracting', 'needs_type', 'extracted',
                      'linked', 'duplicate', 'failed', 'cancelled')),
  extracted jsonb,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  period_start date,
  period_end date,
  statement_id uuid REFERENCES public.statements(id) ON DELETE SET NULL,
  record_id uuid,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documents_household_idx ON public.documents (household_id, created_at DESC);
CREATE INDEX documents_household_type_idx ON public.documents (household_id, doc_type);
CREATE INDEX documents_hash_idx ON public.documents (household_id, file_hash);
CREATE INDEX documents_queue_idx ON public.documents (status, next_attempt_at);
CREATE INDEX documents_statement_idx ON public.documents (statement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.documents FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  insurer text NOT NULL,
  insurer_domain text,
  policy_type text NOT NULL DEFAULT 'other'
    CHECK (policy_type IN ('life', 'income_protection', 'critical_illness', 'home',
                           'contents', 'travel', 'private_medical', 'other')),
  policy_number_last4 text
    CHECK (policy_number_last4 IS NULL OR policy_number_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  insured_person text,
  start_date date,
  end_date date,
  renewal_date date,
  premium_amount numeric CHECK (premium_amount IS NULL OR premium_amount >= 0),
  currency text NOT NULL DEFAULT 'GBP',
  premium_frequency text NOT NULL DEFAULT 'monthly'
    CHECK (premium_frequency IN ('monthly', 'quarterly', 'annual', 'one_off')),
  sum_assured numeric CHECK (sum_assured IS NULL OR sum_assured >= 0),
  benefit_amount numeric CHECK (benefit_amount IS NULL OR benefit_amount >= 0),
  benefit_frequency text
    CHECK (benefit_frequency IS NULL OR benefit_frequency IN ('monthly', 'annual', 'lump_sum')),
  benefit_period_months integer CHECK (benefit_period_months IS NULL OR benefit_period_months >= 0),
  deferred_period_weeks integer CHECK (deferred_period_weeks IS NULL OR deferred_period_weeks >= 0),
  beneficiaries text,
  in_trust boolean,
  exclusions text,
  notes text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'lapsed', 'cancelled')),
  source text NOT NULL DEFAULT 'document' CHECK (source IN ('document', 'manual')),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX insurance_policies_household_idx
  ON public.insurance_policies (household_id, policy_type);
CREATE INDEX insurance_policies_renewal_idx
  ON public.insurance_policies (household_id, renewal_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.insurance_policies FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tenancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'tenant' CHECK (role IN ('tenant', 'landlord')),
  property_address text NOT NULL,
  landlord_name text,
  agent_name text,
  tenant_names text,
  rent_amount numeric CHECK (rent_amount IS NULL OR rent_amount >= 0),
  currency text NOT NULL DEFAULT 'GBP',
  rent_frequency text NOT NULL DEFAULT 'monthly'
    CHECK (rent_frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annual')),
  deposit_amount numeric CHECK (deposit_amount IS NULL OR deposit_amount >= 0),
  deposit_scheme text,
  reference_last4 text
    CHECK (reference_last4 IS NULL OR reference_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  term_start date,
  term_end date,
  break_clause_date date,
  break_clause_notes text,
  notice_period_months numeric CHECK (notice_period_months IS NULL OR notice_period_months >= 0),
  rent_review_terms text,
  permitted_occupiers text,
  council_tax_responsibility text,
  utilities_responsibility text,
  repairs_responsibility text,
  status text NOT NULL DEFAULT 'current'
    CHECK (status IN ('upcoming', 'current', 'ended')),
  linked_expense_id uuid REFERENCES public.forecast_expenses(id) ON DELETE SET NULL,
  linked_income_id uuid REFERENCES public.income_streams(id) ON DELETE SET NULL,
  linked_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  linked_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  notes text,
  source text NOT NULL DEFAULT 'document' CHECK (source IN ('document', 'manual')),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenancies_household_idx ON public.tenancies (household_id, term_start DESC);
CREATE INDEX tenancies_status_idx ON public.tenancies (household_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenancies TO authenticated;
GRANT ALL ON public.tenancies TO service_role;
ALTER TABLE public.tenancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.tenancies FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tenancies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employer text,
  employee_name text,
  payroll_ref_last4 text
    CHECK (payroll_ref_last4 IS NULL OR payroll_ref_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  pay_date date NOT NULL,
  period_start date,
  period_end date,
  pay_frequency text
    CHECK (pay_frequency IS NULL OR pay_frequency IN
      ('weekly', 'fortnightly', 'four_weekly', 'monthly', 'quarterly', 'annual')),
  tax_year text,
  tax_code text,
  currency text NOT NULL DEFAULT 'GBP',
  gross_pay numeric,
  net_pay numeric,
  income_tax numeric,
  national_insurance numeric,
  employee_pension numeric,
  employer_pension numeric,
  salary_sacrifice boolean NOT NULL DEFAULT false,
  student_loan numeric,
  benefits_in_kind numeric,
  other_deductions numeric,
  ytd_gross numeric,
  ytd_income_tax numeric,
  ytd_national_insurance numeric,
  ytd_employee_pension numeric,
  ytd_employer_pension numeric,
  ytd_student_loan numeric,
  ytd_benefits_in_kind numeric,
  ytd_net_pay numeric,
  matched_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  reconciliation text NOT NULL DEFAULT 'unchecked'
    CHECK (reconciliation IN ('unchecked', 'matched', 'mismatch', 'no_credit_found')),
  reconciliation_delta numeric,
  notes text,
  source text NOT NULL DEFAULT 'document' CHECK (source IN ('document', 'manual')),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payslips_household_idx ON public.payslips (household_id, pay_date DESC);
CREATE INDEX payslips_profile_idx ON public.payslips (household_id, profile_id, pay_date DESC);

CREATE UNIQUE INDEX payslips_unique_slip ON public.payslips (
  household_id,
  pay_date,
  lower(coalesce(employer, '')),
  coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.payslips FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.income_streams
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS taxed_at_source boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uk_self_assessment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_observed_at timestamptz;

ALTER TABLE public.income_streams DROP CONSTRAINT IF EXISTS income_streams_source_check;
ALTER TABLE public.income_streams
  ADD CONSTRAINT income_streams_source_check CHECK (source IN ('manual', 'payslip'));

ALTER TABLE public.income_streams DROP CONSTRAINT IF EXISTS income_streams_income_type_check;
ALTER TABLE public.income_streams
  ADD CONSTRAINT income_streams_income_type_check
  CHECK (income_type IN ('salary', 'bonus', 'dividend', 'rental', 'business',
                         'consulting', 'distribution', 'other'));

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS income_replacement_years integer NOT NULL DEFAULT 10;

ALTER TABLE public.households DROP CONSTRAINT IF EXISTS households_income_replacement_years_check;
ALTER TABLE public.households
  ADD CONSTRAINT households_income_replacement_years_check
  CHECK (income_replacement_years BETWEEN 0 AND 40);

INSERT INTO public.documents (
  household_id, uploaded_by, doc_type, detected_type, type_confidence, type_reason,
  storage_bucket, file_path, file_name, file_size, file_hash, source_format,
  status, period_start, period_end, statement_id, extracted_at, created_at
)
SELECT
  s.household_id,
  s.uploaded_by,
  'bank_statement',
  'bank_statement',
  1,
  'Imported as a bank statement',
  'statements',
  s.file_path,
  s.file_name,
  s.file_size,
  s.file_hash,
  s.source_format,
  CASE WHEN s.status = 'duplicate' THEN 'duplicate' ELSE 'linked' END,
  s.period_start,
  s.period_end,
  s.id,
  s.parsed_at,
  s.created_at
FROM public.statements s
WHERE s.statement_index = 0;