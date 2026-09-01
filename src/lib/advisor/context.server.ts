/**
 * The household's real position, assembled on the server.
 *
 * The screens and the advisor run the *same* pure builder — the only
 * difference is where the rows come from. If the two ever disagreed, the
 * advisor would be reasoning about a household that does not exist.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AccountRow,
  AssetRow,
  CategoryRow,
  ForecastExpenseRow,
  GoalRow,
  HoldingRow,
  IncomeRow,
  InvestmentMandateRow,
  LiabilityRow,
  TaxAllowanceRow,
  TradeRow,
  WatchlistRow,
} from "@/hooks/useFinancials";
import type {
  InsurancePolicyRow,
  PayslipRow,
  TenancyRow,
} from "@/hooks/useDocuments";
import type { TransactionRow } from "@/hooks/useTransactions";
import { buildHouseholdContext, type CtxSpending } from "@/lib/household-context";
import { makeConverter } from "@/lib/fx-rates";
import { buildPositions, type Position } from "@/lib/portfolio";
import {
  baselineFrom,
  categorySpend,
  currentMonthKey,
  expandSplits,
  monthlyTotals,
  recentMonthKeys,
  shiftMonth,
  type ToBase,
} from "@/lib/spending";
import { loadQuotes } from "@/lib/market/service.server";
import type { QuoteResult } from "@/lib/market/shared";
import type { SecurityProfileRow } from "@/lib/market/service.server";

type Client = SupabaseClient<Database>;

/** Two years of history: enough for a median baseline, small enough to stay quick. */
const SPENDING_MONTHS = 24;

export type AdvisorContextResult = {
  householdId: string;
  householdName: string | null;
  profileId: string | null;
  base: string;
  context: ReturnType<typeof buildHouseholdContext>["context"];
  findings: ReturnType<typeof buildHouseholdContext>["findings"];
  policyInput: ReturnType<typeof buildHouseholdContext>["policyInput"];
  netWorth: ReturnType<typeof buildHouseholdContext>["netWorth"];
  investableTotal: number;
  taxYear: ReturnType<typeof buildHouseholdContext>["taxYear"];
  mandates: ReturnType<typeof buildHouseholdContext>["mandates"];
  realised: ReturnType<typeof buildHouseholdContext>["realised"];
  isa: ReturnType<typeof buildHouseholdContext>["isa"];
  positions: Position[];
  marketAvailable: boolean;
};

export class NoHouseholdError extends Error {}

async function rows<T>(client: Client, table: string, householdId: string): Promise<T[]> {
  // One shape of query across eleven tables; the row type is asserted per call.
  const generic = client as unknown as SupabaseClient;
  const { data, error } = await generic.from(table).select("*").eq("household_id", householdId);
  if (error) throw new Error(`Could not read ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Observed spending, computed exactly as the spending screens compute it. */
function observedSpending(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  toBase: ToBase,
): CtxSpending | null {
  if (!transactions.length) return null;
  const months = recentMonthKeys(SPENDING_MONTHS);
  const totals = monthlyTotals(transactions, categories, toBase, months);
  const thisMonth = currentMonthKey();
  const breakdown = categorySpend(
    transactions,
    categories,
    toBase,
    thisMonth,
    shiftMonth(thisMonth, -1),
  );

  return {
    essentialMonthly: baselineFrom(totals, (month) => month.essential),
    lifestyleMonthly: baselineFrom(totals, (month) => month.lifestyle),
    totalMonthly: baselineFrom(totals, (month) => month.expenses),
    incomeMonthly: baselineFrom(totals, (month) => month.income),
    monthsOfData: totals.filter((month) => month.complete && month.count > 0).length,
    topCategories: breakdown
      .filter((row) => row.current > 0)
      .slice(0, 8)
      .map((row) => ({ name: row.name, monthly: row.current, essential: row.essential })),
    movers: breakdown
      .filter((row) => row.change !== null && Math.abs(row.change) >= 20 && row.current > 0)
      .slice(0, 6)
      .map((row) => ({
        name: row.name,
        current: row.current,
        previous: row.previous,
        changePct: row.change ?? 0,
      })),
  };
}

/** Entry point for a signed-in person: resolve their household, then load it. */
export async function loadAdvisorContext(
  client: Client,
  userId: string,
): Promise<AdvisorContextResult> {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, household_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`Could not read the profile: ${profileError.message}`);
  if (!profile?.household_id) {
    throw new NoHouseholdError("This account is not attached to a household yet.");
  }
  return loadAdvisorContextForHousehold(client, profile.household_id, profile.id);
}

/**
 * Entry point for the scheduler, which has a household but nobody signed in.
 * Everything below this line is identical for both callers by design — a
 * briefing written at 07:00 on Sunday reasons from exactly the position the
 * household would see if they opened the app at that moment.
 */
export async function loadAdvisorContextForHousehold(
  client: Client,
  householdId: string,
  profileId: string | null = null,
): Promise<AdvisorContextResult> {
  const { data: household } = await client
    .from("households")
    .select("id, name, base_currency, income_replacement_years")
    .eq("id", householdId)
    .maybeSingle();
  const base = household?.base_currency ?? "GBP";

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - SPENDING_MONTHS, 1);
  const sinceIso = since.toISOString().slice(0, 10);

  const [
    members,
    accounts,
    assets,
    liabilities,
    income,
    expenses,
    goals,
    holdings,
    watchlist,
    allowances,
    categories,
    policies,
    tenancies,
    payslips,
    mandates,
    trades,
  ] = await Promise.all([
    client
      .from("profiles")
      .select("id, display_name, full_name, role")
      .eq("household_id", householdId)
      .then(({ data }) => data ?? []),
    rows<AccountRow>(client, "accounts", householdId),
    rows<AssetRow>(client, "assets", householdId),
    rows<LiabilityRow>(client, "liabilities", householdId),
    rows<IncomeRow>(client, "income_streams", householdId),
    rows<ForecastExpenseRow>(client, "forecast_expenses", householdId),
    rows<GoalRow>(client, "goals", householdId),
    rows<HoldingRow>(client, "holdings", householdId),
    rows<WatchlistRow>(client, "watchlist", householdId),
    rows<TaxAllowanceRow>(client, "tax_allowances", householdId),
    rows<CategoryRow>(client, "categories", householdId),
    rows<InsurancePolicyRow>(client, "insurance_policies", householdId),
    rows<TenancyRow>(client, "tenancies", householdId),
    rows<PayslipRow>(client, "payslips", householdId),
    rows<InvestmentMandateRow>(client, "investment_mandates", householdId),
    rows<TradeRow>(client, "trades", householdId),
  ]);

  const [fxRows, transactionRows, splitRows] = await Promise.all([
    client
      .from("fx_rates")
      .select("base_ccy, quote_ccy, rate, as_of")
      .order("as_of", { ascending: false })
      .limit(200)
      .then(({ data }) => data ?? []),
    client
      .from("transactions")
      .select(
        "id, household_id, account_id, statement_id, booked_date, description, raw_description, merchant, amount, direction, currency, amount_base, balance_after, category_id, is_recurring, is_transfer, is_reviewed, ai_confidence, notes",
      )
      .eq("household_id", householdId)
      .gte("booked_date", sinceIso)
      .order("booked_date", { ascending: false })
      .limit(50_000)
      .then(({ data }) => (data ?? []) as TransactionRow[]),
    client
      .from("transaction_splits")
      .select("transaction_id, category_id, amount")
      .eq("household_id", householdId)
      .then(({ data }) => data ?? []),
  ]);

  const toBase = makeConverter(fxRows, base);
  const transactions = expandSplits(transactionRows, splitRows);

  const tickers = [
    ...holdings.map((holding) => holding.ticker),
    ...watchlist.map((item) => item.ticker),
  ];

  let quotes: Record<string, QuoteResult> = {};
  let profiles: Record<string, SecurityProfileRow> = {};
  let marketAvailable = true;
  let marketMessage: string | null = null;

  if (tickers.length) {
    try {
      const result = await loadQuotes(tickers, { includeProfiles: true });
      quotes = Object.fromEntries(
        result.quotes.map((quote) => [quote.ticker.toUpperCase(), quote]),
      );
      profiles = Object.fromEntries(result.profiles.map((row) => [row.ticker.toUpperCase(), row]));
      marketAvailable = result.configured;
      marketMessage = result.message;
    } catch (error) {
      marketAvailable = false;
      marketMessage =
        error instanceof Error
          ? error.message
          : "Live prices could not be loaded for this request.";
    }
  }

  const positions = buildPositions({ holdings, quotes, profiles, toBase });

  const built = buildHouseholdContext({
    base,
    householdName: household?.name ?? null,
    members: members.map((member) => ({
      id: member.id,
      display_name: member.display_name,
      full_name: member.full_name,
      role: member.role,
    })),
    accounts,
    assets,
    liabilities,
    income,
    expenses,
    goals,
    watchlist,
    positions,
    watchQuotes: Object.fromEntries(
      Object.entries(quotes).map(([ticker, quote]) => [
        ticker,
        {
          price: quote.source === "live" || quote.source === "cache" ? quote.price : null,
          asOf: quote.asOf,
        },
      ]),
    ),
    spending: observedSpending(transactions, categories, toBase),
    allowances,
    // Each person's own mandate, and every trade behind the realised position.
    mandates,
    trades,
    marketDataAvailable: marketAvailable,
    marketDataMessage: marketMessage,
    toBase,
    // The paperwork layer: cover, rent commitments and the £100,000 line.
    policies,
    tenancies,
    payslips,
    replacementYears: household?.income_replacement_years ?? 10,
  });

  return {
    householdId,
    householdName: household?.name ?? null,
    profileId,
    base,
    context: built.context,
    findings: built.findings,
    policyInput: built.policyInput,
    netWorth: built.netWorth,
    investableTotal: built.investableTotal,
    taxYear: built.taxYear,
    mandates: built.mandates,
    realised: built.realised,
    isa: built.isa,
    positions,
    marketAvailable,
  };
}
