ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS partner_display_name text,
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.households.partner_display_name IS 'What to call the partner in the perspective toggle before they have their own profile.';
COMMENT ON COLUMN public.households.onboarding_step IS 'Furthest onboarding step reached, so the wizard resumes on any device.';
COMMENT ON COLUMN public.assets.metadata IS 'Structured extras per asset class, e.g. private shareholding: share_count, price_per_share, company_valuation, valuation_basis, vesting_status, vested_pct, liquidity_restriction.';