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
- [x] `PriceProvider` interface with a Finnhub implementation (one file to swap for Polygon etc.)
- [x] Quotes, company profile, fundamentals and news; quotes cached into `price_snapshots`,
      served from cache under 60s, batched per refresh, never one call per rendered row
- [x] Honest unavailable state when the key is missing or a call fails; "as of" beside every price
- [x] Settings → Market data: key status, test call, cache age
- [ ] `FINNHUB_API_KEY` secret — **waiting on Omar**. Everything above is built and the app says
      plainly that prices are unavailable until the key is added in Project Settings → Secrets.

Portfolio
- [x] Holdings table — live price, market value, unrealised P/L, day change, weight, sortable totals
- [x] Trades (buys and sells) drive average cost through a database trigger, never typed;
      a hand-entered position is preserved as a labelled opening lot on its first trade
- [x] Sleeves (core / bond / thematic / satellite / crypto) and portfolio summary
- [x] Concentration panel against the written policy caps: within / approaching / breach, and
      "not measurable" rather than a false pass when a holding has no live price
- [x] Watchlist with a required thesis and falsification condition, target price and distance
- [x] Sector and geographic exposure
- [x] Account reconciliation — priced holdings vs recorded account balance, one-click update

Advisor
- [x] Investment policy encoded once (`src/lib/policy.ts`) and shared by UI, chat and briefing
- [x] Context assembly: liquidity, allocation vs policy, holdings and weights, goals, essential
      spend from real transactions, income, currency exposure, ISA/pension allowance remaining
- [x] Streaming chat persisted to `advisor_chat`, markdown, suggested prompts from real state
- [x] `generate-briefing` — deterministic signal detection, AI wording, writes `advisor_notes`
      only when something is genuinely worth saying, deduplicated over 21 days
- [x] Dashboard advisor panel with unread count badge
- [x] Tax-year allowance tracking (`tax_allowances`) — Settings editor, read by chat and briefing
- [ ] Weekly briefing schedule — deferred: `pg_cron` / `pg_net` are not available on this project,
      so briefings are generated on demand from `/advisor`

## Phase 4 — goals, forecast, scenarios and the polish pass (this build)

Goals (`/goals`)
- [x] Goal cards — native target with GBP conversion, date, priority, funded amount, percentage,
      and the monthly contribution required from today shown as the headline figure
- [x] Status per goal (on track / behind / at risk / achieved) from funding, required run-rate and
      the household's actual surplus, with the shortfall named when the surplus cannot cover it
- [x] Line items — costed components per goal, all-in total against the headline price and the gap
      between them made visible; UK property and Egypt furnishing prompt with their usual components
- [x] SDLT calculator (England / NI) — standard bands, first-time-buyer relief with the £500k
      withdrawal, 5% additional-property surcharge, 2% non-UK-resident surcharge, effective rate,
      band breakdown and a note that overseas ownership affects both toggles
- [x] Horizon funding guidance — under 2 years cash, 2–5 years up to 40% equity, over 5 years the
      portfolio allocation; flags a goal whose funding is held wrongly for its horizon
- [x] Drag, keyboard and mobile reprioritising; the lowest priority is what gives when the
      projected surplus cannot fund everything

Forecast (`/forecast`)
- [x] 60-month projection from real data — income streams with growth, `forecast_expenses` with
      inflation, liability amortisation, goals as dated outflows, portfolio at the assumed return
- [x] Expense editor — amount, currency, frequency, start and end dates, inflation, and a
      confidence level (committed / likely / possible)
- [x] Net worth chart with goal purchases marked as step-downs
- [x] Monthly surplus / deficit chart with deficit months flagged
- [x] Cash runway line against the liquidity reserve floor, breaches highlighted
- [x] Live assumption controls: investment return, salary growth, inflation, include "possible"

Scenarios (`/scenarios`)
- [x] One-click presets — buy in 2027, buy in 2029, rent five more years, a Zeal liquidity event,
      a 30% drawdown, an income pause, a second child, a further 25% EGP devaluation, rates +2%
- [x] Saved named scenarios in `scenarios`, compared side by side against the baseline: net worth
      at five years, minimum cash point, per-goal timing and where the plan first breaks
- [x] Monte Carlo — 1,000 seeded paths from the assumed return and a volatility input, funded
      probability per goal, 10th / 50th / 90th percentile fan chart, presented as a model output

Polish pass
- [x] Every sidebar item leads to a finished page — no placeholders, no dead routes
- [x] Dashboard fully wired: real tiles, real goals strip, real forecast panel, real unread notes
- [x] Empty states walked on a fresh household across all eleven pages — each names what to add
- [x] Mobile: every page checked at 390px, zero unintended horizontal overflow, tables scroll
      inside their own container
- [x] Security: RLS and policies on all 27 public tables, private household-scoped `statements`
      bucket, server functions derive the household from the authenticated profile; scan and
      database linter clean
- [x] Performance: indexes on the household and date columns the filtered queries actually use;
      transactions paginated at 50 rows a page
- [x] Error handling: every server function returns a message that says what failed and what to do
- [x] Command palette on ⌘K — navigate, search transactions, add an account or goal, ask the advisor
- [x] Consistency: one `<Money>`, tabular figures, both themes checked page by page

Still open (needs Omar, or the platform)
- [ ] `FINNHUB_API_KEY` — add it in Project Settings → Secrets. Until then the portfolio says
      plainly that market data is unavailable rather than showing a stale or invented price.
- [ ] Weekly briefing schedule — `pg_cron` / `pg_net` are unavailable on this project, so
      briefings are generated on demand from `/advisor`.
- [ ] Haya's invitation — add her address under Settings → Access so she gets her own sign-in.


## Backlog / ideas captured while building

- [ ] CGT-aware disposal view against the £3,000 annual exempt amount
- [ ] Snapshot backfill job so the trend chart survives days the app is not opened
- [ ] Per-account balance history so account rows show their own trend
- [ ] Dividend and interest income recorded against holdings
- [ ] Scanned-PDF statements: OCR path so image-only bank PDFs can be imported
- [ ] Mortgage offer / remortgage modelling inside a property goal


