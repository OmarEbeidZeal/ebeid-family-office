ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS balance_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS balance_statement_id uuid REFERENCES public.statements(id) ON DELETE SET NULL;

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_balance_source_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_balance_source_check CHECK (balance_source IN ('manual', 'statement'));

COMMENT ON COLUMN public.accounts.balance_source IS 'Where current_balance came from: manual (typed) or statement (closing balance of an imported statement).';
COMMENT ON COLUMN public.accounts.balance_statement_id IS 'The statement whose closing balance produced current_balance, when balance_source = statement.';

UPDATE public.accounts
   SET balance_source = 'statement'
 WHERE discovered_from = 'statement';

CREATE INDEX IF NOT EXISTS accounts_balance_statement_idx
  ON public.accounts (balance_statement_id)
  WHERE balance_statement_id IS NOT NULL;