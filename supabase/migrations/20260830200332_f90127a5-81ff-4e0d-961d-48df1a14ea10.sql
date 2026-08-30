alter table public.goals
  add column if not exists sort_order integer not null default 0,
  add column if not exists first_time_buyer boolean not null default false,
  add column if not exists additional_property boolean not null default false,
  add column if not exists non_uk_resident boolean not null default false,
  add column if not exists financed_amount numeric not null default 0,
  add column if not exists financed_rate numeric,
  add column if not exists financed_term_years integer;

alter table public.goal_line_items
  add column if not exists kind text not null default 'other',
  add column if not exists sort_order integer not null default 0;

alter table public.goal_line_items drop constraint if exists goal_line_items_kind_check;
alter table public.goal_line_items add constraint goal_line_items_kind_check
  check (kind in ('purchase','tax','fees','survey','mortgage','moving','furnishing','contingency','other'));

alter table public.scenarios
  add column if not exists preset_key text,
  add column if not exists sort_order integer not null default 0;

create index if not exists goal_line_items_goal_idx on public.goal_line_items (goal_id, sort_order);
create index if not exists goal_line_items_household_idx on public.goal_line_items (household_id);
create index if not exists goals_household_sort_idx on public.goals (household_id, sort_order);
create index if not exists forecast_expenses_household_idx on public.forecast_expenses (household_id, start_date);
create index if not exists scenarios_household_idx on public.scenarios (household_id, sort_order);
create index if not exists income_streams_household_idx on public.income_streams (household_id);
create index if not exists liabilities_household_idx on public.liabilities (household_id);
create index if not exists accounts_household_active_idx on public.accounts (household_id, is_active);
create index if not exists assets_household_idx on public.assets (household_id);