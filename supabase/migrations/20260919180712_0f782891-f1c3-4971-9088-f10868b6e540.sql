ALTER TABLE public.accounts ALTER COLUMN current_balance DROP NOT NULL;
ALTER TABLE public.accounts ALTER COLUMN current_balance DROP DEFAULT;
UPDATE public.accounts SET current_balance = NULL WHERE balance_source = 'unknown';