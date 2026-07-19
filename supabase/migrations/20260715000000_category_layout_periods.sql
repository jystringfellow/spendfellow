-- Time-aware category layout for planning worksheets.
-- Category identity remains global, while visibility, parent group, and order can vary by effective period.

CREATE TABLE IF NOT EXISTS category_layout_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  parent_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  start_year INTEGER NOT NULL CHECK (start_year >= 2000 AND start_year <= 2100),
  start_month INTEGER NOT NULL CHECK (start_month >= 1 AND start_month <= 12),
  end_year INTEGER CHECK (end_year >= 2000 AND end_year <= 2100),
  end_month INTEGER CHECK (end_month >= 1 AND end_month <= 12),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, category_id, start_year, start_month),
  CHECK (
    (end_year IS NULL AND end_month IS NULL)
    OR (end_year IS NOT NULL AND end_month IS NOT NULL)
  ),
  CHECK (
    end_year IS NULL
    OR (end_year * 12 + end_month) >= (start_year * 12 + start_month)
  )
);

CREATE INDEX IF NOT EXISTS idx_category_layout_periods_lookup
  ON category_layout_periods(household_id, category_id, start_year, start_month);

CREATE INDEX IF NOT EXISTS idx_category_layout_periods_household
  ON category_layout_periods(household_id, start_year, start_month);

ALTER TABLE category_layout_periods ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON category_layout_periods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON category_layout_periods TO service_role;

DROP POLICY IF EXISTS category_layout_periods_policy ON category_layout_periods;
CREATE POLICY category_layout_periods_policy ON category_layout_periods
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP TRIGGER IF EXISTS update_category_layout_periods_updated_at ON category_layout_periods;
CREATE TRIGGER update_category_layout_periods_updated_at BEFORE UPDATE ON category_layout_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Baseline the current layout as of 2026 so existing active planning views keep their shape.
INSERT INTO category_layout_periods (
  household_id,
  category_id,
  parent_category_id,
  start_year,
  start_month,
  sort_order,
  is_visible,
  notes
)
SELECT
  household_id,
  id,
  parent_category_id,
  2026,
  1,
  COALESCE(sort_order, 0),
  true,
  'Baseline from current category layout'
FROM categories
WHERE household_id IS NOT NULL
ON CONFLICT (household_id, category_id, start_year, start_month) DO NOTHING;
