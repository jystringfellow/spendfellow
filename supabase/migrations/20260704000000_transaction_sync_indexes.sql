-- Support recurring Plaid transaction imports and household-scoped transaction views.

CREATE INDEX IF NOT EXISTS idx_transactions_household_date ON transactions(household_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_household_category_date ON transactions(household_id, category_id, date DESC);
