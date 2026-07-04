-- Billing frequency for recurring values.
-- Fixed recurring value periods store the bill amount. The app resolves a monthly
-- planning amount based on billing_frequency.

ALTER TABLE recurring_values
  ADD COLUMN IF NOT EXISTS billing_frequency TEXT NOT NULL DEFAULT 'monthly'
  CHECK (billing_frequency IN ('monthly', 'yearly'));

UPDATE recurring_values
SET billing_frequency = 'monthly'
WHERE billing_frequency IS NULL;

