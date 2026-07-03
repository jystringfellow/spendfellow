-- Lightweight operational log for Plaid balance and transaction syncs.

CREATE TABLE IF NOT EXISTS plaid_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plaid_item_id TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  plaid_environment TEXT CHECK (plaid_environment IN ('sandbox', 'development', 'production')),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('transactions', 'balances')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  start_date DATE,
  end_date DATE,
  requested_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plaid_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plaid_sync_runs_policy ON plaid_sync_runs;
CREATE POLICY plaid_sync_runs_policy ON plaid_sync_runs
  FOR SELECT USING (is_household_member(household_id));

GRANT SELECT ON plaid_sync_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON plaid_sync_runs TO service_role;

CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_household_created
  ON plaid_sync_runs(household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_household_type_created
  ON plaid_sync_runs(household_id, sync_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plaid_sync_runs_account_created
  ON plaid_sync_runs(account_id, created_at DESC);
