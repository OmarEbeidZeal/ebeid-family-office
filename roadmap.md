# Roadmap

## Now — the broker export the importer read as spending

- [ ] A Trading 212 activity export is not a bank statement: read it as trades and cash, so share purchases build the portfolio's cost basis instead of landing in the spending analytics
- [ ] An export that starts mid-life sells shares it never shows being bought: say so on the holding rather than showing an average cost computed from half the story
- [ ] Name the file when a PDF's text layer is unreadable — Trading 212 and Interactive Brokers each get the export that works, not a generic apology
- [ ] Monzo Flex is a credit line, not the current account: keep the two exports apart instead of pooling them

## Ready next

- [ ] Imported holdings sit in the core sleeve until the household places them: prompt for the classification rather than assuming it
- [ ] Trades follow a statement when it is refiled to another account
- [ ] Document-derived net-worth inputs (deposit asset, protection sum assured) surfaced on the balance sheet
- [ ] Rent-versus-buy comparison on the property goal using the rent trajectory
- [ ] Net-pay reconciliation against matched bank credits shown on the payslip row, not just the stored verdict

## Done

- [x] Running balances derived from the rows when a PDF prints none, and backfilled onto lines already imported when a file is read again
- [x] "Read again" on an imported statement, so a better reader can improve a file that is already in
- [x] Accounts split across two rows, or pooled into one, can be merged and refiled with their transactions
- [x] Exporters that name no bank — Monzo, Trading 212, Revolut, Starling, Wise — recognised from their header signature
- [x] Proposals tolerate an unstated currency, so one account stops forking into two
- [x] PDFs whose text layer leaves digits unmapped strip NUL and control characters at the storage boundary and fail once with a message naming the CSV route
- [x] Documents rows report the statement's real outcome — failed, waiting for an account, duplicate — with its reason and a retry
- [x] Accounts with no stated balance carry an explicit unknown balance, stay out of every total, chart and advisor context, and offer one tap to set it
- [x] The two Wise CAMT.053 exports re-read under the version-agnostic parser: 823 GBP and 460 USD entries, both reconciling to the penny
- [x] Generalised documents layer: schema, privacy core, classifier, extraction, queue, `/documents` shelf, insurance, tenancy, payslips, manual income, advisor context and signals, scheduled sweep
- [x] Tests for the paperwork maths: notice windows, prorated rent, protection gap, ANI with salary sacrifice and Gift Aid, tapered pension allowance, tax codes, payslip coverage
