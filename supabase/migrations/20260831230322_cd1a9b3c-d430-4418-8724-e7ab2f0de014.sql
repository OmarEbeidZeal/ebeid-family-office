-- An account discovered from a statement that carried no closing figure has no
-- balance. Storing that as 0 made the household's net worth read zero, so the
-- absence is now recorded explicitly and kept out of every total.
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_balance_source_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_balance_source_check
  CHECK (balance_source IN ('manual', 'statement', 'unknown'));

UPDATE public.accounts
   SET balance_source = 'unknown',
       balance_statement_id = NULL,
       last_balance_update = NULL
 WHERE discovered_from = 'statement'
   AND balance_source = 'manual'
   AND current_balance = 0;

COMMENT ON COLUMN public.accounts.balance_source IS
  'Where current_balance came from: manual (typed), statement (closing balance of an imported statement), or unknown (nobody has stated one — the stored 0 is a placeholder and is excluded from all totals).';