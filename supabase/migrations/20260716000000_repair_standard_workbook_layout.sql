-- Repair the standard workbook layout after historical test imports.
-- This pins the 2026 baseline to the intended monthly worksheet shape.

WITH group_values(name, group_key, color, target_percent, sort_order, is_income) AS (
  VALUES
    ('Needs', 'needs', '#9fc5e8', 50::NUMERIC, 10, false),
    ('Wants', 'wants', '#f9cb9c', 15::NUMERIC, 20, false),
    ('Big Wants', 'bigWants', '#dd7e6b', 15::NUMERIC, 30, false),
    ('Income', 'income', '#b4a7d6', NULL::NUMERIC, 40, true),
    ('Savings', 'savings', '#ffe599', 20::NUMERIC, 50, false)
)
UPDATE categories c
SET
  group_key = group_values.group_key,
  color = group_values.color,
  target_percent = group_values.target_percent,
  sort_order = group_values.sort_order,
  is_income = group_values.is_income,
  is_group = true
FROM group_values
WHERE c.name = group_values.name
AND c.household_id IS NOT NULL;

WITH category_values(name, group_name, group_key, color, is_income, sort_order) AS (
  VALUES
    ('Bills', 'Needs', 'needs', '#c9daf8', false, 10),
    ('Groceries', 'Needs', 'needs', '#c9daf8', false, 20),
    ('Home & Office', 'Needs', 'needs', '#c9daf8', false, 30),
    ('Home/Office', 'Needs', 'needs', '#c9daf8', false, 30),
    ('Dependents', 'Needs', 'needs', '#c9daf8', false, 40),
    ('Auto & Transport', 'Needs', 'needs', '#c9daf8', false, 50),
    ('Health', 'Needs', 'needs', '#c9daf8', false, 60),
    ('Entertainment', 'Wants', 'wants', '#fce5cd', false, 70),
    ('Person A', 'Wants', 'wants', '#fce5cd', false, 80),
    ('Person B', 'Wants', 'wants', '#fce5cd', false, 90),
    ('Shared', 'Wants', 'wants', '#fce5cd', false, 100),
    ('Projects', 'Big Wants', 'bigWants', '#e6b8af', false, 110),
    ('Travel', 'Big Wants', 'bigWants', '#e6b8af', false, 120),
    ('Income Transfers', 'Income', 'income', '#d9d2e9', true, 130),
    ('Savings Transfers', 'Savings', 'savings', '#fff2cc', false, 140)
)
UPDATE categories c
SET
  parent_category_id = parent.id,
  group_key = category_values.group_key,
  color = category_values.color,
  is_income = category_values.is_income,
  sort_order = category_values.sort_order,
  is_group = false
FROM category_values
JOIN categories parent
  ON parent.name = category_values.group_name
  AND parent.is_group = true
WHERE c.name = category_values.name
AND c.household_id = parent.household_id
AND c.household_id IS NOT NULL;

WITH standard_layout(name, group_name, sort_order) AS (
  VALUES
    ('Needs', NULL, 10),
    ('Wants', NULL, 20),
    ('Big Wants', NULL, 30),
    ('Income', NULL, 40),
    ('Savings', NULL, 50),
    ('Bills', 'Needs', 10),
    ('Groceries', 'Needs', 20),
    ('Home & Office', 'Needs', 30),
    ('Home/Office', 'Needs', 30),
    ('Dependents', 'Needs', 40),
    ('Auto & Transport', 'Needs', 50),
    ('Health', 'Needs', 60),
    ('Entertainment', 'Wants', 70),
    ('Person A', 'Wants', 80),
    ('Person B', 'Wants', 90),
    ('Shared', 'Wants', 100),
    ('Projects', 'Big Wants', 110),
    ('Travel', 'Big Wants', 120),
    ('Income Transfers', 'Income', 130),
    ('Savings Transfers', 'Savings', 140)
),
layout_rows AS (
  SELECT
    c.household_id,
    c.id AS category_id,
    parent.id AS parent_category_id,
    standard_layout.sort_order
  FROM standard_layout
  JOIN categories c
    ON c.name = standard_layout.name
    AND c.household_id IS NOT NULL
  LEFT JOIN categories parent
    ON parent.household_id = c.household_id
    AND parent.name = standard_layout.group_name
    AND parent.is_group = true
)
INSERT INTO category_layout_periods (
  household_id,
  category_id,
  parent_category_id,
  start_year,
  start_month,
  end_year,
  end_month,
  sort_order,
  is_visible,
  notes
)
SELECT
  household_id,
  category_id,
  parent_category_id,
  2026,
  1,
  NULL,
  NULL,
  sort_order,
  true,
  'Repaired standard 2026 workbook layout'
FROM layout_rows
ON CONFLICT (household_id, category_id, start_year, start_month) DO UPDATE
SET
  parent_category_id = EXCLUDED.parent_category_id,
  end_year = NULL,
  end_month = NULL,
  sort_order = EXCLUDED.sort_order,
  is_visible = true,
  notes = EXCLUDED.notes;

WITH standard_names(name) AS (
  VALUES
    ('Needs'),
    ('Wants'),
    ('Big Wants'),
    ('Income'),
    ('Savings'),
    ('Bills'),
    ('Groceries'),
    ('Home & Office'),
    ('Home/Office'),
    ('Dependents'),
    ('Auto & Transport'),
    ('Health'),
    ('Entertainment'),
    ('Person A'),
    ('Person B'),
    ('Shared'),
    ('Projects'),
    ('Travel'),
    ('Income Transfers'),
    ('Savings Transfers')
),
extra_categories AS (
  SELECT c.*
  FROM categories c
  LEFT JOIN standard_names ON standard_names.name = c.name
  WHERE c.household_id IS NOT NULL
  AND c.is_group = false
  AND standard_names.name IS NULL
)
INSERT INTO category_layout_periods (
  household_id,
  category_id,
  parent_category_id,
  start_year,
  start_month,
  end_year,
  end_month,
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
  NULL,
  NULL,
  COALESCE(sort_order, 9999),
  false,
  'Hidden from repaired standard 2026 workbook layout'
FROM extra_categories
ON CONFLICT (household_id, category_id, start_year, start_month) DO UPDATE
SET
  is_visible = false,
  notes = EXCLUDED.notes;
