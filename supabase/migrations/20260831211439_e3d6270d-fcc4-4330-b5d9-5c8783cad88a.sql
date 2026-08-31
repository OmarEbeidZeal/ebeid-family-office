ALTER TABLE public.tax_allowances
  ADD COLUMN IF NOT EXISTS gross_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_taxable_income numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_sacrifice numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_aid numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tax_allowances.pension_sacrifice IS
  'Pension contributions that reduce adjusted net income (salary sacrifice or relief at source), as opposed to pension_used which tracks the annual allowance.';
COMMENT ON COLUMN public.tax_allowances.adjusted_net_income IS
  'Manual override. Left null, the figure is derived from gross_salary + bonus + other_taxable_income - pension_sacrifice - grossed-up gift_aid.';

ALTER TABLE public.childcare_plans
  ADD COLUMN IF NOT EXISTS monthly_extras numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.childcare_plans.monthly_extras IS
  'Meals, nappies and consumables billed on top of the hourly rate. Funded hours never cover these.';

ALTER TABLE public.life_events
  ADD COLUMN IF NOT EXISTS child_count integer NOT NULL DEFAULT 1;