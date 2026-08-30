/* ------------------------------------------------------------ accounts */
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS institution_domain text,
  ADD COLUMN IF NOT EXISTS statement_holder text,
  ADD COLUMN IF NOT EXISTS identifier_mask text,
  ADD COLUMN IF NOT EXISTS discovered_from text NOT NULL DEFAULT 'manual';

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_discovered_from_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_discovered_from_check
  CHECK (discovered_from IN ('manual', 'statement'));

/* ------------------------------------------- masked account identifiers */
CREATE TABLE public.account_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'account_number'
    CHECK (kind IN ('account_number', 'iban', 'card', 'reference')),
  last4 text,
  identifier_hash text NOT NULL,
  source text NOT NULL DEFAULT 'statement' CHECK (source IN ('statement', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, identifier_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_identifiers TO authenticated;
GRANT ALL ON public.account_identifiers TO service_role;
ALTER TABLE public.account_identifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household members full access" ON public.account_identifiers
  FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.account_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX account_identifiers_account_idx ON public.account_identifiers (account_id);

/* ------------------------------------------------------- import batches */
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  total_files integer NOT NULL DEFAULT 0,
  finished_files integer NOT NULL DEFAULT 0,
  failed_files integer NOT NULL DEFAULT 0,
  duplicate_files integer NOT NULL DEFAULT 0,
  transactions_imported integer NOT NULL DEFAULT 0,
  duplicates_skipped integer NOT NULL DEFAULT 0,
  accounts_proposed integer NOT NULL DEFAULT 0,
  message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household members full access" ON public.import_batches
  FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX import_batches_household_idx ON public.import_batches (household_id, created_at DESC);

/* ----------------------------------------------------- account proposals */
CREATE TABLE public.account_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  institution text,
  institution_domain text,
  holder text,
  identifier_kind text,
  identifier_last4 text,
  identifier_hash text,
  currency text,
  country text,
  account_type text,
  suggested_nickname text NOT NULL,
  opening_balance numeric,
  closing_balance numeric,
  closing_balance_date date,
  period_start date,
  period_end date,
  matched_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  match_confidence numeric NOT NULL DEFAULT 0,
  match_reason text,
  statement_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'merged', 'rejected')),
  resolved_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, fingerprint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_proposals TO authenticated;
GRANT ALL ON public.account_proposals TO service_role;
ALTER TABLE public.account_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household members full access" ON public.account_proposals
  FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.account_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX account_proposals_pending_idx
  ON public.account_proposals (household_id, status, created_at DESC);

/* ------------------------------------------------------------ statements */
ALTER TABLE public.statements
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.account_proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS detected_institution text,
  ADD COLUMN IF NOT EXISTS detected_institution_domain text,
  ADD COLUMN IF NOT EXISTS detected_holder text,
  ADD COLUMN IF NOT EXISTS detected_last4 text,
  ADD COLUMN IF NOT EXISTS detected_identifier_kind text,
  ADD COLUMN IF NOT EXISTS detected_country text,
  ADD COLUMN IF NOT EXISTS detected_account_type text,
  ADD COLUMN IF NOT EXISTS match_confidence numeric,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS summary jsonb;

ALTER TABLE public.statements DROP CONSTRAINT IF EXISTS statements_status_check;
ALTER TABLE public.statements
  ADD CONSTRAINT statements_status_check CHECK (status IN (
    'uploaded', 'queued', 'extracting', 'awaiting_account', 'parsing',
    'parsed', 'needs_review', 'failed', 'duplicate', 'cancelled'
  ));

CREATE INDEX IF NOT EXISTS statements_file_hash_idx
  ON public.statements (household_id, file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS statements_queue_idx
  ON public.statements (status, next_attempt_at) WHERE status IN ('queued', 'extracting', 'parsing');
CREATE INDEX IF NOT EXISTS statements_batch_idx ON public.statements (import_batch_id);

/* ------------------------------------------------- per-household AI setup */
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  job text NOT NULL CHECK (job IN ('extraction', 'categorisation', 'advisory')),
  provider text NOT NULL DEFAULT 'lovable'
    CHECK (provider IN ('lovable', 'anthropic', 'openai')),
  model text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, job)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household members full access" ON public.ai_settings
  FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

/* --------------------------------------------- scheduler knows the new job */
CREATE OR REPLACE FUNCTION private.job_key_for_path(job_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN job_path LIKE '%net-worth-snapshot%' THEN 'net_worth_snapshot'
    WHEN job_path LIKE '%fx-refresh%' THEN 'fx_refresh'
    WHEN job_path LIKE '%market-close%' THEN 'market_close'
    WHEN job_path LIKE '%weekly-briefing%' THEN 'weekly_briefing'
    WHEN job_path LIKE '%import-queue%' THEN 'import_queue'
    ELSE 'unknown'
  END;
$function$;

SELECT cron.schedule(
  'import-queue-sweep',
  '*/5 * * * *',
  $$SELECT private.call_job_hook('/api/public/hooks/import-queue', 120000)$$
);