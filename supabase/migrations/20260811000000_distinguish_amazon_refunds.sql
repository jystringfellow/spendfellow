-- A purchase and a refund can share an order, card, amount, and posting date.
-- Keep both rows by making direction part of the Amazon payment identity.
ALTER TABLE public.amazon_payment_transactions
  DROP CONSTRAINT IF EXISTS amazon_payment_transactions_unique;

ALTER TABLE public.amazon_payment_transactions
  ADD CONSTRAINT amazon_payment_transactions_unique
  UNIQUE NULLS NOT DISTINCT (
    household_id,
    order_id,
    amount_cents,
    payment_method_hint,
    transaction_date,
    is_refund
  );
