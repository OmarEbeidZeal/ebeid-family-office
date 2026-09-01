import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { useAuth } from "./useAuth";

export type AccountRow = {
  id: string;
  household_id: string;
  owner_profile_id: string | null;
  nickname: string;
  institution: string | null;
  /** Set when the institution was recognised, so a logo can be shown. */
  institution_domain: string | null;
  /** Last four digits only — the full number is never stored in this table. */
  identifier_mask: string | null;
  /** The name the statement itself carries, when it was read from one. */
  statement_holder: string | null;
  /** "manual" or "statement" — how this account came to exist. */
  discovered_from: string;
  country: string;
  account_type: string;
  currency: string;
  current_balance: number;
  /** "manual" when the figure was typed, "statement" when it is a closing balance. */
  balance_source: string;
  /** The statement that supplied the balance, when one did. */
  balance_statement_id: string | null;
  is_joint: boolean;
  /** "household" — both see it; "private" — only the owner does, and it is
   *  left out of the totals shown to the other person. */
  visibility: string;

  is_active: boolean;
  last_balance_update: string | null;
};

export type ShareholdingMetadata = {
  share_count?: number | null;
  ownership_note?: string | null;
  /** The household's percentage of the company. The stored current_value is already
   *  the household's slice, so ownership_pct on the row stays 100. */
  stake_pct?: number | null;
  price_per_share?: number | null;
  company_valuation?: number | null;
  valuation_basis?: string | null;
  vesting_status?: string | null;
  vested_pct?: number | null;
  liquidity_restriction?: string | null;
};

export type AssetRow = {
  id: string;
  owner_profile_id: string | null;
  name: string;
  asset_class: string;
  country: string | null;
  currency: string;
  current_value: number;
  acquisition_cost: number | null;
  acquisition_date: string | null;
  ownership_pct: number;
  valuation_method: string | null;
  last_valued_at: string | null;
  notes: string | null;
  is_liquid: boolean;
  metadata: ShareholdingMetadata | null;
};

export type LiabilityRow = {
  id: string;
  owner_profile_id: string | null;
  name: string;
  liability_type: string;
  currency: string;
  outstanding_balance: number;
  original_amount: number | null;
  interest_rate: number | null;
  monthly_payment: number | null;
  start_date: string | null;
  end_date: string | null;
  linked_asset_id: string | null;
  notes: string | null;
};

export type GoalRow = {
  id: string;
  owner_profile_id: string | null;
  title: string;
  goal_category: string;
  country: string | null;
  description: string | null;
  target_amount: number;
  currency: string;
  target_date: string | null;
  priority: string;
  status: string;
  funded_amount: number;
  notes: string | null;
  sort_order: number;
  first_time_buyer: boolean;
  additional_property: boolean;
  non_uk_resident: boolean;
  financed_amount: number;
  financed_rate: number | null;
  financed_term_years: number | null;
  /** Path inside the private goal-images bucket; never a public URL. */
  image_path: string | null;
  /** Set when the goal exists because of a life event, so it moves with it. */
  life_event_id: string | null;
};

export type GoalLineItemRow = {
  id: string;
  goal_id: string;
  label: string;
  estimated_cost: number;
  currency: string;
  kind: string;
  sort_order: number;
  is_purchased: boolean;
  notes: string | null;
};

export type ScenarioRow = {
  id: string;
  name: string;
  description: string | null;
  assumptions: unknown;
  results: unknown;
  is_baseline: boolean;
  preset_key: string | null;
  sort_order: number;
  created_at: string;
};

export type IncomeRow = {
  id: string;
  owner_profile_id: string | null;
  label: string;
  income_type: string;
  gross_amount: number;
  net_amount: number | null;
  currency: string;
  frequency: string;
  annual_growth_rate: number;
  /** Where the income arises — foreign income has its own UK reporting duty. */
  country: string | null;
  taxed_at_source: boolean;
  uk_self_assessment: boolean;
  /** "manual" or "payslip": a payslip-derived stream is kept in step by the reader. */
  source: string;
  last_observed_at: string | null;
};

export type ForecastExpenseRow = {
  id: string;
  owner_profile_id: string | null;
  label: string;
  amount: number;
  currency: string;
  frequency: string;
  confidence: string;
  category_id: string | null;
  start_date: string | null;
  end_date: string | null;
  inflation_rate: number;
  notes: string | null;
  life_event_id: string | null;
  /** Months after the event date this outgoing starts, when it is anchored to one. */
  event_offset_months: number | null;
};

export type TransactionRow = {
  id: string;
  booked_date: string;
  description: string | null;
  amount: number;
  amount_base: number | null;
  currency: string;
  direction: string;
  category_id: string | null;
  is_transfer: boolean;
};

export type CategoryRow = {
  id: string;
  name: string;
  category_group: string;
  is_essential: boolean;
  colour: string | null;
};

export type SnapshotRow = {
  as_of: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  liquid_net_worth: number;
};

export type HoldingRow = {
  id: string;
  owner_profile_id: string | null;
  account_id: string | null;
  ticker: string;
  name: string | null;
  exchange: string | null;
  security_type: string;
  sleeve: string;
  quantity: number;
  avg_cost: number | null;
  currency: string;
  thesis: string | null;
  falsification: string | null;
  target_price: number | null;
  realised_pnl: number | null;
  opened_at: string | null;
  notes: string | null;
  opening_quantity: number | null;
  opening_cost: number | null;
  /** The household's own Shariah determination; "unscreened" until someone records one. */
  shariah_status: string | null;
  shariah_note: string | null;
};

export type TradeRow = {
  id: string;
  holding_id: string;
  account_id: string | null;
  side: string;
  trade_date: string;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  notes: string | null;
};

export type WatchlistRow = {
  id: string;
  ticker: string;
  name: string | null;
  security_type: string | null;
  conviction: string | null;
  target_price: number | null;
  thesis: string;
  falsification: string;
  added_by: string | null;
  created_at: string;
  shariah_status: string | null;
  shariah_note: string | null;
};

export type InvestmentMandateRow = {
  id: string;
  profile_id: string;
  mandate_type: string;
  target_core_pct: number;
  target_income_pct: number;
  target_thematic_pct: number;
  target_satellite_pct: number;
  speculative_cap_pct: number;
  single_name_cap_pct: number;
  crypto_cap_pct: number;
  additional_constraints: string | null;
  notes: string | null;
};

export type AdvisorNoteRow = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  related_goal_id: string | null;
  related_ticker: string | null;
  is_read: boolean;
  fingerprint: string | null;
  generated_at: string;
};

export type AdvisorMessageRow = {
  id: string;
  role: string;
  content: string;
  reasoning: string | null;
  model: string | null;
  created_at: string;
};

export type TaxAllowanceRow = {
  id: string;
  profile_id: string | null;
  tax_year: string;
  isa_used: number;
  jisa_used: number;
  lisa_used: number;
  pension_used: number;
  employer_match_secured: boolean;
  notes: string | null;
  /** The parts an adjusted net income is built from. */
  gross_salary: number;
  bonus: number;
  other_taxable_income: number;
  /** Contributions that reduce adjusted net income, unlike the annual-allowance figure. */
  pension_sacrifice: number;
  gift_aid: number;
  /** A manual override; null means the figure is derived from the parts above. */
  adjusted_net_income: number | null;
};

export type LifeEventRow = {
  id: string;
  household_id: string;
  event_type: string;
  title: string;
  /** The due date for a baby; every derived date in the plan hangs off it. */
  expected_date: string;
  status: string;
  child_count: number;
  notes: string | null;
};

export type LifeEventTaskRow = {
  id: string;
  life_event_id: string;
  task_key: string;
  title: string;
  detail: string | null;
  due_date: string | null;
  /** Days from the event date, so the task moves if the date does. */
  offset_days: number;
  category: string;
  status: string;
  /** True where missing the date costs money rather than causing a delay. */
  is_legal_deadline: boolean;
  completed_at: string | null;
  sort_order: number;
};

export type ParentalLeavePlanRow = {
  id: string;
  life_event_id: string;
  profile_id: string | null;
  /** The income stream the leave interrupts. */
  income_stream_id: string | null;
  scheme: string;
  leave_start_date: string;
  leave_weeks: number;
  average_weekly_earnings: number | null;
  employer_enhanced: boolean;
  enhanced_full_pay_weeks: number;
  enhanced_half_pay_weeks: number;
  keeps_pension_contributions: boolean;
  notes: string | null;
};

export type ChildcarePlanRow = {
  id: string;
  life_event_id: string;
  provider_type: string;
  starts_on: string | null;
  hours_per_week: number;
  hourly_rate: number;
  weeks_per_year: number;
  monthly_extras: number;
  currency: string;
  funded_eligible: boolean;
  funded_hours_per_week: number;
  funded_weeks_per_year: number;
  funded_hours_start: string | null;
  tax_free_childcare: boolean;
  notes: string | null;
};

function useTable<T>(key: string, table: string, order?: string) {
  const { household } = useAuth();
  return useQuery({
    queryKey: [key, household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      let query = db.from(table).select("*").eq("household_id", household!.id);
      if (order) query = query.order(order, { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export const useAccounts = () => useTable<AccountRow>("accounts", "accounts");
export const useAssets = () => useTable<AssetRow>("assets", "assets");
export const useLiabilities = () => useTable<LiabilityRow>("liabilities", "liabilities");
export const useGoals = () => useTable<GoalRow>("goals", "goals");
export const useGoalLineItems = () =>
  useTable<GoalLineItemRow>("goal_line_items", "goal_line_items");
export const useScenarios = () => useTable<ScenarioRow>("scenarios", "scenarios");
export const useIncomeStreams = () => useTable<IncomeRow>("income_streams", "income_streams");
export const useForecastExpenses = () =>
  useTable<ForecastExpenseRow>("forecast_expenses", "forecast_expenses");
export const useCategories = () => useTable<CategoryRow>("categories", "categories");
export const useHoldings = () => useTable<HoldingRow>("holdings", "holdings");
export const useTrades = () => useTable<TradeRow>("trades", "trades", "trade_date");
export const useWatchlist = () => useTable<WatchlistRow>("watchlist", "watchlist", "created_at");
export const useAdvisorNotes = () =>
  useTable<AdvisorNoteRow>("advisor_notes", "advisor_notes", "generated_at");
export const useTaxAllowances = () => useTable<TaxAllowanceRow>("tax_allowances", "tax_allowances");
export const useSnapshots = () =>
  useTable<SnapshotRow>("net_worth_snapshots", "net_worth_snapshots", "as_of");
export const useLifeEvents = () => useTable<LifeEventRow>("life_events", "life_events");
export const useLifeEventTasks = () =>
  useTable<LifeEventTaskRow>("life_event_tasks", "life_event_tasks");
export const useParentalLeavePlans = () =>
  useTable<ParentalLeavePlanRow>("parental_leave_plans", "parental_leave_plans");
export const useChildcarePlans = () =>
  useTable<ChildcarePlanRow>("childcare_plans", "childcare_plans");
export const useInvestmentMandates = () =>
  useTable<InvestmentMandateRow>("investment_mandates", "investment_mandates");

/**
 * How many briefing notes are waiting. Drives the Advisor badge in the sidebar,
 * the mobile More indicator and the dashboard panel from one source.
 */
export function useUnreadNotes() {
  const { data } = useAdvisorNotes();
  return (data ?? []).filter((note) => !note.is_read).length;
}

export function useRecentTransactions(monthsBack = 2) {
  const { household } = useAuth();
  return useQuery({
    queryKey: ["transactions", household?.id, monthsBack],
    enabled: !!household?.id,
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - monthsBack);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("household_id", household!.id)
        .gte("booked_date", since.toISOString().slice(0, 10))
        .order("booked_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransactionRow[];
    },
  });
}

export { monthlyEquivalent } from "@/lib/format";
