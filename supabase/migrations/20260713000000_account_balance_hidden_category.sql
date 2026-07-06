ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_balance_category_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_balance_category_check
  CHECK (balance_category IN ('checking', 'savings', 'ccDebt', 'investments', 'hidden'));
