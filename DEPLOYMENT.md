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

### Which repository owns what?

| Concern | Public `spendfellow` | Private `spendfellow-private` |
| --- | --- | --- |
| Reusable application code and documentation | Source of truth | Receives updates from `upstream` |
| `supabase/config.toml` and active migrations | Source of truth | Receives the same tracked files from `upstream` |
| Local Supabase development and migration validation | Recommended checkout | Optional |
| Production Supabase project link | Do not link | Link here; metadata stays in ignored `supabase/.temp/` |
| Plaid, Supabase, and deployment secrets | Never commit | Keep in `.env.local` or provider settings; never commit |
| Vercel production branch | Not connected | Connect private `main` |

The `project_id` in `supabase/config.toml` names the local Docker stack; it is not the hosted Supabase project reference. `pnpm supabase link` stores the hosted project reference separately under `supabase/.temp/`, which remains local and ignored.

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

## Publishing Public Updates To Your Private Deployment

Finish and merge reusable work in the public repository first. Validate database migrations against the disposable local database before opening or merging the public pull request:

```bash
cd ~/Code/spendfellow
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm test
pnpm type-check
pnpm build
pnpm db:stop
```

After the public pull request is merged, update the private deployment checkout:

```bash
cd ~/Code/spendfellow-private
git status --short
git fetch upstream
git merge --ff-only upstream/main
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
pnpm build
pnpm db:migrate:linked
git push origin main
```

Use `git merge upstream/main` instead of `--ff-only` only if your private repository intentionally has private commits that are not in the public repository. Prefer keeping private changes small so updates stay easy.

The private checkout must be linked to its production Supabase project before running `db:migrate:linked`. The command shows the linked migration state, runs a dry preview, and requires you to type `APPLY` before it changes the database. It intentionally performs no Git operations and does not deploy the application.

Apply database migrations only after the application checks pass, but before pushing private `main`; this keeps schema changes ahead of application code that may depend on them. If Vercel is connected to private `main`, the final Git push triggers the application deployment. Vercel does not run database migrations automatically.

When converting an existing manually managed database to the baseline for the first time, follow [Adopting the baseline on a manually managed database](#adopting-the-baseline-on-a-manually-managed-database) before running `db:migrate:linked`.

### First sync after adopting the tracked CLI configuration

If `supabase init` was previously run in the private checkout, `git status --short` may show untracked `supabase/config.toml` and `supabase/.gitignore` files. Once the public repository tracks those same paths, they must be moved aside or removed before the first upstream merge can write the tracked versions. Preserve `supabase/.temp/`; that ignored directory contains the private checkout's hosted-project link.

For the first sync only, move the generated copies to a temporary backup before merging:

```bash
cd ~/Code/spendfellow-private
mkdir -p /tmp/spendfellow-private-supabase-init
mv supabase/config.toml /tmp/spendfellow-private-supabase-init/config.toml
mv supabase/.gitignore /tmp/spendfellow-private-supabase-init/supabase.gitignore
git fetch upstream
git merge --ff-only upstream/main
```

After the merge, the public tracked versions replace them and the ignored `supabase/.temp/` link continues to identify the production project. The temporary copies can be deleted after confirming `pnpm supabase migration list --linked` reaches the intended project.

Confirm the private checkout uses this remote layout:

```bash
origin   https://github.com/you/spendfellow-private.git
upstream https://github.com/<source-owner>/spendfellow.git
```

The public checkout can keep the ordinary layout:

```bash
origin https://github.com/<source-owner>/spendfellow.git
```

Keeping separate public and private checkouts makes it harder to accidentally push deployment-only state to the public repository.

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

1. Create your own Supabase project, link it from the private checkout, and apply the active migrations with `pnpm db:migrate:linked`.
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
2. Install dependencies and authenticate the pinned Supabase CLI:

   ```bash
   pnpm install --frozen-lockfile
   pnpm supabase login
   ```

3. Link the private checkout to the project. The link is stored under the gitignored `supabase/.temp/` directory:

   ```bash
   pnpm supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Preview and apply pending database migrations:

   ```bash
   pnpm db:migrate:linked
   ```

5. Configure Supabase Auth.
6. Disable public/self-service signups if available.
7. Invite household members from the **Household Access** panel in Spendfellow settings.

Do not manually paste the files from `supabase/migrations/` into the SQL editor. The CLI records applied migration versions and skips them on later pushes. Files in `supabase/repairs/` are documented, opt-in incident repairs and are not part of fresh setup.

### Adopting the baseline on a manually managed database

If a database already has the current Spendfellow schema because SQL was previously applied by hand, its migration-history table may be empty. Do not run `pnpm db:push` until the live schema has been compared with the baseline.

Start from the public checkout and build the canonical current schema from the complete active migration chain:

```bash
pnpm db:start
pnpm db:reset
pnpm supabase db query --local --file supabase/tests/schema_fingerprint.sql
pnpm db:stop
```

From the linked private checkout, fingerprint and dump the existing hosted schema:

```bash
pnpm supabase db query --linked --file supabase/tests/schema_fingerprint.sql
pnpm supabase db dump --linked --schema public --file /tmp/spendfellow-production-public-schema.sql
```

If the fingerprint and object count match, the hosted schema already represents the complete active chain. If either differs, stop and inspect the schema dump. Every difference must be understood before continuing: it must either be non-structural deployment configuration or be corrected by a later active migration that will run after the baseline is recorded. Never push the baseline itself over an existing database.

The fingerprint uses stable function signatures for routine grants rather than PostgreSQL's database-specific internal identifiers. It also excludes the optional `pg_net` extension, which is Supabase platform configuration and is not used by SpendFellow. This keeps equivalent local and hosted application schemas comparable without hiding differences in application-owned objects or permissions.

After completing that comparison, record only the baseline version as already applied and inspect the remaining migration list:

```bash
pnpm supabase migration repair 20260726120000 --status applied --linked
pnpm supabase migration list --linked
pnpm db:push:dry-run
```

Migration repair changes only Supabase's migration-history table; it does not execute the baseline SQL or alter application data. The migration list and dry run must contain only reviewed post-baseline migrations. Never mark a version applied merely to silence a schema error. This is a one-time transition for a database that was already managed manually; a new empty project should run the baseline normally with `pnpm db:push`.

Spendfellow's first baseline release intentionally follows the baseline with `20260810000000_baseline_compatibility_and_permissions.sql`. That migration fills the small schema gap found in the original manually managed deployment, makes authenticated Data API grants explicit, protects Plaid tokens from authenticated reads, and makes reporting views honor the underlying household RLS policies. It should be the only pending migration immediately after adopting baseline `20260726120000`.

For the first release containing the baseline, use this order:

1. Merge the baseline pull request into public `main`.
2. Merge public `main` into the private checkout locally, but do not push private `main` yet.
3. Install dependencies and run the application checks in the private checkout.
4. Compare the local fingerprint with the linked fingerprint and inspect a linked schema dump when they differ.
5. Confirm that every difference is either intentional deployment configuration or covered by the reviewed post-baseline compatibility migration.
6. Record baseline `20260726120000` as applied.
7. Confirm the migration list and dry run show only `20260810000000_baseline_compatibility_and_permissions.sql`.
8. Run `pnpm db:push`, then rerun both fingerprints and require them to match.
9. Push private `main` to trigger Vercel.

If the linked fingerprint cannot run because Supabase cannot create its temporary CLI login role or times out connecting, stop and retry later. That is not evidence that the schemas match, and it is not safe to perform the migration repair while the comparison is unavailable.

For CLI temporary-role or pooler failures, check Database Settings for network bans and database health, then use password-based linking without placing the password in shell history:

```zsh
read -s "SUPABASE_DB_PASSWORD?Supabase database password: "
echo
export SUPABASE_DB_PASSWORD
pnpm supabase link --project-ref YOUR_PROJECT_REF
unset SUPABASE_DB_PASSWORD
```

Do not paste the database password into an issue, pull request, log, or chat. The CLI stores a supplied link password in native credential storage when available.

### Creating future migrations

After the baseline has been adopted, do not edit or replace it. Create a new timestamped migration for every reusable schema change:

```bash
pnpm supabase migration new descriptive_change_name
```

Edit the new SQL file, validate the complete migration chain locally, and include it in the public pull request. After that pull request merges, the private deployment workflow applies only the newly pending migration. Put incident-specific or deployment-specific data fixes in `supabase/repairs/`, not in the fresh-install chain.

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
