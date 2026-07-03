-- Plaid identifiers are environment scoped. Sandbox and Production data can
-- coexist, so local uniqueness needs to include plaid_environment.

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_plaid_account_id_key;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_plaid_transaction_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_plaid_environment_plaid_account_id_key'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_plaid_environment_plaid_account_id_key
      UNIQUE (plaid_environment, plaid_account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_plaid_environment_plaid_transaction_id_key'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_plaid_environment_plaid_transaction_id_key
      UNIQUE (plaid_environment, plaid_transaction_id);
  END IF;
END;
$$;
