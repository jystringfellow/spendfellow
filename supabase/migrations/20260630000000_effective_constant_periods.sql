-- Year/month effective periods for constants.
-- Allows values to change mid-year without overwriting earlier month assumptions.

CREATE TABLE IF NOT EXISTS category_budget_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  start_month INTEGER NOT NULL CHECK (start_month >= 1 AND start_month <= 12),
  amount_cents BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, category_id, year, start_month)
);

CREATE TABLE IF NOT EXISTS recurring_value_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recurring_value_id UUID NOT NULL REFERENCES recurring_values(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  start_month INTEGER NOT NULL CHECK (start_month >= 1 AND start_month <= 12),
  amount_cents BIGINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, recurring_value_id, year, start_month)
);

CREATE INDEX IF NOT EXISTS idx_category_budget_periods_lookup
  ON category_budget_periods(household_id, category_id, year, start_month);

CREATE INDEX IF NOT EXISTS idx_recurring_value_periods_lookup
  ON recurring_value_periods(household_id, recurring_value_id, year, start_month);

ALTER TABLE category_budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_value_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_budget_periods_policy ON category_budget_periods;
CREATE POLICY category_budget_periods_policy ON category_budget_periods
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS recurring_value_periods_policy ON recurring_value_periods;
CREATE POLICY recurring_value_periods_policy ON recurring_value_periods
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP TRIGGER IF EXISTS update_category_budget_periods_updated_at ON category_budget_periods;
CREATE TRIGGER update_category_budget_periods_updated_at BEFORE UPDATE ON category_budget_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recurring_value_periods_updated_at ON recurring_value_periods;
CREATE TRIGGER update_recurring_value_periods_updated_at BEFORE UPDATE ON recurring_value_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO category_budget_periods (household_id, category_id, year, start_month, amount_cents)
SELECT
  household_id,
  id,
  EXTRACT(YEAR FROM NOW())::INTEGER,
  1,
  default_monthly_budget_cents
FROM categories
WHERE household_id IS NOT NULL
AND NOT is_group
ON CONFLICT (household_id, category_id, year, start_month) DO NOTHING;

INSERT INTO recurring_value_periods (household_id, recurring_value_id, year, start_month, amount_cents)
SELECT
  household_id,
  id,
  EXTRACT(YEAR FROM NOW())::INTEGER,
  1,
  amount_cents
FROM recurring_values
WHERE household_id IS NOT NULL
AND kind = 'fixed'
ON CONFLICT (household_id, recurring_value_id, year, start_month) DO NOTHING;

