ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS statement_id uuid REFERENCES public.statements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trades_statement_id_idx ON public.trades (statement_id);