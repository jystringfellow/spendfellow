# SpendFellow Setup Guide

This guide will walk you through setting up SpendFellow from scratch.

## Prerequisites

Before you begin, ensure you have:
- **Node.js 18+** and npm installed
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
npm install
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
3. Open the file `supabase/migrations/20260115000000_initial_schema.sql` from this repository
4. Copy the entire contents
5. Paste into the Supabase SQL Editor
6. Click "Run" to execute the migration
7. You should see "Success. No rows returned" (this is normal)

### 3.3 Get Your Supabase Credentials

1. In your Supabase project dashboard, click on **Settings** (gear icon) in the left sidebar
2. Click on **API** under Project Settings
3. You'll need three values:
   - **Project URL**: Found under "Project URL" (starts with https://xxx.supabase.co)
   - **Anon Public Key**: Found under "Project API keys" → "anon public"
   - **Service Role Key**: Found under "Project API keys" → "service_role" (keep this secret!)

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Plaid API Configuration (use sandbox for development)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret_sandbox
PLAID_ENV=sandbox

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Important Notes:**
- Replace all placeholder values with your actual credentials
- Never commit `.env.local` to version control (it's in `.gitignore`)
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `PLAID_SECRET` confidential

## Step 6: Verify the Setup

### 6.1 Type Check

```bash
npm run type-check
```

You should see no errors. If you do, check that all files are present.

### 6.2 Lint Check

```bash
npm run lint
```

You should see: `✔ No ESLint warnings or errors`

### 6.3 Build the Application

```bash
npm run build
```

You should see a successful build output with all pages compiled.

## Step 7: Run the Development Server

```bash
npm run dev
```

The application should start and be available at [http://localhost:3000](http://localhost:3000)

You should see:
```
▲ Next.js 14.2.35
- Local:        http://localhost:3000
```

Open your browser and navigate to http://localhost:3000 to see the application.

## Step 8: Set Up Authentication (Optional but Recommended)

### 8.1 Enable Email Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Find "Email" and ensure it's enabled
3. Configure email settings:
   - **Enable email confirmations**: Recommended for production
   - **Secure email change**: Recommended

### 8.2 Test Authentication

You can create a test user in two ways:

**Option A: Via Supabase Dashboard**
1. Go to **Authentication** → **Users**
2. Click "Add user"
3. Enter email and password
4. Click "Create user"

**Option B: Via SQL**
Run this in the SQL Editor (replace with your email):
```sql
-- This creates a user for testing
-- In production, users will sign up via the UI
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'test@example.com',
  crypt('your_password_here', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

-- Then create the user in the users table
INSERT INTO users (id, email, full_name)
SELECT id, email, 'Test User'
FROM auth.users
WHERE email = 'test@example.com';
```

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
**Solution**: Run `npm run type-check` to see detailed errors

**Problem**: Module not found errors
**Solution**: Delete `node_modules` and run `npm install` again

### Connection Errors

**Problem**: "Missing Supabase environment variables"
**Solution**: Ensure `.env.local` exists and has correct values

**Problem**: Plaid API errors
**Solution**: Verify `PLAID_CLIENT_ID` and `PLAID_SECRET` are correct

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
