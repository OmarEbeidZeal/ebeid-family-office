-- Per-person investment mandates: household rules stay shared, how each person
-- may invest is theirs. One mandate per member.
CREATE TABLE public.investment_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mandate_type text NOT NULL DEFAULT 'conventional'
    CHECK (mandate_type IN ('conventional', 'shariah')),
  target_core_pct numeric NOT NULL DEFAULT 60 CHECK (target_core_pct >= 0 AND target_core_pct <= 100),
  target_income_pct numeric NOT NULL DEFAULT 15 CHECK (target_income_pct >= 0 AND target_income_pct <= 100),
  target_thematic_pct numeric NOT NULL DEFAULT 15 CHECK (target_thematic_pct >= 0 AND target_thematic_pct <= 100),
  target_satellite_pct numeric NOT NULL DEFAULT 10 CHECK (target_satellite_pct >= 0 AND target_satellite_pct <= 100),
  speculative_cap_pct numeric NOT NULL DEFAULT 10 CHECK (speculative_cap_pct >= 0 AND speculative_cap_pct <= 100),
  single_name_cap_pct numeric NOT NULL DEFAULT 3 CHECK (single_name_cap_pct >= 0 AND single_name_cap_pct <= 100),
  crypto_cap_pct numeric NOT NULL DEFAULT 5 CHECK (crypto_cap_pct >= 0 AND crypto_cap_pct <= 100),
  additional_constraints text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);

CREATE INDEX investment_mandates_household_idx ON public.investment_mandates (household_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_mandates TO authenticated;
GRANT ALL ON public.investment_mandates TO service_role;

ALTER TABLE public.investment_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members full access"
  ON public.investment_mandates FOR ALL TO authenticated
  USING (household_id = private.current_household_id())
  WITH CHECK (household_id = private.current_household_id());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.investment_mandates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Compliance is recorded by the household, never guessed by the app: an
-- unscreened security says so rather than being presented as compliant.
ALTER TABLE public.holdings
  ADD COLUMN shariah_status text NOT NULL DEFAULT 'unscreened'
    CHECK (shariah_status IN ('compliant', 'non_compliant', 'unscreened')),
  ADD COLUMN shariah_note text;

ALTER TABLE public.watchlist
  ADD COLUMN shariah_status text NOT NULL DEFAULT 'unscreened'
    CHECK (shariah_status IN ('compliant', 'non_compliant', 'unscreened')),
  ADD COLUMN shariah_note text;

-- Existing members start on the conventional mandate already written into the
-- household policy. A Shariah mandate is always an explicit choice.
INSERT INTO public.investment_mandates (household_id, profile_id)
SELECT p.household_id, p.id FROM public.profiles p
ON CONFLICT (profile_id) DO NOTHING;