-- Historical budget lines imported from spreadsheet workflows.
-- These rows participate in budget reports without pretending to be bank transactions.

CREATE TABLE IF NOT EXISTS imported_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  source_cell TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  description TEXT NOT NULL,
  notes TEXT,
  raw_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, source, source_sheet, source_cell)
);

CREATE INDEX IF NOT EXISTS idx_imported_budget_lines_household_date
  ON imported_budget_lines(household_id, date);

CREATE INDEX IF NOT EXISTS idx_imported_budget_lines_household_category
  ON imported_budget_lines(household_id, category_id);

CREATE INDEX IF NOT EXISTS idx_imported_budget_lines_source
  ON imported_budget_lines(household_id, source);

ALTER TABLE imported_budget_lines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON imported_budget_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON imported_budget_lines TO service_role;

DROP POLICY IF EXISTS imported_budget_lines_policy ON imported_budget_lines;
CREATE POLICY imported_budget_lines_policy ON imported_budget_lines
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP TRIGGER IF EXISTS update_imported_budget_lines_updated_at ON imported_budget_lines;
CREATE TRIGGER update_imported_budget_lines_updated_at BEFORE UPDATE ON imported_budget_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
  SELECT 1
  FROM transaction_splits ts
  WHERE ts.transaction_id = t.id
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
