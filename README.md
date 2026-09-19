# Ebeid Family Vault

Build "Ebeid Family Office" — a private, institutional-grade wealth management system for one household: Omar (founder/CEO of a fintech) and his wife Haya. They live in London, are Egyptian-British, and hold assets across the UK, Egypt, Jordan and US markets. This is a real tool they will use daily to manage and grow their wealth — not a demo. Treat it like a private family-office platform.

Use Lovable Cloud for the backend (Postgres, auth, storage, edge functions). This first phase is: authentication + household model + the complete database schema + multi-currency engine + the net worth dashboard + accounts/assets/liabilities management + an onboarding wizard. Later phases will add statement parsing, live market data, an AI advisor, and forecasting — so build the schema for all of it now.

## Design direction — this must feel expensive
Dark, calm, precise. Think Bloomberg Terminal restraint crossed with a private bank's client portal.
- Background: near-black layered charcoal (#0A0B0D base, #121417 raised cards, #1A1D21 borders). Not pure black, not grey mush.
- One accent colour: a muted antique gold (#C9A961). Use it sparingly — active nav, primary buttons, key figures. Never decorative.
- Semantic colours: gains #4ADE80, losses #F87171, both accessible on dark. Never use gold for gain/loss.
- Typography: a clean geometric sans for UI. ALL numbers must use tabular/lining figures so columns align — this is non-negotiable in a financial app. Large headline figures (net worth) should be light-weight and generously tracked, not bold and shouty.
- Generous whitespace, hairline 1px dividers, subtle depth via border not shadow. Rounded corners no larger than 8px.
- Every currency figure shows its currency symbol and, where converted, a small muted "≈ £X" underneath.
- Support a light theme too, defined via CSS custom properties in index.css and Tailwind config tokens — never hardcode colours in components.
- Responsive: this must be genuinely usable on an iPhone, since Omar will check it on the move.

## Authentication & access — private, allowlisted
- Email + password auth via Lovable Cloud auth, with email confirmation disabled so sign-in is immediate.
- Signup is restricted. Create an `allowed_emails` table. Seed it with exactly one row: `o.ebeid@getzeal.io` (role: owner). Any signup attempt from an email not in `allowed_emails` must be rejected server-side with a clear message: "This is a private system. Access is by invitation only."
- Once Omar is signed in, a Settings → Household page lets him invite his wife by entering her email address, which inserts her into `allowed_emails` (role: member) and links her to the same household. She then signs up normally with that email.
- Both users belong to ONE household. Each user sees: (a) their own personal accounts/assets in full detail, (b) the combined household view. Add a global toggle in the top bar: "Me" / "Haya" / "Household" that filters every figure on every page.
- CRITICAL SECURITY: this holds real bank data. Every single table must have Row Level Security enabled with policies scoped to the user's household_id. Never allow cross-household reads. Never expose a table without RLS. Use a security-definer function to look up the current user's household_id to avoid recursive policy errors.

## Database schema — create all of this now
All tables get `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`, and `household_id uuid` (except households/allowed_emails).

- `households` — name, base_currency (default 'GBP')
- `profiles` — id references auth.users, household_id, full_name, email, display_name, role ('owner'|'member'), avatar_url
- `allowed_emails` — email unique, role, invited_by, claimed_at
- `fx_rates` — base_ccy, quote_ccy, rate numeric, as_of timestamptz. Unique on (base_ccy, quote_ccy, as_of::date)
- `accounts` — owner_profile_id, nickname, institution, country ('GB'|'EG'|'JO'|'US'|other), account_type ('current'|'savings'|'isa'|'sipp'|'gia'|'crypto'|'cash'|'credit_card'|'loan'|'mortgage'), currency, current_balance numeric, is_joint boolean, is_active, last_balance_update
- `statements` — account_id, uploaded_by, file_path, file_name, file_size, period_start, period_end, status ('uploaded'|'parsing'|'parsed'|'failed'), transaction_count, opening_balance, closing_balance, error_message, parsed_at
- `categories` — name, category_group ('Income'|'Essential'|'Lifestyle'|'Financial'|'Transfer'), is_essential boolean, colour, icon, is_system boolean
- `transactions` — account_id, statement_id nullable, booked_date date, description, raw_description, merchant, amount numeric (always positive), direction ('debit'|'credit'), currency, amount_base numeric (converted to GBP), category_id, is_recurring, is_transfer, is_reviewed, ai_confidence numeric, notes. Index on (household_id, booked_date desc)
- `assets` — owner_profile_id nullable (null = joint), name, asset_class ('property'|'private_equity'|'pension'|'cash'|'listed_equity'|'crypto'|'vehicle'|'collectible'|'other'), country, currency, current_value numeric, acquisition_cost, acquisition_date, ownership_pct numeric default 100, valuation_method ('market'|'professional'|'estimate'|'cost'|'409a'), last_valued_at, notes, is_liquid boolean
- `liabilities` — owner_profile_id nullable, name, liability_type ('mortgage'|'personal_loan'|'credit_card'|'student_loan'|'family_loan'|'other'), currency, outstanding_balance numeric, original_amount, interest_rate numeric, monthly_payment numeric, start_date, end_date, linked_asset_id references assets, notes
- `holdings` — owner_profile_id, account_id nullable, ticker, exchange, name, security_type ('stock'|'etf'|'crypto'|'bond'|'fund'), quantity numeric, avg_cost numeric, currency, opened_at, notes
- `watchlist` — ticker, name, security_type, thesis text, conviction ('high'|'medium'|'watching'), target_price numeric, added_by
- `price_snapshots` — ticker, price numeric, previous_close, change_pct, currency, market_cap, as_of timestamptz. Index on (ticker, as_of desc)
- `income_streams` — owner_profile_id, label, income_type ('salary'|'dividend'|'rental'|'business'|'bonus'|'other'), gross_amount numeric, net_amount numeric, currency, frequency ('monthly'|'quarterly'|'annual'|'one_off'), start_date, end_date, annual_growth_rate numeric default 0
- `forecast_expenses` — label, category_id, amount numeric, currency, frequency ('one_off'|'monthly'|'quarterly'|'annual'), start_date, end_date, inflation_rate numeric default 0.03, owner_profile_id nullable, confidence ('committed'|'likely'|'possible'), notes
- `goals` — owner_profile_id nullable, title, goal_category ('property'|'home_improvement'|'education'|'business'|'travel'|'family'|'emergency_fund'|'retirement'|'other'), country, description text, target_amount numeric, currency, target_date date, priority ('must_have'|'want'|'nice_to_have'), status ('planning'|'saving'|'in_progress'|'achieved'|'paused'), funded_amount numeric default 0, notes
- `goal_line_items` — goal_id, label, estimated_cost numeric, currency, is_purchased boolean, notes  (so "furnish the Egypt house" can break into rooms/items)
- `advisor_notes` — kind ('briefing'|'recommendation'|'alert'|'risk'), title, body text, related_ticker, related_goal_id, severity ('info'|'action'|'urgent'), is_read boolean, generated_at
- `advisor_chat` — profile_id, role ('user'|'assistant'), content text, context_snapshot jsonb
- `scenarios` — name, description, assumptions jsonb, results jsonb, is_baseline boolean

Seed `categories` with a sensible UK-focused default set across the five groups (Salary, Dividends, Rent, Mortgage, Council Tax, Utilities, Groceries, Childcare, Nursery, Transport, Travel, Dining, Health, Insurance, Subscriptions, Education, Charity/Zakat, Family Support, Investments, Savings Transfer, Tax, Other).

## Multi-currency engine
- Base currency GBP. Every stored monetary value keeps its native currency.
- Create an edge function `refresh-fx` that fetches live rates for GBP/USD/EGP/JOD/EUR/AED/SAR from a free FX API (use exchangerate.host or open.er-api.com — no key needed) and upserts into `fx_rates`. Call it on app load if the latest rate is more than 6 hours old, and expose a manual "refresh rates" button in Settings.
- Build a `useCurrency` hook and a `<Money>` component used everywhere. It renders the native amount and, when the native currency differs from the display currency, a small muted converted value beneath.
- FX exposure matters here: Egyptian pound history means they need to SEE how much of their net worth sits in soft currencies.

## Pages to build in this phase
1. **Auth** (`/auth`) — a single elegant dark sign-in/sign-up card. Show the private-access message on rejected signup. Redirect signed-in users to the dashboard.
2. **Onboarding wizard** (`/onboarding`) — shown once when a household has no data. Multi-step, one question per screen, skippable and resumable: (1) your name, (2) add your bank/investment accounts and current balances, (3) add property & other assets, (4) add liabilities (mortgage, loans, rent isn't a liability but ask for monthly rent and store it as a committed forecast_expense), (5) add income streams, (6) add your first goals. Write everything to the real tables. Do not use fake/mock data anywhere.
3. **Dashboard** (`/`) — the centrepiece:
   - Hero: total household net worth in GBP, large and light-weight, with the change since last month, and a small breakdown "Assets £X − Liabilities £Y".
   - A row of stat tiles: Liquid net worth, Illiquid net worth, Monthly net cashflow, Emergency fund runway (months of essential spending covered by liquid cash), Savings rate.
   - Net worth over time chart (area chart, built from historical snapshots — create a `net_worth_snapshots` table and a function that writes a daily snapshot).
   - Asset allocation donut by asset_class, and a second donut by currency exposure.
   - "Where the money goes" — top spending categories this month vs last.
   - A panel for the AI advisor's latest briefing (placeholder for now, wired up in a later phase).
   - Goals progress strip along the bottom.
   Every chart must be readable in both themes, use the accent/semantic palette, and have accessible tooltips.
4. **Accounts** (`/accounts`) — grouped by owner and by country, with balances, add/edit/delete, and total per group.
5. **Assets & Liabilities** (`/balance-sheet`) — a proper balance sheet view: assets by class on one side, liabilities on the other, net position. Inline add/edit. Show ownership %, valuation method and how stale each valuation is (e.g. "valued 4 months ago" in amber if over 90 days).
6. **Settings** (`/settings`) — profile, household, invite member, base currency, FX refresh, theme, sign out.

## Behaviour and quality bar
- Empty states must be helpful and specific, never "No data". E.g. "No assets yet — add the London flat, the Villette villa, or your Zeal shareholding to see your real net worth."
- All forms use react-hook-form + zod validation with clear inline errors.
- Loading states use skeletons matched to the final layout, not spinners.
- Toasts confirm every write.
- Numbers format with thousands separators and sensible decimals (2dp for money under £10k, 0dp above; always 2dp for per-share prices).
- Build proper reusable components — a `<StatTile>`, `<Money>`, `<SectionHeader>`, `<DataTable>` — and keep files small and focused. No 800-line page components.

Start now. Get the schema, RLS, auth, currency engine and dashboard right — those are the foundation everything else sits on.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ebeid-family-office.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/69ddcd0d-d8b3-4f08-b4ea-0b75bddbe531).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
