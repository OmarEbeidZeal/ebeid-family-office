# Roadmap

## Now — the household actions the new readers unlock

- [ ] Publish first: the queue sweep runs every five minutes against the published build, so a file re-queued before publishing is read again by the old parser
- [ ] Then start the Monzo Flex export over, so its 1,403 lines leave the investment account and land on a Flex credit line of their own
- [ ] Re-download the two Trading 212 PDFs as CSV — the PDFs carry no readable digits, and the CSV brings the orders with it

## Field fixes from Omar's real files

- [x] 1. PDF text through poppler-grade extraction, with a digits-lost guard that refuses a file rather than importing it wrong
- [x] 2. CAMT.053 accounts with no IBAN: `Othr/Id`, then a composite of servicer, currency and holder
- [x] 3. Self-transfers and Monzo Flex kept out of spending and income; gross flows and true spending shown separately
- [x] 4. NatWest PDFs: infer each row's year from the statement period, and split description from transaction type
- [x] 5. Statement holder drives owner assignment on the proposals screen — never the uploader
- [x] 6. Two statements from the same broker that disagree: raise a `needs_review` conflict naming both figures and both files


## Ready next

- [ ] Imported holdings sit in the core sleeve until the household places them: prompt for the classification rather than assuming it
- [ ] Document-derived net-worth inputs (deposit asset, protection sum assured) surfaced on the balance sheet
- [ ] Rent-versus-buy comparison on the property goal using the rent trajectory
- [ ] Net-pay reconciliation against matched bank credits shown on the payslip row, not just the stored verdict

## Done

- [x] A Trading 212 activity export read as trades and cash, so share purchases build the portfolio's cost basis instead of landing in the spending analytics
- [x] An export that starts mid-life says the cost basis is unknown on that holding, and keeps it out of profit and loss, rather than averaging half the story
- [x] Monzo Flex kept apart from the current account, with its internal repayments out of the spending totals
- [x] An unreadable PDF names its exporter and the two taps that produce a file with real figures
- [x] Starting a file over: its transactions, trades and discovered positions come back out and the file re-queues as if it had never arrived
- [x] Trades follow a statement when it is refiled to another account
- [x] Running balances derived from the rows when a PDF prints none, and backfilled onto lines already imported when a file is read again
- [x] "Read again" on an imported statement, so a better reader can improve a file that is already in
- [x] Accounts split across two rows, or pooled into one, can be merged and refiled with their transactions
- [x] Exporters that name no bank — Monzo, Trading 212, Revolut, Starling, Wise — recognised from their header signature
- [x] Proposals tolerate an unstated currency, so one account stops forking into two
- [x] PDFs whose text layer leaves digits unmapped strip NUL and control characters at the storage boundary and fail once, cleanly
- [x] Documents rows report the statement's real outcome — failed, waiting for an account, duplicate — with its reason and a retry
- [x] Accounts with no stated balance carry an explicit unknown balance, stay out of every total, chart and advisor context, and offer one tap to set it
- [x] The two Wise CAMT.053 exports re-read under the version-agnostic parser: 823 GBP and 460 USD entries, both reconciling to the penny
- [x] Generalised documents layer: schema, privacy core, classifier, extraction, queue, `/documents` shelf, insurance, tenancy, payslips, manual income, advisor context and signals, scheduled sweep
- [x] Tests for the paperwork maths: notice windows, prorated rent, protection gap, ANI with salary sacrifice and Gift Aid, tapered pension allowance, tax codes, payslip coverage
