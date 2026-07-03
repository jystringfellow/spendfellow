# Deployment Guide

Spendfellow is designed so the reusable application code can be public while each household keeps its own deployment, database, Plaid credentials, and secrets private.

## Recommended Model

Use this public repository as the template/source repository, then create one private repository for your own deployment:

- This public Spendfellow repository for reusable app code.
- A private deployment repository connected to Vercel.

The private repository is not a GitHub fork. It is a separate private repository that uses this public repository as an upstream remote.

```text
public source/template repo
  github.com/<source-owner>/spendfellow

your private deployment repo
  github.com/you/spendfellow-private
  upstream -> public source/template repo
  origin   -> private deployment repo
  Vercel connected to private deployment repo
```

This keeps credentials out of Git while still letting you pull reusable app updates into your private deployment.

## Why Not a Private Fork?

GitHub forks usually inherit the visibility of the source repository. A fork of a public repository is public. If you want a private deployment repository, create a separate private repository instead of using GitHub's fork button.

## Repository Setup For Your Private Deployment

Create an empty private GitHub repository for your deployment, then clone this public repository locally:

```bash
git clone git@github.com:<source-owner>/spendfellow.git spendfellow-private
cd spendfellow-private
git remote rename origin upstream
git remote add origin git@github.com:you/spendfellow-private.git
git remote -v
```

Push the current code to your private deployment repository:

```bash
git push origin main
```

From then on, `origin` is your private deployment repo and `upstream` is this public template/source repo.

## Pulling Public Updates Into Your Private Deployment Repo

When this public repository changes, pull those updates into your private deployment repo:

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

If Vercel is connected to the private repository, pushing to the configured production branch can trigger a deployment.

## Maintainer Workflow For This Public Repo

If you maintain the public template repository and also deploy your own private copy, your local remotes might look like this:

```bash
upstream -> public Spendfellow repository
origin   -> private deployment repository
```

Push reusable changes to `upstream`, then merge or push deployable changes to `origin`:

```bash
git push upstream main
git push origin main
```

## Vercel Setup

1. Create a private GitHub repository for your deployment.
2. Import that private repository in Vercel.
3. Set all real environment variables in the Vercel dashboard.
4. Keep `.env.local` local only.
5. Use a production HTTPS URL for Plaid OAuth redirects.

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key

PLAID_CLIENT_ID=your_plaid_client_id
PLAID_ENV=production
PLAID_SANDBOX_SECRET=your_plaid_secret_sandbox
PLAID_PRODUCTION_SECRET=your_plaid_secret_production
PLAID_REDIRECT_URI=https://your-app-domain.example/accounts

NEXT_PUBLIC_APP_URL=https://your-app-domain.example
```

## Supabase Setup

Each deployment should use its own Supabase project.

1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` in filename order.
3. Configure Supabase Auth.
4. Disable public/self-service signups if available.
5. Add invited users from Supabase Auth, not from the Spendfellow app.

## Plaid Setup

Each deployment should use its own Plaid app credentials.

For Production OAuth institutions, Plaid requires an HTTPS redirect URI. Add this exact value in the Plaid dashboard:

```text
https://your-app-domain.example/accounts
```

Local HTTP redirect URIs are useful for Sandbox and Development, but they are not valid for Plaid Production OAuth.

## Local Production OAuth Testing With Cloudflare Tunnel

For local testing against Plaid Production OAuth institutions, expose the local Next.js app through an HTTPS tunnel.

### Temporary Quick Tunnel

Start Spendfellow locally:

```bash
pnpm dev
```

In another terminal, start a Cloudflare Tunnel to the local app:

```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a temporary HTTPS URL, usually shaped like:

```text
https://example-random-name.trycloudflare.com
```

Use that URL for local Plaid OAuth testing:

```env
NEXT_PUBLIC_APP_URL=https://example-random-name.trycloudflare.com
PLAID_REDIRECT_URI=https://example-random-name.trycloudflare.com/accounts
```

Then add the exact redirect URI in the Plaid Dashboard:

```text
https://example-random-name.trycloudflare.com/accounts
```

Restart the local dev server after changing `.env.local`.

Cloudflare's temporary tunnel URLs can change between runs. If the URL changes, update `.env.local`, update the Plaid allowed redirect URI, and restart `pnpm dev`.

### Stable Named Tunnel

For repeated testing, create a named Cloudflare Tunnel on a stable domain you control.

Example target shape:

```text
https://spendfellow-local.yourdomain.example -> http://localhost:3000
```

In Cloudflare Zero Trust:

1. Go to **Networks** -> **Tunnels**.
2. Create a named tunnel, such as `spendfellow-local`.
3. Install or run the `cloudflared` connector command Cloudflare provides.
4. Add a public hostname:
   - Subdomain: `spendfellow-local`
   - Domain: `yourdomain.example`
   - Service type: `HTTP`
   - Service URL: `localhost:3000`

Use the stable hostname in `.env.local`:

```env
NEXT_PUBLIC_APP_URL=https://spendfellow-local.yourdomain.example
PLAID_REDIRECT_URI=https://spendfellow-local.yourdomain.example/accounts
```

Add this exact redirect URI in the Plaid Dashboard:

```text
https://spendfellow-local.yourdomain.example/accounts
```

For local testing, both the Next.js app and the tunnel connector must be running:

```bash
pnpm dev
```

In another terminal:

```bash
cloudflared tunnel run spendfellow-local
```

The Cloudflare DNS and tunnel configuration persist, but traffic only reaches your local app while the connector is running and your machine can reach `localhost:3000`.

## Keep Private Changes Small

Prefer environment variables over private code changes. The private deployment repository should ideally differ from the public template only by deployment branch history, not by hard-coded household-specific behavior.
