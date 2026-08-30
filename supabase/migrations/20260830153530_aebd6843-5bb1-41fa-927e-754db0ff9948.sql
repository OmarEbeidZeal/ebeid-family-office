-- ============ core helpers ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ households / profiles / allowed_emails ============
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Household',
  base_currency text NOT NULL DEFAULT 'GBP',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  full_name text,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  invited_by uuid,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT household_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_role_is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
$$;

-- ============ global reference tables ============
CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_ccy text NOT NULL,
  quote_ccy text NOT NULL,
  rate numeric NOT NULL,
  as_of timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fx_rates_unique_day ON public.fx_rates (base_ccy, quote_ccy, ((as_of AT TIME ZONE 'UTC')::date));
CREATE INDEX fx_rates_lookup ON public.fx_rates (base_ccy, quote_ccy, as_of DESC);

CREATE TABLE public.price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  price numeric NOT NULL,
  previous_close numeric,
  change_pct numeric,
  currency text NOT NULL DEFAULT 'USD',
  market_cap numeric,
  as_of timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_snapshots_ticker_asof ON public.price_snapshots (ticker, as_of DESC);

-- ============ household-scoped tables ============
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nickname text NOT NULL,
  institution text,
  country text NOT NULL DEFAULT 'GB',
  account_type text NOT NULL DEFAULT 'current' CHECK (account_type IN ('current','savings','isa','sipp','gia','crypto','cash','credit_card','loan','mortgage')),
  currency text NOT NULL DEFAULT 'GBP',
  current_balance numeric NOT NULL DEFAULT 0,
  is_joint boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  last_balance_update timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text,
  file_size bigint,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsing','parsed','failed')),
  transaction_count integer DEFAULT 0,
  opening_balance numeric,
  closing_balance numeric,
  error_message text,
  parsed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  category_group text NOT NULL CHECK (category_group IN ('Income','Essential','Lifestyle','Financial','Transfer')),
  is_essential boolean NOT NULL DEFAULT false,
  colour text,
  icon text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  statement_id uuid REFERENCES public.statements(id) ON DELETE SET NULL,
  booked_date date NOT NULL,
  description text,
  raw_description text,
  merchant text,
  amount numeric NOT NULL CHECK (amount >= 0),
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  currency text NOT NULL DEFAULT 'GBP',
  amount_base numeric,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  is_transfer boolean NOT NULL DEFAULT false,
  is_reviewed boolean NOT NULL DEFAULT false,
  ai_confidence numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_household_date ON public.transactions (household_id, booked_date DESC);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  asset_class text NOT NULL DEFAULT 'other' CHECK (asset_class IN ('property','private_equity','pension','cash','listed_equity','crypto','vehicle','collectible','other')),
  country text DEFAULT 'GB',
  currency text NOT NULL DEFAULT 'GBP',
  current_value numeric NOT NULL DEFAULT 0,
  acquisition_cost numeric,
  acquisition_date date,
  ownership_pct numeric NOT NULL DEFAULT 100,
  valuation_method text DEFAULT 'estimate' CHECK (valuation_method IN ('market','professional','estimate','cost','409a')),
  last_valued_at timestamptz DEFAULT now(),
  notes text,
  is_liquid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  liability_type text NOT NULL DEFAULT 'other' CHECK (liability_type IN ('mortgage','personal_loan','credit_card','student_loan','family_loan','other')),
  currency text NOT NULL DEFAULT 'GBP',
  outstanding_balance numeric NOT NULL DEFAULT 0,
  original_amount numeric,
  interest_rate numeric,
  monthly_payment numeric,
  start_date date,
  end_date date,
  linked_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ticker text NOT NULL,
  exchange text,
  name text,
  security_type text NOT NULL DEFAULT 'stock' CHECK (security_type IN ('stock','etf','crypto','bond','fund')),
  quantity numeric NOT NULL DEFAULT 0,
  avg_cost numeric,
  currency text NOT NULL DEFAULT 'USD',
  opened_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  name text,
  security_type text DEFAULT 'stock' CHECK (security_type IN ('stock','etf','crypto','bond','fund')),
  thesis text,
  conviction text DEFAULT 'watching' CHECK (conviction IN ('high','medium','watching')),
  target_price numeric,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.income_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  label text NOT NULL,
  income_type text NOT NULL DEFAULT 'salary' CHECK (income_type IN ('salary','dividend','rental','business','bonus','other')),
  gross_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric,
  currency text NOT NULL DEFAULT 'GBP',
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','annual','one_off')),
  start_date date,
  end_date date,
  annual_growth_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.forecast_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  label text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('one_off','monthly','quarterly','annual')),
  start_date date,
  end_date date,
  inflation_rate numeric NOT NULL DEFAULT 0.03,
  confidence text NOT NULL DEFAULT 'committed' CHECK (confidence IN ('committed','likely','possible')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  goal_category text NOT NULL DEFAULT 'other' CHECK (goal_category IN ('property','home_improvement','education','business','travel','family','emergency_fund','retirement','other')),
  country text,
  description text,
  target_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  target_date date,
  priority text NOT NULL DEFAULT 'want' CHECK (priority IN ('must_have','want','nice_to_have')),
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','saving','in_progress','achieved','paused')),
  funded_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.goal_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  label text NOT NULL,
  estimated_cost numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  is_purchased boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.advisor_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'briefing' CHECK (kind IN ('briefing','recommendation','alert','risk')),
  title text NOT NULL,
  body text,
  related_ticker text,
  related_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','action','urgent')),
  is_read boolean NOT NULL DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.advisor_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  context_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb,
  is_baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  as_of date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  total_assets numeric NOT NULL DEFAULT 0,
  total_liabilities numeric NOT NULL DEFAULT 0,
  net_worth numeric NOT NULL DEFAULT 0,
  liquid_net_worth numeric NOT NULL DEFAULT 0,
  base_currency text NOT NULL DEFAULT 'GBP',
  breakdown jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX net_worth_snapshots_unique ON public.net_worth_snapshots (household_id, as_of);

-- ============ grants, RLS, policies, triggers ============
DO $$
DECLARE t text;
  household_tables text[] := ARRAY['accounts','statements','categories','transactions','assets','liabilities','holdings','watchlist','income_streams','forecast_expenses','goals','goal_line_items','advisor_notes','advisor_chat','scenarios','net_worth_snapshots'];
  all_tables text[] := ARRAY['households','profiles','allowed_emails','fx_rates','price_snapshots','accounts','statements','categories','transactions','assets','liabilities','holdings','watchlist','income_streams','forecast_expenses','goals','goal_line_items','advisor_notes','advisor_chat','scenarios','net_worth_snapshots'];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;

  FOREACH t IN ARRAY household_tables LOOP
    EXECUTE format($f$CREATE POLICY "household members full access" ON public.%I FOR ALL TO authenticated
      USING (household_id = public.current_household_id())
      WITH CHECK (household_id = public.current_household_id())$f$, t);
  END LOOP;
END $$;

CREATE POLICY "members read own household" ON public.households FOR SELECT TO authenticated
  USING (id = public.current_household_id());
CREATE POLICY "owner updates household" ON public.households FOR UPDATE TO authenticated
  USING (id = public.current_household_id() AND public.current_role_is_owner())
  WITH CHECK (id = public.current_household_id());

CREATE POLICY "members read household profiles" ON public.profiles FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND household_id = public.current_household_id());

CREATE POLICY "members read household invites" ON public.allowed_emails FOR SELECT TO authenticated
  USING (household_id = public.current_household_id());
CREATE POLICY "owner invites" ON public.allowed_emails FOR INSERT TO authenticated
  WITH CHECK (household_id = public.current_household_id() AND public.current_role_is_owner());
CREATE POLICY "owner removes invites" ON public.allowed_emails FOR DELETE TO authenticated
  USING (household_id = public.current_household_id() AND public.current_role_is_owner() AND claimed_at IS NULL);

CREATE POLICY "authenticated read fx" ON public.fx_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read prices" ON public.price_snapshots FOR SELECT TO authenticated USING (true);

INSERT INTO public.allowed_emails (email, role) VALUES ('o.ebeid@getzeal.io', 'owner');