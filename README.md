# Spendfellow

A personal, spreadsheet-first finance tracking and budgeting application built for privacy, simplicity, and low cost.

## Overview

Spendfellow is designed for 1-2 users who want complete control over their financial data with a local-first or self-hosted approach. The app emphasizes a spreadsheet-style interface for detailed transaction tracking while maintaining powerful budgeting and reporting capabilities.

See [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) for the current product workflow, MVP scope, and recommended implementation order.
See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel deployment and the public-template/private-deployment repository pattern.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript
- **UI**: Material-UI (MUI)
- **Database**: PostgreSQL via Supabase
- **API Integration**: Plaid API for account sync
- **Deployment**: Self-hosted or Vercel (free tier)

## Key Features

- **Monthly Budgets**: Set budgets per category and track spending
- **Plaid Account Sync**: Automatically sync transactions from bank accounts
- **Transaction Management**: Categorization, tags, and detailed notes
- **Spreadsheet Views**: Table-style monthly transaction views
- **Yearly Rollups**: Annual reports with budget vs actual comparisons
- **Privacy-First**: Self-hosted option with complete data control
- **Secure**: Row-level security in Supabase, encrypted data at rest
- **Low Cost**: Designed to run on free tiers (Supabase free, Vercel free)

## Project Structure

```
spendfellow/
├── src/
│   ├── app/                 # Next.js app router pages
│   │   ├── accounts/        # Account management
│   │   ├── budgets/         # Budget creation and tracking
│   │   ├── transactions/    # Transaction views and editing
│   │   ├── reports/         # Yearly rollups and analytics
│   │   ├── layout.tsx       # Root layout with MUI theme
│   │   ├── page.tsx         # Home page
│   │   └── theme.ts         # MUI theme configuration
│   ├── components/          # Reusable React components
│   ├── lib/                 # Utility functions and clients
│   │   ├── supabase.ts      # Supabase client
│   │   ├── plaid.ts         # Plaid API helpers
│   │   ├── money.ts         # Money/currency utilities
│   │   └── dates.ts         # Date utilities
│   └── types/               # TypeScript type definitions
│       └── database.ts      # Database schema types
├── supabase/
│   └── migrations/          # Database migration files
│       └── 20260115000000_initial_schema.sql
├── DATABASE_SCHEMA.md       # Complete database schema documentation
├── .env.example             # Environment variables template
├── package.json
├── tsconfig.json
└── next.config.js
```

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- A Supabase account (free tier available)
- A Plaid account for bank connections (sandbox mode is free)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jystringfellow/spendfellow.git
   cd spendfellow
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
   - Run the migration file in `supabase/migrations/20260115000000_initial_schema.sql` in the Supabase SQL editor
   - Copy your project URL and publishable key

4. **Set up Plaid**
   - Sign up at [plaid.com](https://plaid.com)
   - Get your Client ID and Sandbox secret
   - For production, you'll need to apply for production access

5. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   SUPABASE_SECRET_KEY=your_supabase_secret_key
   
   PLAID_CLIENT_ID=your_plaid_client_id
   PLAID_ENV=sandbox
   PLAID_SANDBOX_SECRET=your_plaid_secret_sandbox
   PLAID_PRODUCTION_SECRET=your_plaid_secret_production
   PLAID_REDIRECT_URI=http://localhost:3000/accounts
   
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

6. **Run the development server**
   ```bash
   pnpm dev
   ```

7. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Database Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete documentation of the database structure, including:
- All table definitions
- Indexes and constraints
- Row-level security policies
- Helper views for common queries

### Key Design Principles

- **Money in Cents**: All monetary values stored as `BIGINT` in cents to avoid floating-point errors
- **Normalized Structure**: Minimal redundancy, clear relationships
- **Row-Level Security**: Users can only access their own data
- **Flexible Categorization**: Support for hierarchical categories and tags
- **Plaid Integration**: Separate tracking of Plaid items and access tokens

## Development

### Type Safety

The project uses TypeScript throughout. Database types are defined in `src/types/database.ts` and match the SQL schema exactly.

### Amazon Purchase Sync Prototype

Spendfellow includes an MVP Amazon purchase import flow built around a public Tampermonkey userscript and private app API endpoints.

1. Apply the Supabase migration in `supabase/migrations/20260710000000_amazon_sync_imports.sql`.
2. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
3. Install `scripts/amazon-sync.user.js` from this repository, or use the **Install Userscript** link on `/settings` while running the app locally. If you maintain a fork, update the userscript `@namespace`, `@updateURL`, and `@downloadURL` metadata to point at your public repo.
4. Sign in to Spendfellow, open `/settings`, choose a cutoff date, and click **Sync Amazon Purchases**.
5. The app creates a short-lived sync token, opens Amazon Payments transactions with `budgetAppOrigin` and `budgetSyncToken` query params, and the userscript displays a small status panel while it scans pages the logged-in user manually opens.

Local testing is supported for loopback origins such as `http://localhost:3000`, `http://localhost:3001`, or `http://127.0.0.1:3000`. Production and non-loopback deployments must use HTTPS.

To inspect scraped data before applying database migrations, use **Preview Payload Only** on `/settings`. This opens Amazon with `budgetSyncPreview=1`; the userscript scrapes the current Amazon page, renders the JSON payload in a dark preview panel, and logs it to the browser console without creating a token, calling the app API, or writing to Supabase. To preview an individual order page, open an Amazon order details URL and append `budgetSyncPreview=1&budgetAppOrigin=http%3A%2F%2Flocalhost%3A3000&budgetCutoffDate=2026-04-01`.

If the Amazon page opens but no status box appears, Tampermonkey is not running the current userscript. Reinstall or update it from `/amazon-sync.user.js`, confirm it is enabled for `www.amazon.com`, then reload the Amazon page with the preview query params.

Tampermonkey debug checklist:
- Open Tampermonkey Dashboard and confirm **Budget App Amazon Sync** is enabled and shows version `0.1.3` or later.
- In the browser extension settings for Tampermonkey, enable **Allow User Scripts** if your browser exposes that permission.
- After reinstalling from `/amazon-sync.user.js`, open DevTools Console on Amazon and confirm it logs `Amazon Budget Sync userscript 0.1.3 loaded`.
- Confirm the browser extension has site access for `https://www.amazon.com/*`.
- On the Amazon tab, click the Tampermonkey extension icon and confirm the script appears under the current page.
- Open DevTools Console on the Amazon tab and look for a dark preview overlay or `Amazon Budget Sync ...` console output.
- If Amazon redirects to sign-in or CAPTCHA, the script should now show `Stopped: login/CAPTCHA/error page detected`.

The userscript is safe to publish publicly because it contains no Plaid secrets, Supabase service role key, Amazon credentials, cookies, or permanent API keys. It only posts scraped Amazon transaction/order metadata to the app origin supplied by the launch URL, using the short-lived token created by the private deployment.

This prototype does not bypass Amazon login, MFA, CAPTCHA, bot detection, or rate limits. It stops when the private API reports known data, the configured cutoff date is reached, or conservative page/order limits are reached. Amazon DOM selectors are brittle by nature; see the TODOs in `scripts/amazon-sync.user.js` before treating it as production-grade.

### Money Handling

Always use the utility functions in `src/lib/money.ts`:
- `dollarsToCents()` - Convert dollars to cents
- `centsToDollars()` - Convert cents to dollars
- `formatCurrency()` - Format cents as currency string
- `parseCurrencyToCents()` - Parse currency string to cents

### Building for Production

```bash
pnpm build
pnpm start
```

### Type Checking

```bash
pnpm type-check
```

### Linting

```bash
pnpm lint
```

## Deployment

### Vercel (Recommended)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the recommended setup: public template repository, private deployment repository, Vercel environment variables, and Plaid HTTPS redirect configuration.

### Self-Hosted

1. Build the application: `pnpm build`
2. Run with: `pnpm start`
3. Use a process manager like PM2 or systemd
4. Set up a reverse proxy (nginx/caddy)

## Security Considerations

- All sensitive keys (Plaid tokens, Supabase service role key) are server-side only
- Row-level security ensures data isolation between users
- Plaid access tokens are encrypted at rest in Supabase
- Regular security updates for dependencies
- Input validation using Zod schemas

## Cost Optimization

This app is designed to run on free tiers:
- **Supabase Free**: Up to 500MB database, 2GB bandwidth
- **Vercel Free**: Unlimited deployments for personal use
- **Plaid Sandbox**: Free for development and testing
- **Plaid Production**: Pay only for active linked accounts

For 1-2 users with typical usage, monthly costs should be $0 (sandbox) or under $5 (production).

## Roadmap

- [x] Database schema design
- [x] Project structure and foundation
- [x] Next.js setup with TypeScript and MUI
- [x] Basic routing and navigation
- [x] Product requirements and implementation roadmap
- [x] Supabase Auth integration
- [x] Protected app routes
- [x] Household data sharing model
- [x] Supabase-backed constants seed
- [ ] Plaid Link integration UI
- [ ] Plaid token exchange and account import API routes
- [ ] Transaction sync API route
- [ ] Transaction table view with filtering
- [ ] Category management
- [ ] Uncategorized transaction workflow
- [ ] Budget creation and editing
- [ ] Monthly worksheet view matching the current Google Sheets workflow
- [ ] Constants and recurring values screen
- [ ] Monthly budget vs actual view
- [ ] Yearly rollup reports
- [ ] Tag management
- [ ] Data export functionality
- [ ] Google Sheets one-way sync
- [ ] Mobile responsive design
- [ ] Dark mode support

## Contributing

This is a personal project, but suggestions and bug reports are welcome via GitHub issues.

## License

See [LICENSE](./LICENSE) file for details.
