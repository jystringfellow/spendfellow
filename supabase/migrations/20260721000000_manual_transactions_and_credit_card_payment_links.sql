-- Manual ledger entries and neutral credit-card payment transfers.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'plaid'
  CHECK (source IN ('plaid', 'manual'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'plaid'
  CHECK (source IN ('plaid', 'manual'));

CREATE INDEX IF NOT EXISTS idx_accounts_household_source
  ON accounts(household_id, source);

CREATE INDEX IF NOT EXISTS idx_transactions_household_source
  ON transactions(household_id, source);

CREATE TABLE IF NOT EXISTS credit_card_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  checking_transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  credit_transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (checking_transaction_id <> credit_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_card_payment_links_household
  ON credit_card_payment_links(household_id, created_at DESC);

CREATE OR REPLACE FUNCTION validate_credit_card_payment_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  checking_household_id UUID;
  checking_amount_cents BIGINT;
  checking_account_type TEXT;
  credit_household_id UUID;
  credit_amount_cents BIGINT;
  credit_account_type TEXT;
BEGIN
  SELECT t.household_id, t.amount_cents, a.type
  INTO checking_household_id, checking_amount_cents, checking_account_type
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  WHERE t.id = NEW.checking_transaction_id;

  SELECT t.household_id, t.amount_cents, a.type
  INTO credit_household_id, credit_amount_cents, credit_account_type
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  WHERE t.id = NEW.credit_transaction_id;

  IF checking_household_id IS NULL OR credit_household_id IS NULL THEN
    RAISE EXCEPTION 'credit card payment transactions were not found';
  END IF;

  IF checking_household_id <> NEW.household_id OR credit_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'credit card payment transactions must belong to the link household';
  END IF;

  IF checking_account_type <> 'depository' OR credit_account_type <> 'credit' THEN
    RAISE EXCEPTION 'credit card payments must link a depository account to a credit account';
  END IF;

  IF checking_amount_cents <= 0 OR credit_amount_cents >= 0 OR checking_amount_cents + credit_amount_cents <> 0 THEN
    RAISE EXCEPTION 'credit card payment amounts must be equal and opposite';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_credit_card_payment_link_trigger ON credit_card_payment_links;
CREATE TRIGGER validate_credit_card_payment_link_trigger
  BEFORE INSERT OR UPDATE ON credit_card_payment_links
  FOR EACH ROW EXECUTE FUNCTION validate_credit_card_payment_link();

CREATE OR REPLACE FUNCTION update_manual_account_balance_for_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.source = 'manual' THEN
      UPDATE accounts
      SET
        current_balance_cents = COALESCE(current_balance_cents, 0) + OLD.amount_cents,
        available_balance_cents = COALESCE(available_balance_cents, 0) + OLD.amount_cents
      WHERE id = OLD.account_id AND source = 'manual';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.source = 'manual' THEN
      UPDATE accounts
      SET
        current_balance_cents = COALESCE(current_balance_cents, 0) - NEW.amount_cents,
        available_balance_cents = COALESCE(available_balance_cents, 0) - NEW.amount_cents
      WHERE id = NEW.account_id AND source = 'manual';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_manual_account_balance_for_transaction_trigger ON transactions;
CREATE TRIGGER update_manual_account_balance_for_transaction_trigger
  AFTER INSERT OR UPDATE OF account_id, amount_cents, source OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_manual_account_balance_for_transaction();

CREATE OR REPLACE FUNCTION remove_invalid_credit_card_payment_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM credit_card_payment_links link
  USING transactions checking_transaction,
        accounts checking_account,
        transactions credit_transaction,
        accounts credit_account
  WHERE (link.checking_transaction_id = NEW.id OR link.credit_transaction_id = NEW.id)
    AND checking_transaction.id = link.checking_transaction_id
    AND checking_account.id = checking_transaction.account_id
    AND credit_transaction.id = link.credit_transaction_id
    AND credit_account.id = credit_transaction.account_id
    AND (
      checking_transaction.household_id <> link.household_id
      OR credit_transaction.household_id <> link.household_id
      OR checking_account.type <> 'depository'
      OR credit_account.type <> 'credit'
      OR checking_transaction.amount_cents <= 0
      OR credit_transaction.amount_cents >= 0
      OR checking_transaction.amount_cents + credit_transaction.amount_cents <> 0
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remove_invalid_credit_card_payment_links_trigger ON transactions;
CREATE TRIGGER remove_invalid_credit_card_payment_links_trigger
  AFTER UPDATE OF account_id, household_id, amount_cents ON transactions
  FOR EACH ROW EXECUTE FUNCTION remove_invalid_credit_card_payment_links();

ALTER TABLE credit_card_payment_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON credit_card_payment_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON credit_card_payment_links TO service_role;

DROP POLICY IF EXISTS credit_card_payment_links_policy ON credit_card_payment_links;
CREATE POLICY credit_card_payment_links_policy ON credit_card_payment_links
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP VIEW IF EXISTS budget_vs_actual;
DROP VIEW IF EXISTS monthly_spending_by_category;
DROP VIEW IF EXISTS budget_actual_lines;

CREATE VIEW budget_actual_lines AS
SELECT
  t.id AS transaction_id,
  NULL::UUID AS transaction_split_id,
  NULL::UUID AS imported_budget_line_id,
  t.user_id,
  t.household_id,
  t.account_id,
  t.category_id,
  t.date,
  t.amount_cents,
  t.pending,
  t.notes,
  t.plaid_environment,
  false AS is_split,
  'transaction'::TEXT AS source_type,
  t.description,
  t.merchant_name
FROM transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id
)
AND NOT EXISTS (
  SELECT 1
  FROM credit_card_payment_links ccpl
  WHERE ccpl.checking_transaction_id = t.id OR ccpl.credit_transaction_id = t.id
)
UNION ALL
SELECT
  t.id AS transaction_id,
  ts.id AS transaction_split_id,
  NULL::UUID AS imported_budget_line_id,
  t.user_id,
  t.household_id,
  t.account_id,
  ts.category_id,
  t.date,
  ts.amount_cents,
  t.pending,
  ts.notes,
  t.plaid_environment,
  true AS is_split,
  'transaction_split'::TEXT AS source_type,
  t.description,
  t.merchant_name
FROM transactions t
JOIN transaction_splits ts ON ts.transaction_id = t.id
WHERE NOT EXISTS (
  SELECT 1
  FROM credit_card_payment_links ccpl
  WHERE ccpl.checking_transaction_id = t.id OR ccpl.credit_transaction_id = t.id
)
UNION ALL
SELECT
  NULL::UUID AS transaction_id,
  NULL::UUID AS transaction_split_id,
  ibl.id AS imported_budget_line_id,
  ibl.user_id,
  ibl.household_id,
  NULL::UUID AS account_id,
  ibl.category_id,
  ibl.date,
  ibl.amount_cents,
  false AS pending,
  ibl.notes,
  NULL::TEXT AS plaid_environment,
  false AS is_split,
  'imported_budget_line'::TEXT AS source_type,
  ibl.description,
  NULL::TEXT AS merchant_name
FROM imported_budget_lines ibl;

GRANT SELECT ON budget_actual_lines TO authenticated;
GRANT SELECT ON budget_actual_lines TO service_role;

CREATE VIEW monthly_spending_by_category AS
SELECT
  bal.user_id,
  bal.household_id,
  EXTRACT(YEAR FROM bal.date)::INTEGER as year,
  EXTRACT(MONTH FROM bal.date)::INTEGER as month,
  c.id as category_id,
  c.name as category_name,
  SUM(bal.amount_cents) as total_cents,
  COUNT(*) as transaction_count
FROM budget_actual_lines bal
JOIN categories c ON bal.category_id = c.id
WHERE NOT bal.pending
GROUP BY bal.user_id, bal.household_id, year, month, c.id, c.name;

GRANT SELECT ON monthly_spending_by_category TO authenticated;
GRANT SELECT ON monthly_spending_by_category TO service_role;

CREATE VIEW budget_vs_actual AS
SELECT
  b.user_id,
  b.household_id,
  b.year,
  b.month,
  b.category_id,
  c.name as category_name,
  b.amount_cents as budgeted_cents,
  COALESCE(SUM(bal.amount_cents), 0) as actual_cents,
  b.amount_cents - COALESCE(SUM(bal.amount_cents), 0) as difference_cents
FROM budgets b
JOIN categories c ON b.category_id = c.id
LEFT JOIN budget_actual_lines bal ON
  bal.category_id = b.category_id
  AND bal.household_id = b.household_id
  AND EXTRACT(YEAR FROM bal.date)::INTEGER = b.year
  AND EXTRACT(MONTH FROM bal.date)::INTEGER = b.month
  AND NOT bal.pending
GROUP BY b.user_id, b.household_id, b.year, b.month, b.category_id, c.name, b.amount_cents;

GRANT SELECT ON budget_vs_actual TO authenticated;
GRANT SELECT ON budget_vs_actual TO service_role;
