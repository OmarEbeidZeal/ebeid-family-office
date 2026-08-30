import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  target_amount: number;
  currency: string;
  target_date: string | null;
  priority: string;
  status: string;
  funded_amount: number;
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

function useTable<T>(key: string, table: string, order?: string) {
  const { household } = useAuth();
  return useQuery({
    queryKey: [key, household?.id],
    enabled: !!household?.id,
    queryFn: async () => {
      let query = supabase.from(table).select("*").eq("household_id", household!.id);
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
export const useIncomeStreams = () => useTable<IncomeRow>("income_streams", "income_streams");
export const useForecastExpenses = () =>
  useTable<ForecastExpenseRow>("forecast_expenses", "forecast_expenses");
export const useCategories = () => useTable<CategoryRow>("categories", "categories");
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

export function monthlyEquivalent(amount: number, frequency: string) {
  switch (frequency) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "annual":
      return amount / 12;
    default:
      return 0;
  }
}
