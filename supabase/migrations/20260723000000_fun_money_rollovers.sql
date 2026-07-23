-- Rollover category balances and auditable, non-cash fun-money credits.
-- Adjustments intentionally remain outside budget_actual_lines so they never
-- change gross spending, earned income, or cash-flow totals.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS rollover_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rollover_start_date DATE;

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_rollover_start_date_check;

ALTER TABLE categories
  ADD CONSTRAINT categories_rollover_start_date_check
  CHECK (NOT rollover_enabled OR rollover_start_date IS NOT NULL);

-- The standard personal/shared Wants buckets match the historical workbook's
-- fun-money behavior. Entertainment remains a normal monthly category.
UPDATE categories
SET
  rollover_enabled = true,
  rollover_start_date = COALESCE(
    rollover_start_date,
    DATE_TRUNC('year', CURRENT_DATE)::DATE
  )
WHERE household_id IS NOT NULL
  AND LOWER(COALESCE(group_key, '')) = 'wants'
  AND LOWER(name) NOT LIKE '%entertainment%';

CREATE TABLE IF NOT EXISTS category_balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  source_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  kind TEXT NOT NULL CHECK (
    kind IN ('income_allocation', 'gift', 'opening_balance', 'correction', 'other')
  ),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'void')),
  description TEXT NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (kind = 'income_allocation' AND source_transaction_id IS NOT NULL)
    OR (kind <> 'income_allocation' AND source_transaction_id IS NULL)
  ),
  UNIQUE (source_transaction_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_category_balance_adjustments_household_date
  ON category_balance_adjustments(household_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_category_balance_adjustments_category_date
  ON category_balance_adjustments(category_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_category_balance_adjustments_source
  ON category_balance_adjustments(source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_category_balance_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  category_household_id UUID;
  category_rollover_enabled BOOLEAN;
  category_rollover_start_date DATE;
  transaction_household_id UUID;
  transaction_amount_cents BIGINT;
  transaction_pending BOOLEAN;
  allocated_cents BIGINT;
BEGIN
  SELECT household_id, rollover_enabled, rollover_start_date
  INTO category_household_id, category_rollover_enabled, category_rollover_start_date
  FROM categories
  WHERE id = NEW.category_id;

  IF category_household_id IS NULL OR category_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'adjustment category must belong to the adjustment household';
  END IF;

  IF NOT category_rollover_enabled THEN
    RAISE EXCEPTION 'adjustment category must have rollover enabled';
  END IF;

  IF category_rollover_start_date IS NULL OR NEW.effective_date < category_rollover_start_date THEN
    RAISE EXCEPTION 'adjustment cannot predate the category rollover start';
  END IF;

  IF NEW.source_transaction_id IS NOT NULL THEN
    SELECT household_id, amount_cents, pending
    INTO transaction_household_id, transaction_amount_cents, transaction_pending
    FROM transactions
    WHERE id = NEW.source_transaction_id;

    IF transaction_household_id IS NULL OR transaction_household_id <> NEW.household_id THEN
      RAISE EXCEPTION 'source transaction must belong to the adjustment household';
    END IF;

    IF transaction_amount_cents >= 0 OR transaction_pending THEN
      RAISE EXCEPTION 'source transaction must be posted income';
    END IF;

    IF NEW.amount_cents <= 0 THEN
      RAISE EXCEPTION 'income allocations must be positive';
    END IF;

    SELECT COALESCE(SUM(amount_cents), 0)
    INTO allocated_cents
    FROM category_balance_adjustments
    WHERE source_transaction_id = NEW.source_transaction_id
      AND id <> NEW.id
      AND status <> 'void';

    IF NEW.status <> 'void' AND allocated_cents + NEW.amount_cents > ABS(transaction_amount_cents) THEN
      RAISE EXCEPTION 'fun-money allocations cannot exceed source income';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_category_balance_adjustment_trigger
  ON category_balance_adjustments;
CREATE TRIGGER validate_category_balance_adjustment_trigger
  BEFORE INSERT OR UPDATE OF
    household_id,
    category_id,
    source_transaction_id,
    effective_date,
    amount_cents,
    status
  ON category_balance_adjustments
  FOR EACH ROW EXECUTE FUNCTION validate_category_balance_adjustment();

CREATE OR REPLACE FUNCTION validate_source_transaction_fun_money_allocations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  allocated_cents BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount_cents), 0)
  INTO allocated_cents
  FROM category_balance_adjustments
  WHERE source_transaction_id = NEW.id
    AND status <> 'void';

  IF allocated_cents > 0 AND (
    NEW.amount_cents >= 0
    OR NEW.pending
    OR allocated_cents > ABS(NEW.amount_cents)
  ) THEN
    RAISE EXCEPTION 'transaction change would invalidate fun-money allocations';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_source_transaction_fun_money_allocations_trigger
  ON transactions;
CREATE TRIGGER validate_source_transaction_fun_money_allocations_trigger
  BEFORE UPDATE OF amount_cents, pending ON transactions
  FOR EACH ROW EXECUTE FUNCTION validate_source_transaction_fun_money_allocations();

DROP TRIGGER IF EXISTS update_category_balance_adjustments_updated_at
  ON category_balance_adjustments;
CREATE TRIGGER update_category_balance_adjustments_updated_at
  BEFORE UPDATE ON category_balance_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE category_balance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS category_balance_adjustments_policy
  ON category_balance_adjustments;
CREATE POLICY category_balance_adjustments_policy ON category_balance_adjustments
  FOR ALL USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON category_balance_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON category_balance_adjustments TO service_role;
