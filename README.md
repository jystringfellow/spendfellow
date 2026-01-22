# SpendFellow

A personal, spreadsheet-first finance tracking and budgeting application built for privacy, simplicity, and low cost.

## Overview

SpendFellow is designed for 1-2 users who want complete control over their financial data with a local-first or self-hosted approach. The app emphasizes a spreadsheet-style interface for detailed transaction tracking while maintaining powerful budgeting and reporting capabilities.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript
- **UI**: Material-UI (MUI)
- **Database**: PostgreSQL via Supabase
- **API Integration**: Plaid API for account sync
- **Deployment**: Self-hosted or Vercel (free tier)

## Key Features

- ✅ **Monthly Budgets**: Set budgets per category and track spending
- ✅ **Plaid Account Sync**: Automatically sync transactions from bank accounts
- ✅ **Transaction Management**: Categorization, tags, and detailed notes
- ✅ **Spreadsheet Views**: Table-style monthly transaction views
- ✅ **Yearly Rollups**: Annual reports with budget vs actual comparisons
- ✅ **Privacy-First**: Self-hosted option with complete data control
- ✅ **Secure**: Row-level security in Supabase, encrypted data at rest
- ✅ **Low Cost**: Designed to run on free tiers (Supabase free, Vercel free)

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
   - Copy your project URL and anon key

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
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   
   PLAID_CLIENT_ID=your_plaid_client_id
   PLAID_SECRET=your_plaid_secret_sandbox
   PLAID_ENV=sandbox
   
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

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

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
- [ ] Plaid Link integration UI
- [ ] Transaction sync service
- [ ] Transaction table view with filtering
- [ ] Category management
- [ ] Budget creation and editing
- [ ] Monthly budget vs actual view
- [ ] Yearly rollup reports
- [ ] Tag management
- [ ] Data export functionality
- [ ] Mobile responsive design
- [ ] Dark mode support

## Contributing

This is a personal project, but suggestions and bug reports are welcome via GitHub issues.

## License

See [LICENSE](./LICENSE) file for details.
