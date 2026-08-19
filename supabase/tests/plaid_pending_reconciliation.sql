BEGIN;

INSERT INTO public.users (id, email)
VALUES ('10000000-0000-0000-0000-000000000001', 'plaid-reconciliation@example.com');

INSERT INTO public.households (id, name)
VALUES ('10000000-0000-0000-0000-000000000002', 'Plaid reconciliation test');

INSERT INTO public.accounts (
  id,
  user_id,
  household_id,
  plaid_account_id,
  plaid_environment,
  name,
  type
)
VALUES
  (
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'test-credit',
    'sandbox',
    'Test credit card',
    'credit'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'test-checking',
    'sandbox',
    'Test checking',
    'depository'
  );

INSERT INTO public.categories (id, user_id, household_id, name)
VALUES (
  '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Pending edit'
);

INSERT INTO public.tags (id, user_id, household_id, name)
VALUES (
  '10000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Pending tag'
);

INSERT INTO public.budget_transaction_groups (id, household_id, name, created_by)
VALUES (
  '10000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000002',
  'Pending group',
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.transactions (
  id,
  user_id,
  household_id,
  account_id,
  category_id,
  plaid_transaction_id,
  plaid_environment,
  date,
  amount_cents,
  description,
  pending,
  notes
)
VALUES
  (
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000005',
    'pending-plaid-id',
    'sandbox',
    '2026-08-01',
    -127140,
    'Pending payment',
    true,
    'Keep this note'
  ),
  (
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    NULL,
    'posted-plaid-id',
    'sandbox',
    '2026-08-02',
    -127140,
    'Posted payment',
    false,
    NULL
  ),
  (
    '10000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000004',
    NULL,
    'checking-plaid-id',
    'sandbox',
    '2026-08-02',
    127140,
    'Checking payment',
    false,
    NULL
  );

INSERT INTO public.transaction_tags (transaction_id, tag_id)
VALUES (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000006'
);

INSERT INTO public.budget_transaction_group_members (
  transaction_id,
  group_id,
  household_id,
  created_by
)
VALUES (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001'
);

-- Reproduce a legacy link created before pending transactions were rejected.
ALTER TABLE public.credit_card_payment_links
  DISABLE TRIGGER validate_credit_card_payment_link_trigger;

INSERT INTO public.credit_card_payment_links (
  household_id,
  checking_transaction_id,
  credit_transaction_id,
  created_by
)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000001'
);

ALTER TABLE public.credit_card_payment_links
  ENABLE TRIGGER validate_credit_card_payment_link_trigger;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.credit_card_payment_links (
      household_id,
      checking_transaction_id,
      credit_transaction_id,
      created_by
    )
    VALUES (
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000012',
      '10000000-0000-0000-0000-000000000010',
      '10000000-0000-0000-0000-000000000001'
    );

    RAISE EXCEPTION 'pending payment link was unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'credit card payments can only link posted transactions' THEN
      RAISE;
    END IF;
  END;
END;
$$;

SELECT public.reconcile_plaid_pending_transaction(
  'sandbox',
  'pending-plaid-id',
  'posted-plaid-id'
);

DO $$
DECLARE
  posted_row public.transactions%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions WHERE plaid_transaction_id = 'pending-plaid-id'
  ) THEN
    RAISE EXCEPTION 'pending transaction was not removed';
  END IF;

  SELECT *
  INTO posted_row
  FROM public.transactions
  WHERE plaid_transaction_id = 'posted-plaid-id';

  IF posted_row.category_id <> '10000000-0000-0000-0000-000000000005'::uuid
    OR posted_row.notes <> 'Keep this note'
  THEN
    RAISE EXCEPTION 'pending transaction edits were not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.transaction_tags
    WHERE transaction_id = posted_row.id
      AND tag_id = '10000000-0000-0000-0000-000000000006'
  ) THEN
    RAISE EXCEPTION 'pending transaction tags were not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.budget_transaction_group_members
    WHERE transaction_id = posted_row.id
      AND group_id = '10000000-0000-0000-0000-000000000007'
  ) THEN
    RAISE EXCEPTION 'pending transaction group was not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.credit_card_payment_links
    WHERE checking_transaction_id = '10000000-0000-0000-0000-000000000012'
      AND credit_transaction_id = posted_row.id
  ) THEN
    RAISE EXCEPTION 'pending transaction payment link was not moved to the posted transaction';
  END IF;
END;
$$;

ROLLBACK;
