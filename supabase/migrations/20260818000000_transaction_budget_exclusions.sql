CREATE TABLE public.transaction_budget_exclusions (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_budget_exclusions_reason_check
    CHECK (reason IN ('credit_card_payment'))
);

CREATE INDEX idx_transaction_budget_exclusions_household
  ON public.transaction_budget_exclusions (household_id, created_at DESC);

ALTER TABLE public.transaction_budget_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transaction_budget_exclusions_policy
  ON public.transaction_budget_exclusions
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transaction_budget_exclusions TO authenticated;
GRANT ALL ON TABLE public.transaction_budget_exclusions TO service_role;

CREATE OR REPLACE FUNCTION public.validate_transaction_budget_exclusion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  transaction_household_id uuid;
  transaction_amount_cents bigint;
  transaction_pending boolean;
  transaction_account_type text;
BEGIN
  SELECT t.household_id, t.amount_cents, t.pending, a.type
  INTO transaction_household_id, transaction_amount_cents, transaction_pending, transaction_account_type
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.id = NEW.transaction_id;

  IF transaction_household_id IS NULL THEN
    RAISE EXCEPTION 'budget exclusion transaction was not found';
  END IF;

  IF transaction_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'budget exclusion transaction must belong to the exclusion household';
  END IF;

  IF transaction_pending OR NOT (
    (transaction_account_type = 'depository' AND transaction_amount_cents > 0)
    OR (transaction_account_type = 'credit' AND transaction_amount_cents < 0)
  ) THEN
    RAISE EXCEPTION 'credit card payment exclusions require a posted checking debit or card credit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.credit_card_payment_links link
    WHERE link.checking_transaction_id = NEW.transaction_id
       OR link.credit_transaction_id = NEW.transaction_id
  ) THEN
    RAISE EXCEPTION 'linked credit card payments do not need a separate budget exclusion';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_transaction_budget_exclusion_trigger
  BEFORE INSERT OR UPDATE ON public.transaction_budget_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_budget_exclusion();

REVOKE EXECUTE ON FUNCTION public.validate_transaction_budget_exclusion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_transaction_budget_exclusion() TO service_role;

CREATE OR REPLACE FUNCTION public.remove_invalid_transaction_budget_exclusions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.transaction_budget_exclusions exclusion
  USING public.accounts account
  WHERE exclusion.transaction_id = NEW.id
    AND account.id = NEW.account_id
    AND (
      NEW.household_id <> exclusion.household_id
      OR NEW.pending
      OR NOT (
        (account.type = 'depository' AND NEW.amount_cents > 0)
        OR (account.type = 'credit' AND NEW.amount_cents < 0)
      )
    );

  RETURN NEW;
END;
$$;

CREATE TRIGGER remove_invalid_transaction_budget_exclusions_trigger
  AFTER UPDATE OF account_id, household_id, amount_cents, pending ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.remove_invalid_transaction_budget_exclusions();

REVOKE EXECUTE ON FUNCTION public.remove_invalid_transaction_budget_exclusions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_invalid_transaction_budget_exclusions() TO service_role;

CREATE OR REPLACE FUNCTION public.remove_linked_transaction_budget_exclusions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.transaction_budget_exclusions
  WHERE transaction_id IN (NEW.checking_transaction_id, NEW.credit_transaction_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER remove_linked_transaction_budget_exclusions_trigger
  AFTER INSERT ON public.credit_card_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.remove_linked_transaction_budget_exclusions();

REVOKE EXECUTE ON FUNCTION public.remove_linked_transaction_budget_exclusions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_linked_transaction_budget_exclusions() TO service_role;

CREATE OR REPLACE VIEW public.budget_actual_lines AS
SELECT
  t.id AS transaction_id,
  NULL::uuid AS transaction_split_id,
  NULL::uuid AS imported_budget_line_id,
  t.user_id,
  t.household_id,
  t.account_id,
  t.category_id,
  t.date,
  t.amount_cents,
  t.pending,
  t.notes,
  t.plaid_environment,
  false AS is_split,
  'transaction'::text AS source_type,
  t.description,
  t.merchant_name
FROM public.transactions t
WHERE NOT EXISTS (
    SELECT 1 FROM public.transaction_splits split WHERE split.transaction_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.credit_card_payment_links link
    WHERE link.checking_transaction_id = t.id OR link.credit_transaction_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_budget_exclusions exclusion
    WHERE exclusion.transaction_id = t.id
  )
UNION ALL
SELECT
  t.id AS transaction_id,
  split.id AS transaction_split_id,
  NULL::uuid AS imported_budget_line_id,
  t.user_id,
  t.household_id,
  t.account_id,
  split.category_id,
  t.date,
  split.amount_cents,
  t.pending,
  split.notes,
  t.plaid_environment,
  true AS is_split,
  'transaction_split'::text AS source_type,
  t.description,
  t.merchant_name
FROM public.transactions t
JOIN public.transaction_splits split ON split.transaction_id = t.id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.credit_card_payment_links link
    WHERE link.checking_transaction_id = t.id OR link.credit_transaction_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaction_budget_exclusions exclusion
    WHERE exclusion.transaction_id = t.id
  )
UNION ALL
SELECT
  NULL::uuid AS transaction_id,
  NULL::uuid AS transaction_split_id,
  imported.id AS imported_budget_line_id,
  imported.user_id,
  imported.household_id,
  NULL::uuid AS account_id,
  imported.category_id,
  imported.date,
  -imported.amount_cents AS amount_cents,
  false AS pending,
  imported.notes,
  NULL::text AS plaid_environment,
  false AS is_split,
  'imported_budget_line'::text AS source_type,
  imported.description,
  NULL::text AS merchant_name
FROM public.imported_budget_lines imported;

ALTER VIEW public.budget_actual_lines SET (security_invoker = true);

COMMENT ON VIEW public.budget_actual_lines IS
  'Budget activity with spreadsheet imports normalized to the ledger sign convention; linked or explicitly marked credit-card payments are excluded.';
