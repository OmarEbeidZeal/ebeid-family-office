-- ============================================================
-- Life events
-- ============================================================

CREATE TABLE public.life_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'new_baby'
    CHECK (event_type IN ('new_baby', 'marriage', 'relocation', 'career_change', 'other')),
  title text NOT NULL,
  expected_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'confirmed', 'happened', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX life_events_household_idx ON public.life_events(household_id, expected_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.life_events TO authenticated;
GRANT ALL ON public.life_events TO service_role;
ALTER TABLE public.life_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.life_events FOR ALL
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.life_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Key dates
-- ============================================================

CREATE TABLE public.life_event_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  life_event_id uuid NOT NULL REFERENCES public.life_events(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  title text NOT NULL,
  detail text,
  offset_days integer NOT NULL DEFAULT 0,
  due_date date,
  category text NOT NULL DEFAULT 'admin',
  is_legal_deadline boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'not_applicable')),
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (life_event_id, task_key)
);

CREATE INDEX life_event_tasks_event_idx ON public.life_event_tasks(life_event_id, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.life_event_tasks TO authenticated;
GRANT ALL ON public.life_event_tasks TO service_role;
ALTER TABLE public.life_event_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.life_event_tasks FOR ALL
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.life_event_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Parental leave
-- ============================================================

CREATE TABLE public.parental_leave_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  life_event_id uuid NOT NULL REFERENCES public.life_events(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  income_stream_id uuid REFERENCES public.income_streams(id) ON DELETE SET NULL,
  scheme text NOT NULL DEFAULT 'smp'
    CHECK (scheme IN ('smp', 'maternity_allowance', 'spp', 'shared_parental', 'unpaid')),
  leave_start_date date NOT NULL,
  leave_weeks integer NOT NULL DEFAULT 52,
  average_weekly_earnings numeric,
  employer_enhanced boolean NOT NULL DEFAULT false,
  enhanced_full_pay_weeks integer NOT NULL DEFAULT 0,
  enhanced_half_pay_weeks integer NOT NULL DEFAULT 0,
  keeps_pension_contributions boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parental_leave_event_idx ON public.parental_leave_plans(life_event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parental_leave_plans TO authenticated;
GRANT ALL ON public.parental_leave_plans TO service_role;
ALTER TABLE public.parental_leave_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.parental_leave_plans FOR ALL
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.parental_leave_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Childcare
-- ============================================================

CREATE TABLE public.childcare_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  life_event_id uuid NOT NULL REFERENCES public.life_events(id) ON DELETE CASCADE,
  provider_type text NOT NULL DEFAULT 'nursery'
    CHECK (provider_type IN ('nursery', 'childminder', 'nanny')),
  currency text NOT NULL DEFAULT 'GBP',
  hourly_rate numeric NOT NULL DEFAULT 0,
  hours_per_week numeric NOT NULL DEFAULT 0,
  weeks_per_year integer NOT NULL DEFAULT 51,
  starts_on date,
  funded_hours_start date,
  funded_hours_per_week numeric NOT NULL DEFAULT 30,
  funded_weeks_per_year integer NOT NULL DEFAULT 38,
  funded_eligible boolean NOT NULL DEFAULT true,
  tax_free_childcare boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX childcare_plans_event_idx ON public.childcare_plans(life_event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.childcare_plans TO authenticated;
GRANT ALL ON public.childcare_plans TO service_role;
ALTER TABLE public.childcare_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access" ON public.childcare_plans FOR ALL
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.childcare_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Traceability: what the event generated
-- ============================================================

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS life_event_id uuid REFERENCES public.life_events(id) ON DELETE SET NULL;

ALTER TABLE public.forecast_expenses
  ADD COLUMN IF NOT EXISTS life_event_id uuid REFERENCES public.life_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_offset_months integer;

ALTER TABLE public.tax_allowances
  ADD COLUMN IF NOT EXISTS adjusted_net_income numeric;

-- ============================================================
-- Moving the event date moves everything anchored to it
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_life_event_anchors()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.expected_date IS NOT DISTINCT FROM OLD.expected_date THEN
    RETURN NEW;
  END IF;

  UPDATE public.life_event_tasks
     SET due_date = NEW.expected_date + offset_days
   WHERE life_event_id = NEW.id;

  UPDATE public.forecast_expenses
     SET start_date = (NEW.expected_date + (event_offset_months || ' months')::interval)::date
   WHERE life_event_id = NEW.id
     AND event_offset_months IS NOT NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER life_events_sync_anchors
  AFTER INSERT OR UPDATE OF expected_date ON public.life_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_life_event_anchors();

-- A task inserted later still lands on the right date.
CREATE OR REPLACE FUNCTION public.set_life_event_task_due_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  anchor date;
BEGIN
  SELECT expected_date INTO anchor FROM public.life_events WHERE id = NEW.life_event_id;
  IF anchor IS NOT NULL THEN
    NEW.due_date := anchor + NEW.offset_days;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER life_event_tasks_due_date
  BEFORE INSERT OR UPDATE OF offset_days ON public.life_event_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_life_event_task_due_date();