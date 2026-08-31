ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS bank_reference text,
  ADD COLUMN IF NOT EXISTS bank_tx_code text,
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS original_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric;

ALTER TABLE public.statements
  ADD COLUMN IF NOT EXISTS source_format text,
  ADD COLUMN IF NOT EXISTS statement_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS statement_count integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'statements_source_format_check'
  ) THEN
    ALTER TABLE public.statements
      ADD CONSTRAINT statements_source_format_check
      CHECK (
        source_format IS NULL
        OR source_format = ANY (ARRAY['camt053','mt940','qif','csv','xlsx','pdf'])
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS transactions_bank_reference_idx
  ON public.transactions (account_id, bank_reference)
  WHERE bank_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS statements_file_statement_idx
  ON public.statements (household_id, file_path, statement_index);