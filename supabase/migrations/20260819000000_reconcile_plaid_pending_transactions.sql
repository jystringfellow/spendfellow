CREATE OR REPLACE FUNCTION public.reconcile_plaid_pending_transaction(
  target_plaid_environment text,
  target_pending_transaction_id text,
  target_posted_transaction_id text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pending_transaction public.transactions%ROWTYPE;
  posted_transaction public.transactions%ROWTYPE;
  posted_account_type text;
BEGIN
  SELECT *
  INTO posted_transaction
  FROM public.transactions
  WHERE plaid_environment = target_plaid_environment
    AND plaid_transaction_id = target_posted_transaction_id
    AND NOT pending
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO pending_transaction
  FROM public.transactions
  WHERE plaid_environment = target_plaid_environment
    AND plaid_transaction_id = target_pending_transaction_id
    AND pending
  FOR UPDATE;

  IF NOT FOUND OR pending_transaction.id = posted_transaction.id THEN
    RETURN posted_transaction.id;
  END IF;

  IF pending_transaction.source <> 'plaid'
    OR posted_transaction.source <> 'plaid'
    OR pending_transaction.household_id IS DISTINCT FROM posted_transaction.household_id
    OR pending_transaction.account_id <> posted_transaction.account_id
  THEN
    RAISE EXCEPTION 'pending and posted Plaid transactions must belong to the same household and account';
  END IF;

  -- Prefer edits made on the posted row, then fall back to edits made while the
  -- transaction was pending.
  UPDATE public.transactions
  SET
    category_id = COALESCE(posted_transaction.category_id, pending_transaction.category_id),
    notes = COALESCE(posted_transaction.notes, pending_transaction.notes)
  WHERE id = posted_transaction.id;

  UPDATE public.amazon_payment_transactions
  SET plaid_transaction_id = posted_transaction.id
  WHERE plaid_transaction_id = pending_transaction.id;

  INSERT INTO public.transaction_tags (transaction_id, tag_id, created_at)
  SELECT posted_transaction.id, tag_id, created_at
  FROM public.transaction_tags
  WHERE transaction_id = pending_transaction.id
  ON CONFLICT (transaction_id, tag_id) DO NOTHING;

  DELETE FROM public.transaction_tags
  WHERE transaction_id = pending_transaction.id;

  IF EXISTS (
    SELECT 1
    FROM public.budget_transaction_group_members
    WHERE transaction_id = posted_transaction.id
  ) THEN
    DELETE FROM public.budget_transaction_group_members
    WHERE transaction_id = pending_transaction.id;
  ELSE
    UPDATE public.budget_transaction_group_members
    SET transaction_id = posted_transaction.id
    WHERE transaction_id = pending_transaction.id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transaction_splits
    WHERE transaction_id = posted_transaction.id
  ) THEN
    DELETE FROM public.transaction_splits
    WHERE transaction_id = pending_transaction.id;
  ELSE
    UPDATE public.transaction_splits
    SET transaction_id = posted_transaction.id
    WHERE transaction_id = pending_transaction.id;
  END IF;

  -- Pending transactions cannot normally own these records. Handle any legacy
  -- rows defensively before deleting the pending transaction.
  DELETE FROM public.category_balance_adjustments pending_adjustment
  WHERE pending_adjustment.source_transaction_id = pending_transaction.id
    AND EXISTS (
      SELECT 1
      FROM public.category_balance_adjustments posted_adjustment
      WHERE posted_adjustment.source_transaction_id = posted_transaction.id
        AND posted_adjustment.category_id = pending_adjustment.category_id
    );

  UPDATE public.category_balance_adjustments
  SET source_transaction_id = posted_transaction.id
  WHERE source_transaction_id = pending_transaction.id;

  DELETE FROM public.transaction_budget_exclusions
  WHERE transaction_id = pending_transaction.id;

  SELECT type
  INTO posted_account_type
  FROM public.accounts
  WHERE id = posted_transaction.account_id;

  IF EXISTS (
    SELECT 1
    FROM public.credit_card_payment_links
    WHERE checking_transaction_id = posted_transaction.id
       OR credit_transaction_id = posted_transaction.id
  ) THEN
    DELETE FROM public.credit_card_payment_links
    WHERE checking_transaction_id = pending_transaction.id
       OR credit_transaction_id = pending_transaction.id;
  ELSE
    DELETE FROM public.credit_card_payment_links link
    WHERE link.checking_transaction_id = pending_transaction.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.transactions counterpart
        JOIN public.accounts counterpart_account ON counterpart_account.id = counterpart.account_id
        WHERE counterpart.id = link.credit_transaction_id
          AND posted_account_type = 'depository'
          AND counterpart_account.type = 'credit'
          AND posted_transaction.amount_cents > 0
          AND counterpart.amount_cents < 0
          AND posted_transaction.amount_cents + counterpart.amount_cents = 0
      );

    DELETE FROM public.credit_card_payment_links link
    WHERE link.credit_transaction_id = pending_transaction.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.transactions counterpart
        JOIN public.accounts counterpart_account ON counterpart_account.id = counterpart.account_id
        WHERE counterpart.id = link.checking_transaction_id
          AND posted_account_type = 'credit'
          AND counterpart_account.type = 'depository'
          AND posted_transaction.amount_cents < 0
          AND counterpart.amount_cents > 0
          AND posted_transaction.amount_cents + counterpart.amount_cents = 0
      );

    UPDATE public.credit_card_payment_links
    SET checking_transaction_id = posted_transaction.id
    WHERE checking_transaction_id = pending_transaction.id;

    UPDATE public.credit_card_payment_links
    SET credit_transaction_id = posted_transaction.id
    WHERE credit_transaction_id = pending_transaction.id;
  END IF;

  DELETE FROM public.transactions
  WHERE id = pending_transaction.id;

  RETURN posted_transaction.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_plaid_pending_transaction(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_plaid_pending_transaction(text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.validate_credit_card_payment_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checking_household_id uuid;
  checking_amount_cents bigint;
  checking_account_type text;
  checking_pending boolean;
  credit_household_id uuid;
  credit_amount_cents bigint;
  credit_account_type text;
  credit_pending boolean;
BEGIN
  SELECT t.household_id, t.amount_cents, a.type, t.pending
  INTO checking_household_id, checking_amount_cents, checking_account_type, checking_pending
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.id = NEW.checking_transaction_id;

  SELECT t.household_id, t.amount_cents, a.type, t.pending
  INTO credit_household_id, credit_amount_cents, credit_account_type, credit_pending
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.id = NEW.credit_transaction_id;

  IF checking_household_id IS NULL OR credit_household_id IS NULL THEN
    RAISE EXCEPTION 'credit card payment transactions were not found';
  END IF;

  IF checking_household_id <> NEW.household_id OR credit_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'credit card payment transactions must belong to the link household';
  END IF;

  IF checking_pending OR credit_pending THEN
    RAISE EXCEPTION 'credit card payments can only link posted transactions';
  END IF;

  IF checking_account_type <> 'depository' OR credit_account_type <> 'credit' THEN
    RAISE EXCEPTION 'credit card payments must link a depository account to a credit account';
  END IF;

  IF checking_amount_cents <= 0 OR credit_amount_cents >= 0 OR checking_amount_cents + credit_amount_cents <> 0 THEN
    RAISE EXCEPTION 'credit card payment amounts must be equal and opposite';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_credit_card_payment_link()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_credit_card_payment_link()
  TO service_role;
