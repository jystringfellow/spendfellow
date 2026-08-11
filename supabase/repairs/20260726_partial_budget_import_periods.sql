-- One-off repair for deployments affected by the 2026 partial budget import bug.
-- Do not run this script on a fresh installation.

-- Partial historical imports previously replaced an existing January baseline
-- with a January-only imported layout. Reopen only rows that were updated in
-- place; newly created import-only categories keep their original month scope.
UPDATE category_layout_periods
SET
  end_year = NULL,
  end_month = NULL,
  notes = 'Restored pre-import baseline after partial budget import'
WHERE start_year = 2026
  AND start_month = 1
  AND end_year = 2026
  AND end_month = 1
  AND notes LIKE 'Imported layout from %'
  AND created_at < updated_at - INTERVAL '1 second';

-- Existing category defaults were not changed by the importer, so they are the
-- safest available restoration value after the affected Jan-May import range.
INSERT INTO category_budget_periods (
  household_id,
  category_id,
  year,
  start_month,
  amount_cents,
  notes
)
SELECT
  category.household_id,
  category.id,
  2026,
  6,
  category.default_monthly_budget_cents,
  'Restored budget after partial historical import'
FROM categories category
WHERE category.household_id IS NOT NULL
  AND NOT category.is_group
  AND EXISTS (
    SELECT 1
    FROM category_budget_periods january_period
    WHERE january_period.household_id = category.household_id
      AND january_period.category_id = category.id
      AND january_period.year = 2026
      AND january_period.start_month = 1
      AND january_period.notes LIKE 'Imported budget from %'
      AND january_period.created_at < january_period.updated_at - INTERVAL '1 second'
  )
ON CONFLICT (household_id, category_id, year, start_month) DO NOTHING;
