-- 1. Trades: the broker's own order reference, which makes a re-import exact.
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS trades_household_external_ref_idx
  ON public.trades (household_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- 2. Holdings: the position that existed before the earliest export.
--    A broker export covering a date range sells shares it never shows being
--    bought. Those shares are real; their cost is not in the file. Recording
--    the quantity with a null cost is what lets the portfolio hold both facts
--    at once instead of inventing a basis of zero.
ALTER TABLE public.holdings
  ADD COLUMN IF NOT EXISTS opening_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_cost numeric,
  ADD COLUMN IF NOT EXISTS position_evidence jsonb,
  ADD COLUMN IF NOT EXISTS discovered_from text NOT NULL DEFAULT 'manual';

ALTER TABLE public.holdings
  DROP CONSTRAINT IF EXISTS holdings_discovered_from_check;
ALTER TABLE public.holdings
  ADD CONSTRAINT holdings_discovered_from_check
  CHECK (discovered_from IN ('manual', 'statement'));

-- Unknown realised profit must read as unknown, not as zero.
ALTER TABLE public.holdings
  ALTER COLUMN realised_pnl DROP NOT NULL;

-- 3. The recalculation, callable on its own so the importer can re-run it
--    after setting an opening position.
CREATE OR REPLACE FUNCTION public.recalc_holding(target uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  h record;
  t record;
  qty numeric := 0;
  cost numeric := 0;
  realised numeric := 0;
  running_avg numeric := 0;
  basis_unknown boolean := false;
  trade_count integer := 0;
BEGIN
  SELECT opening_quantity, opening_cost INTO h
    FROM public.holdings WHERE id = target;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  qty := COALESCE(h.opening_quantity, 0);
  cost := COALESCE(h.opening_cost, 0);
  basis_unknown := qty > 0 AND h.opening_cost IS NULL;

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

  IF trade_count = 0 AND COALESCE(h.opening_quantity, 0) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.holdings
     SET quantity = qty,
         avg_cost = CASE
                      WHEN basis_unknown THEN NULL
                      WHEN qty > 0 THEN cost / qty
                      ELSE avg_cost
                    END,
         realised_pnl = CASE WHEN basis_unknown THEN NULL ELSE realised END,
         updated_at = now()
   WHERE id = target;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalc_holding(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalc_holding_from_trades()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recalc_holding(COALESCE(NEW.holding_id, OLD.holding_id));
  RETURN NULL;
END;
$function$;