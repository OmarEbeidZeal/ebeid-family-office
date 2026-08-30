-- ============================================================
-- Phase 3: portfolio, market data and advisor schema
-- ============================================================

-- 1. Holdings: sleeve, written thesis, falsification, realised P/L
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS sleeve text NOT NULL DEFAULT 'core',
  ADD COLUMN IF NOT EXISTS thesis text,
  ADD COLUMN IF NOT EXISTS falsification text,
  ADD COLUMN IF NOT EXISTS target_price numeric,
  ADD COLUMN IF NOT EXISTS realised_pnl numeric NOT NULL DEFAULT 0;

ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_sleeve_check;
ALTER TABLE public.holdings
  ADD CONSTRAINT holdings_sleeve_check
  CHECK (sleeve IN ('core', 'bond', 'thematic', 'satellite', 'crypto'));

-- Composite key so a trade can only ever point at a holding in the same household.
ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_id_household_key;
ALTER TABLE public.holdings
  ADD CONSTRAINT holdings_id_household_key UNIQUE (id, household_id);

-- 2. Watchlist: a thesis and a falsification condition are mandatory
ALTER TABLE public.watchlist
  ADD COLUMN IF NOT EXISTS falsification text;

UPDATE public.watchlist
   SET thesis = COALESCE(NULLIF(btrim(thesis), ''), 'Not recorded'),
       falsification = COALESCE(NULLIF(btrim(falsification), ''), 'Not recorded');

ALTER TABLE public.watchlist
  ALTER COLUMN thesis SET NOT NULL,
  ALTER COLUMN falsification SET NOT NULL;

ALTER TABLE public.watchlist
  DROP CONSTRAINT IF EXISTS watchlist_thesis_present_check;
ALTER TABLE public.watchlist
  ADD CONSTRAINT watchlist_thesis_present_check
  CHECK (char_length(btrim(thesis)) > 0 AND char_length(btrim(falsification)) > 0);

-- 3. Trades — the record that average cost is computed from
CREATE TABLE IF NOT EXISTS public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  trade_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  price numeric NOT NULL CHECK (price >= 0),
  fees numeric NOT NULL DEFAULT 0 CHECK (fees >= 0),
  currency text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT trades_holding_household_fk
    FOREIGN KEY (holding_id, household_id)
    REFERENCES public.holdings(id, household_id) ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members full access" ON public.trades;
CREATE POLICY "household members full access" ON public.trades
  FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

DROP TRIGGER IF EXISTS set_updated_at ON public.trades;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS trades_holding_idx ON public.trades (holding_id, trade_date);

-- Weighted-average cost, recomputed from the trade history on every change.
CREATE OR REPLACE FUNCTION public.recalc_holding_from_trades()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target uuid := COALESCE(NEW.holding_id, OLD.holding_id);
  t record;
  qty numeric := 0;
  cost numeric := 0;
  realised numeric := 0;
  running_avg numeric := 0;
  trade_count integer := 0;
BEGIN
  FOR t IN
    SELECT side, quantity, price, fees
      FROM public.trades
     WHERE holding_id = target
     ORDER BY trade_date, created_at
  LOOP
    trade_count := trade_count + 1;
    IF t.side = 'buy' THEN
      cost := cost + (t.quantity * t.price) + COALESCE(t.fees, 0);
      qty := qty + t.quantity;
    ELSE
      running_avg := CASE WHEN qty > 0 THEN cost / qty ELSE 0 END;
      realised := realised + (t.quantity * t.price) - COALESCE(t.fees, 0) - (running_avg * t.quantity);
      cost := GREATEST(cost - (running_avg * t.quantity), 0);
      qty := GREATEST(qty - t.quantity, 0);
    END IF;
  END LOOP;

  IF trade_count > 0 THEN
    UPDATE public.holdings
       SET quantity = qty,
           avg_cost = CASE WHEN qty > 0 THEN cost / qty ELSE avg_cost END,
           realised_pnl = realised,
           updated_at = now()
     WHERE id = target;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trades_recalc_holding ON public.trades;
CREATE TRIGGER trades_recalc_holding
  AFTER INSERT OR UPDATE OR DELETE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.recalc_holding_from_trades();

-- 4. Shared cache of company profile, fundamentals and headlines
CREATE TABLE IF NOT EXISTS public.security_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL UNIQUE,
  name text,
  exchange text,
  currency text,
  country text,
  industry text,
  logo text,
  market_cap numeric,
  profile jsonb,
  profile_as_of timestamp with time zone,
  metrics jsonb,
  metrics_as_of timestamp with time zone,
  news jsonb,
  news_as_of timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_profiles TO authenticated;
GRANT ALL ON public.security_profiles TO service_role;

ALTER TABLE public.security_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read security profiles" ON public.security_profiles;
CREATE POLICY "authenticated read security profiles" ON public.security_profiles
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_updated_at ON public.security_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.security_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS price_snapshots_ticker_as_of_idx
  ON public.price_snapshots (ticker, as_of DESC);

-- 5. Advisor notes: one open note per issue, fast unread lookups
ALTER TABLE public.advisor_notes
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE INDEX IF NOT EXISTS advisor_notes_unread_idx
  ON public.advisor_notes (household_id, is_read, generated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS advisor_notes_open_fingerprint_idx
  ON public.advisor_notes (household_id, fingerprint)
  WHERE is_read = false AND fingerprint IS NOT NULL;

-- 6. Advisor chat: which model answered, and its reasoning summary
ALTER TABLE public.advisor_chat
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS reasoning text;

CREATE INDEX IF NOT EXISTS advisor_chat_household_created_idx
  ON public.advisor_chat (household_id, created_at);

-- 7. Tax-year allowances, per person
CREATE TABLE IF NOT EXISTS public.tax_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  tax_year text NOT NULL,
  isa_used numeric NOT NULL DEFAULT 0 CHECK (isa_used >= 0),
  jisa_used numeric NOT NULL DEFAULT 0 CHECK (jisa_used >= 0),
  lisa_used numeric NOT NULL DEFAULT 0 CHECK (lisa_used >= 0),
  pension_used numeric NOT NULL DEFAULT 0 CHECK (pension_used >= 0),
  employer_match_secured boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (household_id, profile_id, tax_year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_allowances TO authenticated;
GRANT ALL ON public.tax_allowances TO service_role;

ALTER TABLE public.tax_allowances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members full access" ON public.tax_allowances;
CREATE POLICY "household members full access" ON public.tax_allowances
  FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

DROP TRIGGER IF EXISTS set_updated_at ON public.tax_allowances;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tax_allowances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();