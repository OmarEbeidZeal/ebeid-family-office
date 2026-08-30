CREATE INDEX IF NOT EXISTS statements_household_created_idx ON public.statements (household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS statements_account_idx ON public.statements (account_id);
CREATE INDEX IF NOT EXISTS watchlist_household_idx ON public.watchlist (household_id);
CREATE INDEX IF NOT EXISTS categories_household_idx ON public.categories (household_id);
CREATE INDEX IF NOT EXISTS holdings_household_idx ON public.holdings (household_id);
CREATE INDEX IF NOT EXISTS trades_household_date_idx ON public.trades (household_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS advisor_notes_household_generated_idx ON public.advisor_notes (household_id, generated_at DESC);