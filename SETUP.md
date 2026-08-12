# Spendfellow Setup Guide

This guide will walk you through setting up Spendfellow from scratch.

For Vercel deployment and the public-template/private-deployment repository pattern, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Prerequisites

Before you begin, ensure you have:
- **Node.js 20+** and pnpm installed
- A **Docker-compatible runtime** for local database validation
- A **Supabase account** (free tier available at [supabase.com](https://supabase.com))
- A **Plaid account** (free sandbox at [plaid.com](https://plaid.com))
- **Git** installed on your system

Docker Desktop and Colima are both supported. If both are installed, run only one Docker engine at a time before using the local Supabase commands.

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

### 3.2 Apply the Database Migrations

From the checkout used for deployment, authenticate the pinned Supabase CLI, link the project, preview the pending migrations, and apply them:

```bash
pnpm supabase login
pnpm supabase link --project-ref YOUR_PROJECT_REF
pnpm db:migrate:linked
```

The project reference is available in the Supabase dashboard URL and project settings. The link is local metadata stored under the ignored `supabase/.temp/` directory. `db:migrate:linked` previews pending migrations and requires typed confirmation before applying them.

When using the recommended public-template/private-deployment layout, link only the private checkout to the hosted project. The public checkout can validate migrations against its disposable local database without a production link.

Do not paste files from `supabase/migrations/` into the SQL editor. The CLI records each applied migration version so subsequent pushes execute only new migrations. Files under `supabase/repairs/` are opt-in incident repairs and are not part of a fresh installation.

If this is an existing database whose SQL was previously applied manually, stop here and follow [Adopting the baseline on a manually managed database](./DEPLOYMENT.md#adopting-the-baseline-on-a-manually-managed-database) before running `pnpm db:migrate:linked`.

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

### 8.2 Configure Auth URLs

In **Authentication** → **URL Configuration**, configure:

```text
Site URL: https://your-app-domain.example
Redirect URLs:
  https://your-app-domain.example/auth/callback
  https://your-app-domain.example/auth/set-password
```

For local development, also allow:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/set-password
```

The Site URL should match `NEXT_PUBLIC_APP_URL`. Supabase validates the per-invitation redirect before making it available to the email template.

### 8.3 Configure Server-Side Email Links

Spendfellow verifies email tokens on the server so the authenticated session can be stored in cookies. In **Authentication** → **Email Templates**, update both the **Invite user** and **Magic link** templates.

Use this link in the **Invite user** template:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}">
  Accept household invitation
</a>
```

Use this link in the **Magic link** template:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">
  Sign in
</a>
```

Keep any surrounding email copy or branding you want. The `token_hash`, `type`, and `next` query parameters must remain intact.

### 8.4 Invite Household Members

Spendfellow is invite-only. After the owner has created their household:

1. Sign in and open **Settings**.
2. Find **Household Access**.
3. Enter the new member's email and choose **Invite member**.
4. The recipient opens the Supabase email, verifies their address, chooses a password, and is added to the household automatically.

Keep public/self-service signups disabled. The server uses the Supabase secret key to create invited Auth users, and database acceptance requires the authenticated email to match a pending invitation. Reinviting an existing Auth user sends a magic link through the same onboarding flow.

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
**Solution**: Run `pnpm db:push:dry-run` from the linked deployment checkout, review the pending migration list, and then run `pnpm db:push`

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
