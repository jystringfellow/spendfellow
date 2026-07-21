# Spendfellow

Spendfellow is a self-hosted, spreadsheet-first personal finance tracker for small households. It combines bank transaction sync, hands-on categorization, monthly budgeting, and practical reporting while keeping each household in control of its own deployment and financial data.

The reusable application lives in this public repository. Each household should connect it to its own private Supabase project, Plaid account, and deployment.

- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup, Supabase Auth configuration, and the public-template/private-deployment repository pattern.
- See [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) for the spreadsheet workflow and product-design background. The migration history and application code are the source of truth for current implementation status.

## Key Features

- **Household access**: Invite-only authentication, shared household data, owner-managed invitations, and member removal.
- **Plaid and manual accounts**: Connect bank and credit-card accounts through Plaid or add accounts such as cash manually.
- **Transaction workflow**: Sync or manually enter transactions, then filter, search, categorize, split, tag, and annotate them.
- **Credit-card payments**: Link checking-account payments to the matching credit-card transactions without counting the transfer as new spending.
- **Monthly budgeting**: Organize categories into workbook-style groups, set effective monthly budgets, and maintain recurring values and formulas.
- **Budget reports**: Review monthly budget-versus-actual results, yearly rollups, balances, cash flow, and uncategorized work.
- **Amazon purchase imports**: Use an optional Tampermonkey userscript to import payment transactions and order-item details for more useful splits and refund review.
- **Google Sheets budget import**: Preview and import supported budget workbook data into Spendfellow.
- **Light and dark themes**: Use the application across desktop and smaller browser layouts.
- **Private deployment model**: Keep reusable code public while credentials, databases, and household-specific deployment history remain private.

## Tech Stack

- **Application**: Next.js App Router, React, and TypeScript
- **Interface**: Material UI
- **Database and Auth**: PostgreSQL and Supabase
- **Bank integration**: Plaid
- **Deployment**: Vercel or another Node.js-compatible host
- **Package manager**: pnpm

## Project Structure

```text
spendfellow/
├── src/
│   ├── app/                 # Pages, server actions, and API routes
│   ├── components/          # Reusable interface components
│   ├── lib/                 # Supabase, Plaid, money, date, and domain helpers
│   └── types/               # Database and application types
├── scripts/                 # Browser userscripts and supporting scripts
├── supabase/migrations/     # Ordered database migrations
├── tests/                   # Node test suite
├── DEPLOYMENT.md            # Hosting, Auth, and private-repo setup
├── PRODUCT_REQUIREMENTS.md  # Product model and design background
└── .env.example             # Environment variable template
```

## Getting Started

### Prerequisites

- Node.js 18 or newer
- pnpm
- A Supabase project
- A Plaid account if you want automatic bank connections
- Tampermonkey if you want Amazon purchase imports

### 1. Clone and install

```bash
git clone https://github.com/jystringfellow/spendfellow.git
cd spendfellow
pnpm install
```

### 2. Set up Supabase

1. Create a new Supabase project.
2. Apply **every** SQL file in `supabase/migrations/` in filename order.
3. Configure the site URL, redirect URLs, email templates, and invite-only Auth settings described in [DEPLOYMENT.md](./DEPLOYMENT.md#supabase-setup).
4. Create or invite the first owner through the Supabase Auth dashboard. After the household is initialized, owners can invite additional members from Spendfellow Settings.

Do not run only the initial migration; later migrations contain the current household, sync, budgeting, import, and security model.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values needed by your deployment:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key

PLAID_CLIENT_ID=your_plaid_client_id
PLAID_ENV=sandbox
PLAID_SANDBOX_SECRET=your_plaid_secret_sandbox
PLAID_REDIRECT_URI=http://localhost:3000/accounts

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Additional Plaid environment secrets are documented in `.env.example` and [DEPLOYMENT.md](./DEPLOYMENT.md#plaid-setup). Keep the Supabase secret key, Plaid secrets, and Plaid access tokens server-side.

### 4. Run the application

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in as the initial owner, and choose **Seed constants** in Settings to create the initial household and workbook categories. You can then adjust the groups, budgets, recurring values, tags, and household access there.

## Database Model

Financial records belong to a household rather than an individual browser session. Authenticated users receive access through `household_members`, and PostgreSQL row-level security limits database operations to the current household.

The schema stores money as integer cents to avoid floating-point errors. Transactions remain normalized and are projected into spreadsheet-inspired budget and report views rather than being stored as spreadsheet cells.

The ordered files in `supabase/migrations/` are the authoritative schema history. [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) provides additional background, but may not describe every newer migration individually.

## Optional Amazon Purchase Sync

Spendfellow includes a Tampermonkey userscript that imports Amazon Payments transactions and associated order details into the household database.

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Sign in to Spendfellow and open Settings.
3. Use **Install Userscript** to install the version served by your deployment.
4. Choose a cutoff date and start **Sync Amazon Purchases**.
5. Keep the Amazon tab open while the userscript scans transactions and order pages. When it finishes, use the status panel to review or copy debug details before closing the tab.

For local testing, loopback origins such as `http://localhost:3000` are supported. Non-loopback deployments must use HTTPS.

Use **Preview Payload Only** in Settings when you want to inspect scraped data without writing to Supabase. If the status panel does not appear, confirm Tampermonkey is enabled for `https://www.amazon.com/*`, reinstall the userscript from the current Spendfellow deployment, reload the Amazon page, and inspect the browser console.

The userscript contains no Amazon credentials, cookies, Plaid secrets, or permanent Spendfellow API keys. A sync uses a short-lived token issued by the private deployment. It does not bypass Amazon login, MFA, CAPTCHA, bot detection, or rate limits, and Amazon UI changes can require userscript maintenance.

## Development

### Money handling

Use the helpers in `src/lib/money.ts` rather than floating-point arithmetic:

- `dollarsToCents()` converts dollars to cents.
- `centsToDollars()` converts cents to dollars.
- `formatCurrency()` formats a cent value as currency.
- `parseCurrencyToCents()` parses currency text into cents.

### Validation

```bash
pnpm test
pnpm type-check
pnpm build
```

The GitHub Actions workflow runs the same test, type-check, and production-build gates for pull requests.

## Deployment

The recommended deployment uses:

- this public repository as the reusable upstream source;
- a separate private GitHub repository connected to Vercel;
- a household-specific Supabase project; and
- credentials stored only in local or deployment environment variables.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the complete setup and update workflow.

## Security

- Supabase Auth establishes identity; household membership grants data access.
- Row-level security limits household data access.
- The Supabase secret key and Plaid secrets are used only by server-side code.
- Plaid access tokens are not returned to browser clients.
- Sensitive environment files, financial exports, screenshots, and Amazon captures should never be committed.
- The application exposes no public sign-up flow; deployments should keep account creation invite-only and let household owners invite members through Settings.

Review the public-repository safety checklist in [DEPLOYMENT.md](./DEPLOYMENT.md#public-repo-safety-checklist) before publishing a fork or template update.

## Cost

Spendfellow is designed for a small household deployment and can often fit within provider free tiers during development or light personal use. Supabase, Vercel, and Plaid limits and production pricing change over time, so review their current terms before relying on a particular monthly cost.

## Project Status

Spendfellow is actively used and continues to evolve around real household budgeting needs. Current capabilities are summarized above rather than maintained as a completed-feature checklist.

Development is needs-driven instead of organized around a fixed public roadmap. Bugs and feature proposals are welcome through GitHub Issues. The Amazon integration remains experimental because it depends on Amazon's browser interface and may require maintenance when that interface changes.

## Contributing

This is a personal project, but focused fixes, suggestions, and bug reports are welcome through GitHub Issues and pull requests.

## License

See [LICENSE](./LICENSE) for details.
