-- Household ownership model
-- Financial data belongs to a household so multiple users can share the same accounts,
-- budgets, categories, and transactions.

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_accounts_household_id ON accounts(household_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_household_id ON plaid_items(household_id);
CREATE INDEX IF NOT EXISTS idx_categories_household_id ON categories(household_id);
CREATE INDEX IF NOT EXISTS idx_budgets_household_id ON budgets(household_id);
CREATE INDEX IF NOT EXISTS idx_transactions_household_id ON transactions(household_id);
CREATE INDEX IF NOT EXISTS idx_tags_household_id ON tags(household_id);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_household_member(target_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_members.household_id = target_household_id
    AND household_members.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_household_owner(target_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_members.household_id = target_household_id
    AND household_members.user_id = auth.uid()
    AND household_members.role = 'owner'
  );
$$;

DROP POLICY IF EXISTS households_policy ON households;
CREATE POLICY households_policy ON households
  FOR ALL USING (is_household_member(id))
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS household_members_policy ON household_members;
CREATE POLICY household_members_policy ON household_members
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (user_id = auth.uid() OR is_household_owner(household_id));

DROP TRIGGER IF EXISTS update_households_updated_at ON households;
CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
DECLARE
  user_record RECORD;
  new_household_id UUID;
BEGIN
  FOR user_record IN SELECT id, full_name, email FROM users LOOP
    SELECT household_id INTO new_household_id
    FROM household_members
    WHERE user_id = user_record.id
    LIMIT 1;

    IF new_household_id IS NULL THEN
      INSERT INTO households (name)
      VALUES (COALESCE(NULLIF(user_record.full_name, ''), split_part(user_record.email, '@', 1), 'Household') || ' Household')
      RETURNING id INTO new_household_id;

      INSERT INTO household_members (household_id, user_id, role)
      VALUES (new_household_id, user_record.id, 'owner')
      ON CONFLICT (household_id, user_id) DO NOTHING;
    END IF;

    UPDATE accounts SET household_id = new_household_id WHERE user_id = user_record.id AND household_id IS NULL;
    UPDATE plaid_items SET household_id = new_household_id WHERE user_id = user_record.id AND household_id IS NULL;
    UPDATE categories SET household_id = new_household_id WHERE user_id = user_record.id AND household_id IS NULL;
    UPDATE budgets SET household_id = new_household_id WHERE user_id = user_record.id AND household_id IS NULL;
    UPDATE transactions SET household_id = new_household_id WHERE user_id = user_record.id AND household_id IS NULL;
    UPDATE tags SET household_id = new_household_id WHERE user_id = user_record.id AND household_id IS NULL;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_household_id_name_key'
  ) THEN
    ALTER TABLE categories ADD CONSTRAINT categories_household_id_name_key UNIQUE (household_id, name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budgets_household_id_category_id_year_month_key'
  ) THEN
    ALTER TABLE budgets ADD CONSTRAINT budgets_household_id_category_id_year_month_key UNIQUE (household_id, category_id, year, month);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tags_household_id_name_key'
  ) THEN
    ALTER TABLE tags ADD CONSTRAINT tags_household_id_name_key UNIQUE (household_id, name);
  END IF;
END;
$$;

DROP POLICY IF EXISTS accounts_policy ON accounts;
CREATE POLICY accounts_policy ON accounts
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS plaid_items_policy ON plaid_items;
CREATE POLICY plaid_items_policy ON plaid_items
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS categories_policy ON categories;
CREATE POLICY categories_policy ON categories
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS budgets_policy ON budgets;
CREATE POLICY budgets_policy ON budgets
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS transactions_policy ON transactions;
CREATE POLICY transactions_policy ON transactions
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS tags_policy ON tags;
CREATE POLICY tags_policy ON tags
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS transaction_tags_policy ON transaction_tags;
CREATE POLICY transaction_tags_policy ON transaction_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transactions
      WHERE transactions.id = transaction_tags.transaction_id
      AND is_household_member(transactions.household_id)
    )
  );

DROP VIEW IF EXISTS budget_vs_actual;
DROP VIEW IF EXISTS monthly_spending_by_category;

CREATE VIEW monthly_spending_by_category AS
SELECT
  t.user_id,
  t.household_id,
  EXTRACT(YEAR FROM t.date)::INTEGER as year,
  EXTRACT(MONTH FROM t.date)::INTEGER as month,
  c.id as category_id,
  c.name as category_name,
  SUM(t.amount_cents) as total_cents,
  COUNT(*) as transaction_count
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE NOT t.pending
GROUP BY t.user_id, t.household_id, year, month, c.id, c.name;

CREATE VIEW budget_vs_actual AS
SELECT
  b.user_id,
  b.household_id,
  b.year,
  b.month,
  b.category_id,
  c.name as category_name,
  b.amount_cents as budgeted_cents,
  COALESCE(SUM(t.amount_cents), 0) as actual_cents,
  b.amount_cents - COALESCE(SUM(t.amount_cents), 0) as difference_cents
FROM budgets b
JOIN categories c ON b.category_id = c.id
LEFT JOIN transactions t ON
  t.category_id = b.category_id
  AND t.household_id = b.household_id
  AND EXTRACT(YEAR FROM t.date)::INTEGER = b.year
  AND EXTRACT(MONTH FROM t.date)::INTEGER = b.month
  AND NOT t.pending
GROUP BY b.user_id, b.household_id, b.year, b.month, b.category_id, c.name, b.amount_cents;
