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
  country: string;
  account_type: string;
  currency: string;
  current_balance: number;
  is_joint: boolean;
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
  realised_pnl: number;
  opened_at: string | null;
  notes: string | null;
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
