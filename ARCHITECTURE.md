# Spendfellow Project Architecture

## Overview

Spendfellow is a personal finance tracking application designed with the following principles:
- **Privacy-first**: Self-hosted or local-first with full data control
- **Low cost**: Designed to run on free tiers
- **Simple & explicit**: Spreadsheet-style interfaces with clear data presentation
- **Secure**: Row-level security, encrypted data, input validation

## Technology Stack

### Frontend
- **Next.js 14+**: React framework with App Router for server-side rendering and routing
- **React 18**: UI library for building components
- **TypeScript**: Type-safe development
- **Material-UI (MUI)**: Component library for consistent, accessible UI
- **Emotion**: CSS-in-JS styling (comes with MUI)

### Backend
- **Supabase**: PostgreSQL database with built-in authentication and real-time capabilities
- **Plaid API**: Bank account linking and transaction syncing
- **Next.js API Routes**: Server-side API endpoints for Plaid integration

### Database
- **PostgreSQL**: Relational database (via Supabase)
- **Row-Level Security (RLS)**: User data isolation
- **Normalized Schema**: Efficient data structure with clear relationships

## Architecture Patterns

### Data Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│   Next.js Pages     │
│   (App Router)      │
└──────┬──────────────┘
       │
       ├──────────────┐
       │              │
       ▼              ▼
┌─────────────┐  ┌──────────────┐
│  Supabase   │  │  Plaid API   │
│  Client     │  │  (via API    │
│  (Direct)   │  │   Routes)    │
└──────┬──────┘  └──────┬───────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│  PostgreSQL │  │  Financial   │
│  (Supabase) │  │  Institutions│
└─────────────┘  └──────────────┘
```

### Key Design Decisions

1. **Money in Cents**
   - All monetary values stored as `BIGINT` in cents
   - Avoids floating-point precision issues
   - Utilities in `src/lib/money.ts` for conversion and formatting

2. **Server-Side Plaid Integration**
   - Plaid API calls happen server-side for security
   - Access tokens never exposed to client
   - Public tokens exchanged via API routes

3. **Row-Level Security**
   - All database tables have RLS enabled
   - Users can only access their own data
   - Enforced at database level, not application level

4. **Type Safety**
   - Database types defined in `src/types/database.ts`
   - Matches SQL schema exactly
   - Full TypeScript coverage throughout app

## Directory Structure

```
spendfellow/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── accounts/            # Account management pages
│   │   ├── budgets/             # Budget management pages
│   │   ├── transactions/        # Transaction views and editing
│   │   ├── reports/             # Analytics and reports
│   │   ├── api/                 # API routes (Plaid, sync, etc.)
│   │   ├── layout.tsx           # Root layout with MUI setup
│   │   ├── page.tsx             # Home page
│   │   └── theme.ts             # MUI theme configuration
│   ├── components/              # Reusable React components
│   │   ├── accounts/            # Account-related components
│   │   ├── budgets/             # Budget-related components
│   │   ├── transactions/        # Transaction-related components
│   │   ├── common/              # Shared components
│   │   └── layout/              # Layout components (nav, header, etc.)
│   ├── lib/                     # Utilities and helpers
│   │   ├── supabase.ts          # Supabase client configuration
│   │   ├── plaid.ts             # Plaid API helpers
│   │   ├── money.ts             # Money conversion utilities
│   │   ├── dates.ts             # Date utilities
│   │   └── validation.ts        # Input validation schemas
│   ├── types/                   # TypeScript type definitions
│   │   ├── database.ts          # Database schema types
│   │   └── api.ts               # API request/response types
│   └── hooks/                   # Custom React hooks
│       ├── useAccounts.ts       # Account data hooks
│       ├── useTransactions.ts   # Transaction data hooks
│       └── useBudgets.ts        # Budget data hooks
├── supabase/
│   ├── config.toml              # Shared local Supabase CLI configuration
│   ├── migrations/              # Baseline and later active migrations
│   │   └── 20260726120000_baseline.sql
│   ├── repairs/                 # Opt-in operational data repairs
│   ├── tests/                   # Schema verification queries
│   └── seed.sql                 # Intentional no-data seed hook
├── public/                      # Static assets
└── .env.example                 # Environment variables template
```

## Database Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation.

### Core Tables
- **users**: Application users
- **accounts**: Financial accounts (bank, credit card, etc.)
- **plaid_items**: Plaid connection metadata
- **categories**: Budget categories (hierarchical)
- **budgets**: Monthly budgets per category
- **transactions**: Financial transactions
- **tags**: Transaction tags
- **transaction_tags**: Many-to-many relationship

### Views
- **monthly_spending_by_category**: Aggregated spending by category/month
- **budget_vs_actual**: Budget vs actual spending comparison

## Security Model

### Authentication
- Handled by Supabase Auth
- Supports email/password, magic links, OAuth providers
- JWT-based session management

### Authorization
- Row-Level Security (RLS) on all tables
- Policies enforce user_id matching auth.uid()
- No data leakage between users

### Data Protection
- Plaid access tokens encrypted at rest
- Environment variables for all secrets
- No sensitive data in client-side code

### Input Validation
- Zod schemas for all API inputs
- Server-side validation before database operations
- Sanitization of user inputs

## Development Workflow

### Local Development
1. Clone repository
2. Install dependencies: `pnpm install`
3. Configure `.env.local` with Supabase and Plaid credentials
4. Link the Supabase CLI and apply pending migrations with `pnpm db:push`
5. Validate schema changes locally with `pnpm db:start`, `pnpm db:reset`, and `pnpm db:lint`
6. Start dev server: `pnpm dev`

### Testing
- Unit tests for utilities (money, dates, etc.)
- Integration tests for API routes
- E2E tests for critical user flows

### Building
- `pnpm build`: Production build
- `pnpm start`: Start production server
- `pnpm lint`: Run ESLint
- `pnpm type-check`: TypeScript type checking

## Deployment

### Supabase Setup
1. Create project at supabase.com
2. Link the deployment checkout with `pnpm supabase link --project-ref YOUR_PROJECT_REF`
3. Preview and apply active migrations with `pnpm db:push:dry-run` and `pnpm db:push`
4. Configure authentication providers
5. Copy URL and keys to environment variables

### Vercel Deployment
1. Push code to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

### Self-Hosted Deployment
1. Build application: `pnpm build`
2. Use process manager (PM2, systemd)
3. Configure reverse proxy (nginx, caddy)
4. Set up SSL certificates
5. Configure environment variables

## Future Enhancements

### Planned Features
- Recurring transactions
- Savings goals
- Investment tracking
- Multi-currency support
- Mobile app (React Native)
- Spending predictions using ML

### Technical Improvements
- Offline-first with service workers
- Real-time sync with Supabase Realtime
- Progressive Web App (PWA)
- Advanced caching strategies
- Data export/import (CSV, JSON)

## Contributing

This is a personal project, but contributions are welcome:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

See [LICENSE](./LICENSE) file for details.
