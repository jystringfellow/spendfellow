CREATE TABLE IF NOT EXISTS account_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  current_balance_cents BIGINT,
  available_balance_cents BIGINT,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_account_balance_snapshots_household_recorded
  ON account_balance_snapshots(household_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_account_balance_snapshots_account_recorded
  ON account_balance_snapshots(account_id, recorded_at);

ALTER TABLE account_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view household account balance snapshots" ON account_balance_snapshots
  FOR SELECT USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

