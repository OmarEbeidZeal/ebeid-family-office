# Ebeid Family Office — roadmap

## Phase 1 (this build)

- [x] Database schema, RLS, `allowed_emails` seed
- [x] RLS helper functions moved to a private schema (database linter clean)
- [x] Design system tokens (dark default + light), Outfit / IBM Plex Sans, tabular figures
- [x] Allowlisted auth (`/auth`) — sign in / sign up tabs, invitation-only rejection
- [x] App shell — left sidebar, mobile bottom tabs, top bar (net worth, perspective, FX, profile)
- [x] Perspective context: Me / partner / Household, read by every page
- [x] Multi-currency engine — `fx_rates`, `refreshFxRates` server function (open.er-api.com),
      `useCurrency`, auto-refresh when rates are over 6 hours old, `<Money>` everywhere
- [x] Dashboard — hero, five metric tiles, net worth trend with range toggles, allocation and
      currency donuts with soft-currency risk line, spending comparison, advisor placeholder,
      goals strip
- [x] Accounts — grouped by owner then country, subtotals, staleness flags, sheet CRUD
- [x] Balance sheet — two columns, net position, valuation ages, mortgage/property equity netting
- [x] Goals — list, progress, line items count, sheet CRUD
- [x] Onboarding — six steps, progress rail, resumes on any device, private shareholding step
- [x] Settings — profile, household, invite partner, FX status, theme, sign out
- [x] Placeholders for Transactions / Portfolio / Forecast / Advisor
- [x] First-run dashboard panel — routes into setup instead of drawing an example household


## Phase 2 — statement ingestion and the spending engine (this build)

- [x] Private `statements` storage bucket, owner-scoped policies, 20MB PDF / CSV / XLS / XLSX
- [x] Multi-file import dialog — per-file account picker, inline account creation, live status
- [x] Server-side parsing: CSV (Papa), XLSX (`@e965/xlsx`), text-layer PDF (`unpdf`), Arabic
      headers and Arabic-Indic digits, honest failure on scanned PDFs with no text layer
- [x] AI mapping and categorisation through Lovable AI (`gemini-3.1-flash-lite`, PDF extraction
      on `gemini-3.7-flash`), confidence recorded per transaction
- [x] Dated FX conversion into `amount_base`, nearest-rate note when the exact day is missing
- [x] Deduplication by fingerprint — re-importing the same file reports "already imported"
- [x] Opening / closing balance validation, discrepancy surfaced, statement marked `needs_review`
- [x] Transfer detection across accounts (±3 days, ≤1.5% drift) and recurring detection
- [x] Transactions ledger — filters, sorting, pagination, inline categorisation, bulk actions,
      review queue, statement-scoped review, splits, category rules
- [x] `/spending` — income vs spending, essential baseline, category breakdown with month
      comparison, standing costs, top merchants, money set aside kept out of expenses
- [x] Dashboard reads observed spending: net cashflow, emergency runway, savings rate

## Phase 3 — portfolio, market data and the advisor (this build)

Market data
- [ ] `FINNHUB_API_KEY` secret; `PriceProvider` interface with a Finnhub implementation
- [ ] Quotes, company profile, fundamentals and news; quotes cached into `price_snapshots`,
      served from cache under 60s, batched per refresh, never one call per rendered row
- [ ] Honest unavailable state when the key is missing or a call fails; "as of" beside every price
- [ ] Settings → Market data: key status, test call, cache age

Portfolio
- [ ] Holdings table — live price, market value, unrealised P/L, day change, weight, sortable totals
- [ ] Trades (buys and sells) drive average cost through a database trigger, never typed
- [ ] Sleeves (core / bond / thematic / satellite / crypto) and portfolio summary
- [ ] Concentration panel against the written policy caps: within / approaching / breach
- [ ] Watchlist with a required thesis and falsification condition, target price and distance
- [ ] Sector and geographic exposure
- [ ] Account reconciliation — priced holdings vs recorded account balance, one-click update

Advisor
- [ ] Investment policy encoded once (`src/lib/policy.ts`) and shared by UI, chat and briefing
- [ ] Context assembly: liquidity, allocation vs policy, holdings and weights, goals, essential
      spend from real transactions, income, currency exposure, ISA/pension allowance remaining
- [ ] Streaming chat persisted to `advisor_chat`, markdown, suggested prompts from real state
- [ ] `generate-briefing` — deterministic signal detection, AI wording, writes `advisor_notes`
      only when something is genuinely worth saying; weekly schedule
- [ ] Dashboard advisor panel with unread count badge
- [ ] Tax-year allowance tracking (`tax_allowances`) surfaced in Settings and used by the briefing

## Phase 4 (next)

- [ ] Forecast + scenarios: cashflow projection, goal funding, UK tax wrapper capacity
- [ ] CGT-aware disposal view against the £3,000 annual exempt amount

## Backlog / ideas captured while building

- [ ] Goal line items UI (`goal_line_items` is in the schema, used for furnishing budgets)
- [ ] Snapshot backfill job so the trend chart survives days the app is not opened
- [ ] Per-account balance history so account rows show their own trend
- [ ] Dividend and interest income recorded against holdings

