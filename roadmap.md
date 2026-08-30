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

## Phase 3 (next)

- [ ] Live market data into `price_snapshots`, real portfolio page with holdings P&L
- [ ] AI advisor: grounded briefings into `advisor_notes`, chat into `advisor_chat`
- [ ] Forecast + scenarios: cashflow projection, goal funding, UK tax wrapper capacity



## Backlog / ideas captured while building

- [ ] Goal line items UI (`goal_line_items` is in the schema, used for furnishing budgets)
- [ ] Watchlist UI (`watchlist` table exists, feeds Phase 2 advisor)
- [ ] Snapshot backfill job so the trend chart survives days the app is not opened
- [ ] ISA / pension allowance tracker with a 5 April countdown (UK tax figures in project knowledge)
- [ ] Per-account balance history so account rows show their own trend
