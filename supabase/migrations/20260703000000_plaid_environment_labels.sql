-- Keep Sandbox/Production Plaid data distinguishable while the app is in active development.

ALTER TABLE plaid_items
  ADD COLUMN IF NOT EXISTS plaid_environment TEXT
  CHECK (plaid_environment IN ('sandbox', 'development', 'production'));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plaid_environment TEXT
  CHECK (plaid_environment IN ('sandbox', 'development', 'production'));

UPDATE accounts
SET plaid_environment = plaid_items.plaid_environment
FROM plaid_items
WHERE accounts.plaid_item_id = plaid_items.plaid_item_id
  AND accounts.plaid_environment IS NULL;

ALTER TABLE plaid_items
  ALTER COLUMN plaid_environment SET DEFAULT 'sandbox';

REVOKE SELECT ON plaid_items FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  household_id,
  plaid_item_id,
  plaid_environment,
  institution_id,
  institution_name,
  status,
  error_code,
  last_sync_at,
  created_at,
  updated_at
) ON plaid_items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON plaid_items TO service_role;
