# Operational database repairs

Files in this directory are historical, opt-in repair scripts. They are not part of the active migration chain and must not be run on a fresh installation.

Before running a repair:

1. Confirm that the deployment experienced the incident described by the script.
2. Back up the database.
3. Review the affected rows in a transaction before committing the change.

Reusable schema changes belong in `supabase/migrations/`. Deployment-specific or incident-specific data corrections belong here, or only in the affected deployment's private repository.
