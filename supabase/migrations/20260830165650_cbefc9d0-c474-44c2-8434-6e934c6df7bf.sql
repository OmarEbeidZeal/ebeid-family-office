-- ============ storage: private statement files, household-scoped ============
CREATE POLICY "household reads own statement files" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );

CREATE POLICY "household uploads statement files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );

CREATE POLICY "household updates statement files" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  )
  WITH CHECK (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );

CREATE POLICY "household deletes statement files" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'statements'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );

-- ============ transactions: balance-after + duplicate protection ============
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS balance_after numeric,
  ADD COLUMN IF NOT EXISTS import_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_import_fingerprint_unique
  ON public.transactions (account_id, import_fingerprint)
  WHERE account_id IS NOT NULL AND import_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_household_account_date
  ON public.transactions (household_id, account_id, booked_date DESC);

CREATE INDEX IF NOT EXISTS transactions_household_category
  ON public.transactions (household_id, category_id);

CREATE INDEX IF NOT EXISTS transactions_statement
  ON public.transactions (statement_id);

-- ============ statements: needs_review + validation detail ============
ALTER TABLE public.statements DROP CONSTRAINT IF EXISTS statements_status_check;
ALTER TABLE public.statements
  ADD CONSTRAINT statements_status_check
  CHECK (status IN ('uploaded','parsing','parsed','needs_review','failed'));

ALTER TABLE public.statements
  ADD COLUMN IF NOT EXISTS discrepancy numeric,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text;

-- ============ category rules: learn from corrections ============
CREATE TABLE public.category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  match_pattern text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains','starts_with','exact')),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_from_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  applied_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_rules TO authenticated;
GRANT ALL ON public.category_rules TO service_role;

ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.category_rules FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.category_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX category_rules_pattern_unique
  ON public.category_rules (household_id, lower(match_pattern), match_type);

-- ============ transaction splits ============
CREATE TABLE public.transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_splits TO authenticated;
GRANT ALL ON public.transaction_splits TO service_role;

ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.transaction_splits FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transaction_splits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX transaction_splits_transaction ON public.transaction_splits (transaction_id);
CREATE INDEX transaction_splits_household_category ON public.transaction_splits (household_id, category_id);