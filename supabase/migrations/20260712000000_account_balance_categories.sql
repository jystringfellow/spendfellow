ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS balance_category TEXT
  CHECK (balance_category IN ('checking', 'savings', 'ccDebt', 'investments', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_accounts_household_balance_category
  ON accounts(household_id, balance_category);
