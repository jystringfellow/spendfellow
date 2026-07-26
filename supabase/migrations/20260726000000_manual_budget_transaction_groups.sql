-- Explicit, reusable transaction groups for compact monthly budget display.
-- A transaction can belong to at most one group. Groups may span months; the
-- budget view only combines members that land in the same category and month.

CREATE TABLE IF NOT EXISTS budget_transaction_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 80),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_transaction_groups_household_name
  ON budget_transaction_groups(household_id, LOWER(BTRIM(name)));

CREATE TABLE IF NOT EXISTS budget_transaction_group_members (
  transaction_id UUID PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES budget_transaction_groups(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_transaction_group_members_group
  ON budget_transaction_group_members(group_id);

CREATE OR REPLACE FUNCTION validate_budget_transaction_group_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  group_household_id UUID;
  transaction_household_id UUID;
BEGIN
  SELECT household_id INTO group_household_id
  FROM budget_transaction_groups
  WHERE id = NEW.group_id;

  SELECT household_id INTO transaction_household_id
  FROM transactions
  WHERE id = NEW.transaction_id;

  IF group_household_id IS NULL OR group_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'budget group must belong to the member household';
  END IF;

  IF transaction_household_id IS NULL OR transaction_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'transaction must belong to the member household';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_budget_transaction_group_member_trigger
  ON budget_transaction_group_members;
CREATE TRIGGER validate_budget_transaction_group_member_trigger
  BEFORE INSERT OR UPDATE OF transaction_id, group_id, household_id
  ON budget_transaction_group_members
  FOR EACH ROW EXECUTE FUNCTION validate_budget_transaction_group_member();

DROP TRIGGER IF EXISTS update_budget_transaction_groups_updated_at
  ON budget_transaction_groups;
CREATE TRIGGER update_budget_transaction_groups_updated_at
  BEFORE UPDATE ON budget_transaction_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE budget_transaction_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_transaction_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_transaction_groups_policy
  ON budget_transaction_groups;
CREATE POLICY budget_transaction_groups_policy ON budget_transaction_groups
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS budget_transaction_group_members_policy
  ON budget_transaction_group_members;
CREATE POLICY budget_transaction_group_members_policy ON budget_transaction_group_members
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON budget_transaction_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_transaction_groups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_transaction_group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_transaction_group_members TO service_role;
