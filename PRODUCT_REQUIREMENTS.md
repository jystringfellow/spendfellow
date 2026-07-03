# Spendfellow Product Requirements

## Product Goal

Spendfellow is a private, spreadsheet-first finance tracker for 1-2 users. The core workflow is to connect financial institutions through Plaid, import transactions, progressively categorize the backlog, and review categorized finances in a dense table and monthly rollups.

The app should feel closer to a controlled personal finance workbook than a generic budgeting dashboard.

## Primary Workflow

1. Connect one or more financial institutions through Plaid.
2. Store each Plaid item, its accounts, balances, and sync status.
3. Import transactions for all active accounts.
4. Work through uncategorized transactions until the backlog is complete.
5. Assign transactions into monthly workbook-style category buckets.
6. Review categorized transactions in both a transaction table and a monthly worksheet view.
7. Export or sync data to a Google Sheets workbook once the internal data model is stable.

## Existing Google Sheets Workflow

Private workbook reference screenshots show the target mental model:

- `monthly.png`: A month sheet where each category is a spreadsheet column and transaction amounts are entered down the column.
- `monthly-comment.png`: Transaction cells can carry comments/notes with extra context.
- `year-summary.png`: A year view with months as columns, grouped category sections, totals, averages, and budget percentages.
- `constants.png`: A constants sheet with category budget defaults, total budget values, and recurring transaction amounts.

This means the product should not only be a bank transaction register. It should also recreate the monthly budgeting worksheet that currently exists in Google Sheets.

## Budget Model From Screenshots

The workbook organizes money into high-level groups:

- **Needs**: Bills, Groceries, Home & Office, Dependents, Auto & Transport, Health.
- **Wants**: Entertainment, Person A, Person B, Shared.
- **Big Wants**: Projects, Travel.
- **Income**: Transfers.
- **Savings**: Transfers.
- **Balances**: Cash Balance, CC Debt, Liquid, Investment Balance, Overall Balance.
- **Money Numbers**: Total Spent (Non-Big), Cash Flow (Non-Big), Total Spent, Cash Flow.

The app should model this as category groups plus categories, not as unrelated flat labels. The current schema can support hierarchy through `parent_category_id`, but the UI should make group membership obvious.

## Monthly Worksheet Requirements

The monthly worksheet is distinct from the transaction table:

- Columns represent categories or account/balance fields.
- Top rows show planned budget amounts.
- Middle rows show categorized transaction entries.
- Bottom rows show actual totals, remaining or variance values, and percent-style summary values.
- Spending cells use red/pink styling for negative actuals.
- Positive/remaining values use green styling.
- Large planned, transfer, and big want cells should remain visually separate from ordinary day-to-day spending.
- Notes/comments on a transaction should be visible without cluttering the main grid.

For implementation, the app can store normalized transactions and render this worksheet as a projection rather than storing spreadsheet cell coordinates as source-of-truth.

## MVP Scope

### Accounts and Plaid Connections

- User can connect a bank or credit card institution through Plaid Link.
- User can add more Plaid connections later without replacing existing ones.
- App stores Plaid item metadata separately from account records.
- App stores account balances, account type, subtype, currency, and active status.
- User can trigger a manual sync for one Plaid item or all active Plaid items.
- App should show connection health: active, error, or disconnected.

### Transaction Sync

- App imports Plaid transactions for connected accounts.
- Sync should be idempotent using `plaid_transaction_id`.
- App should update pending transactions as Plaid settles them.
- App should record `last_sync_at` on each Plaid item.
- Transaction amount convention remains positive for expenses and negative for income.
- Initial sync can use a date range; later sync should use Plaid's cursor-based transaction sync API.

### Categorization

- User can create and edit categories.
- User can assign a category from the transaction table.
- User can filter to uncategorized transactions.
- User can quickly move through uncategorized transactions until none remain.
- Categories can be hierarchical, but the MVP can present them as a flat list.
- Tags and notes are useful but secondary to category assignment.

### Spreadsheet-Like Transactions View

- Transaction list should be dense, sortable, and filterable.
- Required columns:
  - Date
  - Account
  - Merchant
  - Description
  - Amount
  - Category
  - Pending
  - Notes
- Useful filters:
  - Month or custom date range
  - Account
  - Category
  - Uncategorized only
  - Search merchant or description
- Inline category editing is the most important interaction.

### Monthly Worksheet View

- User can choose a month and see category buckets laid out like the existing monthly Google Sheet.
- Category groups should be visually separated and color-coded:
  - Needs
  - Wants
  - Big Wants
  - Income
  - Savings
- The view should show planned budget amounts above the actual transactions.
- The view should show totals and remaining amounts at the bottom of each category.
- The worksheet should support opening/editing a transaction note from a cell.
- The worksheet does not need arbitrary spreadsheet formulas in the MVP; values should come from app queries and calculations.

### Budgets and Reports

- User can set a monthly budget per category.
- App can compare actual spending to budget by month.
- Reports should prioritize practical review:
  - Month totals by category
  - Budget vs actual
  - Uncategorized count
  - Income, expenses, and net cash flow

### Constants and Recurring Values

- App should support default monthly budget amounts by category.
- App should support recurring expected transactions such as subscriptions, registrations, and recurring transfers.
- The constants screen can start as category budget settings plus a recurring item list.
- Recurring values should be visible in monthly planning before the matching Plaid transaction arrives.

### Export and Google Sheets

- CSV export should come before Google Sheets sync.
- Google Sheets should be treated as a later integration unless workbook sync becomes central to the product.
- Recommended first Google Sheets version is one-way export/sync from Spendfellow to a workbook.
- Two-way sync should wait until conflict handling and source-of-truth rules are clear.

## Non-Goals for MVP

- Investment tracking.
- Loan amortization.
- Multi-currency conversion.
- AI categorization.
- Automatic rule engine.
- Mobile app.
- Two-way Google Sheets sync.

These can be added after the Plaid sync, categorization backlog, and spreadsheet table are working well.

## Current Codebase Assessment

The repository already has:

- Next.js 14 App Router app structure.
- MUI layout, theme, navigation, and placeholder pages.
- Supabase Auth sign-in and protected application routes.
- Supabase client helper.
- Plaid client helper functions.
- Database schema for users, Plaid items, accounts, categories, budgets, transactions, tags, and transaction tags.
- Workbook constants schema and seed function for category groups, default budgets, and recurring values.
- TypeScript interfaces matching the schema.
- Money and date utilities.

The important missing pieces are:

- API routes for Plaid link token creation, public token exchange, account import, and transaction sync.
- Plaid Link frontend component.
- Editable account, transaction, budget, category, and report UI.
- Tests for Plaid mapping, money conversion, and sync idempotency.

## Recommended Build Order

### Phase 1: Authentication and App Shell

- Add Supabase auth helpers for server and client contexts.
- Add sign-in/sign-out flow.
- Protect the app routes.
- Ensure a `users` row exists for each authenticated Supabase user.

### Phase 2: Plaid Connection MVP

- Add API route to create a Plaid Link token.
- Add client Plaid Link button on the accounts page.
- Add API route to exchange a public token.
- Store `plaid_items`.
- Fetch and upsert accounts for the linked item.
- Show linked institutions and account balances.

### Phase 3: Transaction Sync

- Add sync API route.
- Fetch transactions for each Plaid item.
- Upsert transactions by `plaid_transaction_id`.
- Map Plaid accounts to local accounts by `plaid_account_id`.
- Add manual "sync all" and per-item sync buttons.
- Show sync status and latest sync time.

### Phase 4: Categorization Workflow

- Add category CRUD.
- Add category groups based on the current workbook sections.
- Add spreadsheet-style transaction table.
- Add inline category select.
- Add uncategorized-only filter.
- Add backlog counters: total transactions, uncategorized transactions, pending transactions.

### Phase 5: Monthly Worksheet

- Add budget CRUD by category and month.
- Render month worksheet with grouped category columns.
- Show planned amounts, actual transaction cells, totals, and remaining values.
- Add note/comment affordance for transaction cells.

### Phase 6: Budgets and Reports

- Render budget vs actual from existing database view or equivalent query.
- Add monthly category rollup.
- Add yearly summary with months as columns, totals, averages, balances, and money numbers.
- Add CSV export for transactions and monthly summaries.

### Phase 7: Google Sheets Integration

- Add Google OAuth only after CSV export and internal reports are stable.
- Start with one-way export to a configured workbook shaped like the current monthly, yearly summary, and constants sheets.
- Add sync metadata so the app can explain when the workbook was last updated.

## Product Decisions to Revisit Later

- Whether categories should be flat or hierarchical in the main UI.
- Whether transaction rules should auto-categorize future transactions.
- Whether Plaid webhooks are needed or manual/scheduled sync is enough.
- Whether Google Sheets should be export-only or two-way.
- Whether access tokens should be encrypted at the application layer in addition to database-at-rest encryption.
