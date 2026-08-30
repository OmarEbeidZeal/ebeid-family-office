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


## Phase 2 (next)

- [ ] Statement upload + parsing into `transactions` (private storage bucket, owner-scoped)
- [ ] Live market data into `price_snapshots`, real portfolio page with holdings P&L
- [ ] AI advisor: grounded briefings into `advisor_notes`, chat into `advisor_chat`
- [ ] Forecast + scenarios: cashflow projection, goal funding, UK tax wrapper capacity

## Backlog / ideas captured while building

- [ ] Goal line items UI (`goal_line_items` is in the schema, used for furnishing budgets)
- [ ] Watchlist UI (`watchlist` table exists, feeds Phase 2 advisor)
- [ ] Snapshot backfill job so the trend chart survives days the app is not opened
- [ ] ISA / pension allowance tracker with a 5 April countdown (UK tax figures in project knowledge)
- [ ] Per-account balance history so account rows show their own trend
