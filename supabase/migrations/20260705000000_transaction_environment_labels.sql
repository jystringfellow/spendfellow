-- Keep imported transactions easy to identify and delete by Plaid environment.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plaid_environment TEXT
  CHECK (plaid_environment IN ('sandbox', 'development', 'production'));

UPDATE transactions
SET plaid_environment = accounts.plaid_environment
FROM accounts
WHERE transactions.account_id = accounts.id
  AND transactions.plaid_environment IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_household_environment_date
  ON transactions(household_id, plaid_environment, date DESC);
