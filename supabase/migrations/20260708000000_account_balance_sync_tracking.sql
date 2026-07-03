-- Track Plaid balance refreshes separately from transaction syncs so account
-- balance API calls can be throttled per local account.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_balance_sync_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_accounts_household_balance_sync
  ON accounts(household_id, last_balance_sync_at);
