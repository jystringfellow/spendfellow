-- Plaid access tokens are server secrets. Household members can see Plaid item
-- metadata, but normal authenticated clients should not be able to read or
-- mutate plaid_access_token.

DROP POLICY IF EXISTS plaid_items_policy ON plaid_items;
DROP POLICY IF EXISTS plaid_items_select_policy ON plaid_items;

CREATE POLICY plaid_items_select_policy ON plaid_items
  FOR SELECT USING (is_household_member(household_id));

REVOKE SELECT ON plaid_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON plaid_items FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  household_id,
  plaid_item_id,
  institution_id,
  institution_name,
  status,
  error_code,
  last_sync_at,
  created_at,
  updated_at
) ON plaid_items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON plaid_items TO service_role;
