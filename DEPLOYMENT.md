# Deployment Guide

Spendfellow is designed so the reusable application code can be public while each household keeps its own deployment, database, Plaid credentials, and secrets private.

## Recommended Model

Use this public repository as the source repository, then create one private repository for your own deployment:

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

This keeps credentials out of Git while still letting you pull reusable app updates into your private deployment. The private repository can stay nearly identical to the public one; put deployment-specific values in Supabase, Plaid, Vercel, and local environment variables instead of hard-coding them.

## Why Not a Private Fork?

GitHub forks usually inherit the visibility of the source repository. A fork of a public repository is public. If you want a private deployment repository, create a separate private repository instead of using GitHub's fork button.

## Public Repo Safety Checklist

Before publishing or connecting deployment automation, verify that Git only contains reusable code and neutral assets:

```bash
git status --short
git ls-files
git log --all --name-only --pretty=format: | sort -u
```

The public repository should not track:

- `.env`, `.env.local`, `.vercel/`, `.next/`, `node_modules/`, or `*.tsbuildinfo`
- Plaid secrets, Plaid access tokens, Supabase secret keys, Vercel tokens, GitHub tokens, private keys, or cookies
- Bank statements, spreadsheet exports, screenshots containing real balances or transactions, Amazon order captures, receipt images, or other financial evidence
- Household-specific category names, merchant notes, account names, or seed data unless intentionally neutralized

Ignored local research artifacts may exist on your machine under folders such as `assets/from-google/`, `assets/example-screenshots/`, `assets/amazon-snaps/`, and `assets/ux-cleanup/`. That is fine as long as they have never been committed. If a private file was committed, remove it from Git tracking with `git rm --cached` before publishing. If it was already pushed to a public repository, treat the data as exposed and rotate affected credentials.

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
git push -u origin main
```

From then on, `origin` is your private deployment repo and `upstream` is this public template/source repo.

If you already cloned the public repository and want to reuse that local checkout for your private deployment, run the same remote rename/add commands from the existing checkout after creating the empty private repository.

## Pulling Public Updates Into Your Private Deployment Repo

When this public repository changes, pull those updates into your private deployment repo:

```bash
git fetch upstream
git merge --ff-only upstream/main
git push origin main
```

Use `git merge upstream/main` instead of `--ff-only` only if your private repository intentionally has private commits that are not in the public repository. Prefer keeping private changes small so updates stay easy.

If Vercel is connected to the private repository, pushing to the configured production branch can trigger a deployment.

## Maintainer Workflow For This Public Repo

If you maintain the public template repository and also deploy your own private copy, your local remotes might look like this:

```bash
upstream -> public Spendfellow repository
origin   -> private deployment repository
```

To convert this local checkout into that maintainer layout after creating an empty private GitHub repository:

```bash
git remote rename origin upstream
git remote add origin git@github.com:you/spendfellow-private.git
git push -u origin main
```

Push reusable changes to `upstream`, then push the deployable branch to `origin`:

```bash
git push upstream main
git push origin main
```

Before pushing to the public `upstream`, run the safety checklist above and confirm private artifacts remain ignored.

## Vercel Setup

1. Create a private GitHub repository for your deployment.
2. Import that private repository in Vercel.
3. Set the Vercel framework preset to Next.js.
4. Use `pnpm install --frozen-lockfile` as the install command if Vercel does not infer pnpm from `pnpm-lock.yaml`.
5. Set all real environment variables in the Vercel dashboard.
6. Keep `.env.local` local only.
7. Use a production HTTPS URL for Plaid OAuth redirects.

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key

PLAID_CLIENT_ID=your_plaid_client_id
PLAID_ENV=production
PLAID_SANDBOX_SECRET=your_plaid_secret_sandbox
PLAID_DEVELOPMENT_SECRET=your_plaid_secret_development
PLAID_PRODUCTION_SECRET=your_plaid_secret_production
PLAID_REDIRECT_URI=https://your-app-domain.example/accounts

NEXT_PUBLIC_APP_URL=https://your-app-domain.example
```

For a Sandbox-only deployment, set `PLAID_ENV=sandbox` and omit production/development secrets if you are not using those environments. For production bank connections, set `PLAID_ENV=production`, add `PLAID_PRODUCTION_SECRET`, and register the exact `PLAID_REDIRECT_URI` in Plaid.

Do not set `SUPABASE_SECRET_KEY` as a `NEXT_PUBLIC_` variable. It must remain server-only.

## Template Setup Checklist

When using Spendfellow as a starting point for your own financial tracker, keep these choices private to your deployment:

1. Create your own Supabase project and run every migration in `supabase/migrations/`.
2. Create your own Plaid app and set Plaid secrets only in `.env.local` or Vercel environment variables.
3. Use your own Vercel project and production domain.
4. Set `NEXT_PUBLIC_APP_URL` and `PLAID_REDIRECT_URI` to the exact deployed HTTPS origin.
5. Configure Supabase Auth for your household. Disable open signups or restrict signups before sharing the URL.
6. Invite household users through Supabase Auth.
7. Keep screenshots, statement exports, spreadsheet exports, Amazon order captures, and other real financial evidence out of Git.
8. Keep household-specific category names and seed data out of reusable migrations unless they are neutral demo data.

The public repository should contain reusable application code, schema, neutral sample data, and documentation. The private deployment repository can carry deployment-specific history, but it still should not contain secrets or financial exports.

## Supabase Setup

Each deployment should use its own Supabase project.

1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` in filename order.
3. Configure Supabase Auth.
4. Disable public/self-service signups if available.
5. Invite household members from the **Household Access** panel in Spendfellow settings.

For Supabase Auth, configure these URLs:

```text
Site URL: https://your-app-domain.example
Redirect URL: https://your-app-domain.example/auth/callback
Redirect URL: https://your-app-domain.example/auth/set-password
```

For local development, also allow:

```text
http://localhost:3000/auth/callback
http://localhost:3000/auth/set-password
```

In **Authentication** → **Email Templates**, configure the **Invite user** link as:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}">
  Accept household invitation
</a>
```

Configure the **Magic link** template as:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">
  Sign in
</a>
```

Spendfellow has no public signup screen and sends ordinary magic links with `shouldCreateUser: false`. Household invitations are created by an authenticated owner through a server-only Supabase admin client. Supabase Auth should still reject public/self-service signups where the project settings allow it.

After the first user signs in, use the app settings seed action to create the household bootstrap data. Additional users are attached to that household automatically after accepting their email-bound invitation and choosing a password.

## Plaid Setup

Each deployment should use its own Plaid app credentials.

For Production OAuth institutions, Plaid requires an HTTPS redirect URI. Add this exact value in the Plaid dashboard:

```text
https://your-app-domain.example/accounts
```

Local HTTP redirect URIs are useful for Sandbox and Development, but they are not valid for Plaid Production OAuth.

If you change the deployed domain later, update all three places together:

- `NEXT_PUBLIC_APP_URL` in Vercel
- `PLAID_REDIRECT_URI` in Vercel
- The allowed redirect URI in the Plaid Dashboard

Then redeploy the Vercel project.

## Deployment Work You Can Do Locally

These steps can be completed from the repository checkout:

```bash
pnpm install
pnpm type-check
pnpm build
git status --short
```

These steps require account access or dashboard credentials:

- Create the private GitHub deployment repository.
- Import the private repository into Vercel.
- Create/configure the Supabase project and Auth URLs.
- Add real environment variables in Vercel.
- Create/configure the Plaid app and redirect URI.
- Invite household users.

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
