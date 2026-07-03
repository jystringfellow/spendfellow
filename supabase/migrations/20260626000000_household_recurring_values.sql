-- Compatibility migration for projects that already ran workbook constants before households.

ALTER TABLE recurring_values ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recurring_values_household_id ON recurring_values(household_id);

UPDATE recurring_values rv
SET household_id = c.household_id
FROM categories c
WHERE rv.category_id = c.id
AND rv.household_id IS NULL;

UPDATE recurring_values rv
SET household_id = hm.household_id
FROM household_members hm
WHERE rv.user_id = hm.user_id
AND rv.household_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_values_household_id_name_key'
  ) THEN
    ALTER TABLE recurring_values ADD CONSTRAINT recurring_values_household_id_name_key UNIQUE (household_id, name);
  END IF;
END;
$$;

DROP POLICY IF EXISTS recurring_values_policy ON recurring_values;
CREATE POLICY recurring_values_policy ON recurring_values
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

CREATE OR REPLACE FUNCTION seed_workbook_constants()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_email TEXT := auth.jwt() ->> 'email';
  current_household_id UUID;
  needs_id UUID;
  wants_id UUID;
  big_wants_id UUID;
  income_id UUID;
  savings_id UUID;
  category_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'seed_workbook_constants requires an authenticated user';
  END IF;

  INSERT INTO users (id, email)
  VALUES (current_user_id, COALESCE(current_email, current_user_id::TEXT))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  SELECT hm.household_id INTO current_household_id
  FROM household_members hm
  WHERE hm.user_id = current_user_id
  ORDER BY hm.created_at
  LIMIT 1;

  IF current_household_id IS NULL THEN
    current_household_id := gen_random_uuid();

    INSERT INTO households (id, name)
    VALUES (current_household_id, 'Demo Household');

    INSERT INTO household_members (household_id, user_id, role)
    VALUES (current_household_id, current_user_id, 'owner')
    ON CONFLICT (household_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO categories (user_id, household_id, name, color, group_key, target_percent, is_group, sort_order)
  VALUES
    (current_user_id, current_household_id, 'Needs', '#9bb9e8', 'needs', 50, true, 10),
    (current_user_id, current_household_id, 'Wants', '#f3c394', 'wants', 15, true, 20),
    (current_user_id, current_household_id, 'Big Wants', '#d87363', 'bigWants', 15, true, 30),
    (current_user_id, current_household_id, 'Income', '#b7a7d8', 'income', NULL, true, 40),
    (current_user_id, current_household_id, 'Savings', '#ffe69b', 'savings', 20, true, 50)
  ON CONFLICT (household_id, name) DO UPDATE
    SET color = EXCLUDED.color,
        user_id = EXCLUDED.user_id,
        group_key = EXCLUDED.group_key,
        target_percent = EXCLUDED.target_percent,
        is_group = EXCLUDED.is_group,
        sort_order = EXCLUDED.sort_order;

  SELECT id INTO needs_id FROM categories WHERE household_id = current_household_id AND name = 'Needs';
  SELECT id INTO wants_id FROM categories WHERE household_id = current_household_id AND name = 'Wants';
  SELECT id INTO big_wants_id FROM categories WHERE household_id = current_household_id AND name = 'Big Wants';
  SELECT id INTO income_id FROM categories WHERE household_id = current_household_id AND name = 'Income';
  SELECT id INTO savings_id FROM categories WHERE household_id = current_household_id AND name = 'Savings';

  INSERT INTO categories (user_id, household_id, name, color, parent_category_id, group_key, default_monthly_budget_cents, is_income, sort_order)
  VALUES
    (current_user_id, current_household_id, 'Bills', '#c7d7f2', needs_id, 'needs', 530000, false, 10),
    (current_user_id, current_household_id, 'Groceries', '#c7d7f2', needs_id, 'needs', 80000, false, 20),
    (current_user_id, current_household_id, 'Home & Office', '#c7d7f2', needs_id, 'needs', 25000, false, 30),
    (current_user_id, current_household_id, 'Dependents', '#c7d7f2', needs_id, 'needs', 40000, false, 40),
    (current_user_id, current_household_id, 'Auto & Transport', '#c7d7f2', needs_id, 'needs', 30000, false, 50),
    (current_user_id, current_household_id, 'Health', '#c7d7f2', needs_id, 'needs', 30000, false, 60),
    (current_user_id, current_household_id, 'Entertainment', '#f7ddbe', wants_id, 'wants', 15000, false, 70),
    (current_user_id, current_household_id, 'Person A', '#f7ddbe', wants_id, 'wants', 35000, false, 80),
    (current_user_id, current_household_id, 'Person B', '#f7ddbe', wants_id, 'wants', 35000, false, 90),
    (current_user_id, current_household_id, 'Shared', '#f7ddbe', wants_id, 'wants', 25000, false, 100),
    (current_user_id, current_household_id, 'Projects', '#e6b1aa', big_wants_id, 'bigWants', 0, false, 110),
    (current_user_id, current_household_id, 'Travel', '#e6b1aa', big_wants_id, 'bigWants', 0, false, 120),
    (current_user_id, current_household_id, 'Income Transfers', '#d4caea', income_id, 'income', 0, true, 130),
    (current_user_id, current_household_id, 'Savings Transfers', '#fff1bd', savings_id, 'savings', 0, false, 140)
  ON CONFLICT (household_id, name) DO UPDATE
    SET color = EXCLUDED.color,
        user_id = EXCLUDED.user_id,
        parent_category_id = EXCLUDED.parent_category_id,
        group_key = EXCLUDED.group_key,
        default_monthly_budget_cents = EXCLUDED.default_monthly_budget_cents,
        is_income = EXCLUDED.is_income,
        sort_order = EXCLUDED.sort_order;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Dependents';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents)
  VALUES
    (current_user_id, current_household_id, category_id, 'Garrett Registration', 3992),
    (current_user_id, current_household_id, category_id, 'Sharky Registration', 1917),
    (current_user_id, current_household_id, category_id, 'Sharky Insurance', 5417)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Entertainment';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents)
  VALUES
    (current_user_id, current_household_id, category_id, 'Amazon Prime', 1242),
    (current_user_id, current_household_id, category_id, 'Netflix', 690),
    (current_user_id, current_household_id, category_id, 'Monthly Entertainment', -3766)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Groceries';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents)
  VALUES (current_user_id, current_household_id, category_id, 'Costco Membership', 1000)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Auto & Transport';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents)
  VALUES
    (current_user_id, current_household_id, category_id, 'AAA Membership', 708),
    (current_user_id, current_household_id, category_id, 'Monthly Auto', -12033)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Home & Office';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents)
  VALUES (current_user_id, current_household_id, category_id, 'Google Storage', 833)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Bills';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents)
  VALUES
    (current_user_id, current_household_id, category_id, 'Mint Mobile', 3344),
    (current_user_id, current_household_id, category_id, 'Monthly Bills', -3344)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION seed_workbook_constants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_workbook_constants() TO authenticated;
