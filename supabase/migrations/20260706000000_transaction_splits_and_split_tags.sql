-- Transaction split foundation for budgeting and categorization workflows.
-- Whole transactions remain the source of truth; splits are budgeting/category
-- allocations that can carry their own notes and tags.

CREATE TABLE IF NOT EXISTS transaction_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id
  ON transaction_splits(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_household_category
  ON transaction_splits(household_id, category_id);

CREATE TABLE IF NOT EXISTS transaction_split_tags (
  transaction_split_id UUID NOT NULL REFERENCES transaction_splits(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_split_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_split_tags_tag_id
  ON transaction_split_tags(tag_id);

ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_split_tags ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_splits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_split_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_splits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON transaction_split_tags TO service_role;

DROP TRIGGER IF EXISTS update_transaction_splits_updated_at ON transaction_splits;
CREATE TRIGGER update_transaction_splits_updated_at BEFORE UPDATE ON transaction_splits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION transaction_split_household_matches_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_household_id UUID;
BEGIN
  SELECT household_id INTO transaction_household_id
  FROM transactions
  WHERE id = NEW.transaction_id;

  IF transaction_household_id IS NULL OR transaction_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'transaction split household must match transaction household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transaction_split_household_matches_transaction_trigger ON transaction_splits;
CREATE TRIGGER transaction_split_household_matches_transaction_trigger
  BEFORE INSERT OR UPDATE OF transaction_id, household_id ON transaction_splits
  FOR EACH ROW EXECUTE FUNCTION transaction_split_household_matches_transaction();

CREATE OR REPLACE FUNCTION transaction_split_category_matches_household()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  category_household_id UUID;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT household_id INTO category_household_id
  FROM categories
  WHERE id = NEW.category_id;

  IF category_household_id IS NULL OR category_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'transaction split category must belong to split household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transaction_split_category_matches_household_trigger ON transaction_splits;
CREATE TRIGGER transaction_split_category_matches_household_trigger
  BEFORE INSERT OR UPDATE OF category_id, household_id ON transaction_splits
  FOR EACH ROW EXECUTE FUNCTION transaction_split_category_matches_household();

CREATE OR REPLACE FUNCTION transaction_split_tag_matches_household()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  split_household_id UUID;
  tag_household_id UUID;
BEGIN
  SELECT household_id INTO split_household_id
  FROM transaction_splits
  WHERE id = NEW.transaction_split_id;

  SELECT household_id INTO tag_household_id
  FROM tags
  WHERE id = NEW.tag_id;

  IF split_household_id IS NULL OR tag_household_id IS NULL OR split_household_id <> tag_household_id THEN
    RAISE EXCEPTION 'transaction split tag must belong to split household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transaction_split_tag_matches_household_trigger ON transaction_split_tags;
CREATE TRIGGER transaction_split_tag_matches_household_trigger
  BEFORE INSERT OR UPDATE OF transaction_split_id, tag_id ON transaction_split_tags
  FOR EACH ROW EXECUTE FUNCTION transaction_split_tag_matches_household();

CREATE OR REPLACE FUNCTION transaction_splits_sum_matches_transaction(target_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(ts.amount_cents), 0) = t.amount_cents
  FROM transactions t
  LEFT JOIN transaction_splits ts ON ts.transaction_id = t.id
  WHERE t.id = target_transaction_id
  GROUP BY t.id, t.amount_cents;
$$;

DROP POLICY IF EXISTS transaction_splits_policy ON transaction_splits;
CREATE POLICY transaction_splits_policy ON transaction_splits
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS transaction_split_tags_policy ON transaction_split_tags;
CREATE POLICY transaction_split_tags_policy ON transaction_split_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM transaction_splits ts
      WHERE ts.id = transaction_split_tags.transaction_split_id
      AND is_household_member(ts.household_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM transaction_splits ts
      JOIN tags ON tags.id = transaction_split_tags.tag_id
      WHERE ts.id = transaction_split_tags.transaction_split_id
      AND ts.household_id = tags.household_id
      AND is_household_member(ts.household_id)
    )
  );

CREATE OR REPLACE VIEW budget_actual_lines AS
SELECT
  t.id AS transaction_id,
  NULL::UUID AS transaction_split_id,
  t.user_id,
  t.household_id,
  t.account_id,
  t.category_id,
  t.date,
  t.amount_cents,
  t.pending,
  t.notes,
  t.plaid_environment,
  false AS is_split
FROM transactions t
WHERE NOT EXISTS (
  SELECT 1
  FROM transaction_splits ts
  WHERE ts.transaction_id = t.id
)
UNION ALL
SELECT
  t.id AS transaction_id,
  ts.id AS transaction_split_id,
  t.user_id,
  t.household_id,
  t.account_id,
  ts.category_id,
  t.date,
  ts.amount_cents,
  t.pending,
  ts.notes,
  t.plaid_environment,
  true AS is_split
FROM transactions t
JOIN transaction_splits ts ON ts.transaction_id = t.id;

GRANT SELECT ON budget_actual_lines TO authenticated;
GRANT SELECT ON budget_actual_lines TO service_role;

DROP VIEW IF EXISTS budget_vs_actual;
DROP VIEW IF EXISTS monthly_spending_by_category;

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
