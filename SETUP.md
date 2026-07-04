# Spendfellow Setup Guide

This guide will walk you through setting up Spendfellow from scratch.

For Vercel deployment and the public-template/private-deployment repository pattern, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** and pnpm installed
- A **Supabase account** (free tier available at [supabase.com](https://supabase.com))
- A **Plaid account** (free sandbox at [plaid.com](https://plaid.com))
- **Git** installed on your system

## Step 1: Clone the Repository

```bash
git clone https://github.com/jystringfellow/spendfellow.git
cd spendfellow
```

## Step 2: Install Dependencies

```bash
pnpm install
```

This will install all required packages including Next.js, React, MUI, Supabase client, and Plaid SDK.

## Step 3: Set Up Supabase

### 3.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose an organization (or create one)
4. Enter project details:
   - **Name**: spendfellow (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free (sufficient for 1-2 users)
5. Click "Create new project"
6. Wait for the project to be provisioned (takes ~2 minutes)

### 3.2 Run the Database Migration

1. In your Supabase project dashboard, click on the **SQL Editor** in the left sidebar
2. Click "New Query"
3. Open the migration files in `supabase/migrations/` from this repository
4. Run them in filename order:
   - `20260115000000_initial_schema.sql`
   - `20260624000000_households.sql`
   - `20260625000000_workbook_constants.sql`
   - `20260626000000_household_recurring_values.sql`
   - `20260627000000_fix_seed_household_bootstrap.sql`
   - `20260628000000_fix_seed_rls_bootstrap.sql`
   - `20260629000000_recurring_value_formulas.sql`
   - `20260630000000_effective_constant_periods.sql`
   - `20260701000000_recurring_billing_frequency.sql`
5. Copy each file's contents into the Supabase SQL Editor
6. Click "Run" to execute each migration
7. You should see "Success. No rows returned" for most migration statements

If you already ran the first two migrations before household support was added, run these next:

- `20260624000000_households.sql`
- `20260626000000_household_recurring_values.sql`
- `20260627000000_fix_seed_household_bootstrap.sql`
- `20260628000000_fix_seed_rls_bootstrap.sql`
- `20260629000000_recurring_value_formulas.sql`
- `20260630000000_effective_constant_periods.sql`
- `20260701000000_recurring_billing_frequency.sql`

### 3.3 Get Your Supabase Credentials

1. In your Supabase project dashboard, click on **Settings** (gear icon) in the left sidebar
2. Click on **API** under Project Settings
3. You'll need three values:
   - **Project URL**: Found under "Project URL" (starts with https://xxx.supabase.co)
   - **Publishable Key**: Found in the API keys or project Connect dialog
   - **Secret Key**: Found in the API keys section (keep this secret!)

## Step 4: Set Up Plaid

### 4.1 Create a Plaid Account

1. Go to [plaid.com](https://plaid.com)
2. Click "Get API keys" or "Sign up"
3. Fill out the registration form
4. Verify your email address

### 4.2 Get Your Plaid Credentials

1. Log into the [Plaid Dashboard](https://dashboard.plaid.com)
2. You'll see your credentials on the main page:
   - **Client ID**: Your unique client identifier
   - **Sandbox Secret**: Your sandbox environment secret key
   - **Development Secret**: (optional, for testing with real banks)
   - **Production Secret**: (only after applying for production access)

For initial setup, use the **Sandbox** environment which is completely free and doesn't require real bank credentials.

## Step 5: Configure Environment Variables

### 5.1 Create Your Environment File

```bash
cp .env.example .env.local
```

### 5.2 Edit `.env.local`

Open `.env.local` in your text editor and fill in your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key

# Plaid API Configuration
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_ENV=sandbox
PLAID_SANDBOX_SECRET=your_plaid_secret_sandbox
PLAID_PRODUCTION_SECRET=your_plaid_secret_production
PLAID_REDIRECT_URI=http://localhost:3000/accounts

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Important Notes:**
- Replace all placeholder values with your actual credentials
- Never commit `.env.local` to version control (it's in `.gitignore`)
- Keep `SUPABASE_SECRET_KEY` and all `PLAID_*_SECRET` values confidential
- Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` still works as a fallback, but new projects should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Production Plaid OAuth redirect URIs must use HTTPS. `http://localhost:3000/accounts` is intended for Sandbox/Development.

## Step 6: Verify the Setup

### 6.1 Type Check

```bash
pnpm type-check
```

You should see no errors. If you do, check that all files are present.

### 6.2 Lint Check

```bash
pnpm lint
```

You should see: `✔ No ESLint warnings or errors`

### 6.3 Build the Application

```bash
pnpm build
```

You should see a successful build output with all pages compiled.

## Step 7: Run the Development Server

```bash
pnpm dev
```

The application should start and be available at [http://localhost:3000](http://localhost:3000)

You should see:
```
▲ Next.js 14.2.35
- Local:        http://localhost:3000
```

Open your browser and navigate to http://localhost:3000 to see the application.

## Step 8: Set Up Authentication

### 8.1 Enable Email Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Find "Email" and ensure it's enabled
3. Configure email settings:
   - **Enable email confirmations**: Recommended for production
   - **Secure email change**: Recommended
4. In **Authentication** settings, disable public/self-service signups if your project exposes that option. Spendfellow does not expose an in-app signup flow, but Supabase should also reject public signups at the auth layer.

### 8.2 Create Invited Users

Spendfellow is invite-only. Users should be added from Supabase, not from the app.

1. Go to **Authentication** → **Users**
2. Use **Invite user** or **Add user**
3. Enter the allowed user's email address
4. Send the invite or set an initial password
5. Have the user sign in at `/login`

After the second household member signs in, add them to your existing household from the database/admin flow before expecting them to see shared data.

## Step 9: Test Plaid Integration (Sandbox)

In Plaid Sandbox mode, you can test the bank linking flow with test credentials:

**Sandbox Test Credentials:**
- Username: `user_good`
- Password: `pass_good`
- Any verification code when prompted

These credentials will work with any institution in Sandbox mode.

## Troubleshooting

### Build Errors

**Problem**: TypeScript errors during build
**Solution**: Run `pnpm type-check` to see detailed errors

**Problem**: Module not found errors
**Solution**: Delete `node_modules` and run `pnpm install` again

### Connection Errors

**Problem**: "Missing Supabase environment variables"
**Solution**: Ensure `.env.local` exists and has correct values

**Problem**: Plaid API errors
**Solution**: Verify `PLAID_CLIENT_ID` and the matching `PLAID_SANDBOX_SECRET` or `PLAID_PRODUCTION_SECRET` are correct

### Database Errors

**Problem**: "relation does not exist" errors
**Solution**: Ensure you ran the migration SQL in Supabase

**Problem**: "permission denied" errors
**Solution**: Check Row-Level Security policies are correctly set up

## Next Steps

Now that your development environment is set up, you can:

1. **Explore the application**: Visit all the pages to see the current state
2. **Read the architecture**: Check out [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Review the schema**: See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
4. **Start developing**: Begin implementing features

## Production Deployment

For production deployment instructions, see the [README.md](./README.md#deployment) file.

## Getting Help

If you encounter issues:
1. Check this setup guide again
2. Review error messages carefully
3. Check [Supabase documentation](https://supabase.com/docs)
4. Check [Plaid documentation](https://plaid.com/docs/)
5. Open an issue on GitHub

## Security Reminders

- ✅ Never commit `.env.local` to version control
- ✅ Use strong passwords for your database
- ✅ Rotate API keys periodically
- ✅ Use environment variables for all secrets
- ✅ Enable MFA on your Supabase and Plaid accounts
