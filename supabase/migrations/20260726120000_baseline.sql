-- Canonical Spendfellow schema baseline for fresh Supabase projects.
-- Historical data backfills and deployment-specific repairs are intentionally excluded.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_household_invitation"("invitation_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_email TEXT;
  invitation_record household_invitations%ROWTYPE;
  existing_household_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept an invitation';
  END IF;

  SELECT LOWER(email)
  INTO current_email
  FROM auth.users
  WHERE id = current_user_id
    AND email_confirmed_at IS NOT NULL;

  IF current_email IS NULL THEN
    RAISE EXCEPTION 'Confirm your email before accepting an invitation';
  END IF;

  SELECT *
  INTO invitation_record
  FROM household_invitations
  WHERE id = invitation_id
  FOR UPDATE;

  IF invitation_record.id IS NULL
    OR invitation_record.status <> 'pending'
    OR invitation_record.expires_at <= NOW() THEN
    RAISE EXCEPTION 'This household invitation is no longer valid';
  END IF;

  IF invitation_record.email <> current_email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  SELECT household_id
  INTO existing_household_id
  FROM household_members
  WHERE user_id = current_user_id
    AND household_id <> invitation_record.household_id
  ORDER BY created_at
  LIMIT 1;

  IF existing_household_id IS NOT NULL THEN
    RAISE EXCEPTION 'Your account already belongs to another household';
  END IF;

  INSERT INTO users (id, email)
  VALUES (current_user_id, current_email)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = NOW();

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (invitation_record.household_id, current_user_id, invitation_record.role)
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET role = EXCLUDED.role;

  UPDATE household_invitations
  SET status = 'accepted',
      accepted_at = NOW(),
      updated_at = NOW()
  WHERE id = invitation_record.id;

  RETURN invitation_record.household_id;
END;
$$;


ALTER FUNCTION "public"."accept_household_invitation"("invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_household_member"("target_household_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_members.household_id = target_household_id
    AND household_members.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_household_member"("target_household_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_household_owner"("target_household_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_members.household_id = target_household_id
    AND household_members.user_id = auth.uid()
    AND household_members.role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_household_owner"("target_household_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_invalid_credit_card_payment_links"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  DELETE FROM credit_card_payment_links link
  USING transactions checking_transaction,
        accounts checking_account,
        transactions credit_transaction,
        accounts credit_account
  WHERE (link.checking_transaction_id = NEW.id OR link.credit_transaction_id = NEW.id)
    AND checking_transaction.id = link.checking_transaction_id
    AND checking_account.id = checking_transaction.account_id
    AND credit_transaction.id = link.credit_transaction_id
    AND credit_account.id = credit_transaction.account_id
    AND (
      checking_transaction.household_id <> link.household_id
      OR credit_transaction.household_id <> link.household_id
      OR checking_account.type <> 'depository'
      OR credit_account.type <> 'credit'
      OR checking_transaction.amount_cents <= 0
      OR credit_transaction.amount_cents >= 0
      OR checking_transaction.amount_cents + credit_transaction.amount_cents <> 0
    );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."remove_invalid_credit_card_payment_links"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_workbook_constants"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_email TEXT := auth.jwt() ->> 'email';
  current_household_id UUID;
  needs_id UUID;
  wants_id UUID;
  big_wants_id UUID;
  income_id UUID;
  savings_id UUID;
  category_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'seed_workbook_constants requires an authenticated user';
  END IF;

  INSERT INTO users (id, email)
  VALUES (current_user_id, COALESCE(current_email, current_user_id::TEXT))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  SELECT hm.household_id INTO current_household_id
  FROM household_members hm
  WHERE hm.user_id = current_user_id
  ORDER BY hm.created_at
  LIMIT 1;

  IF current_household_id IS NULL THEN
    current_household_id := gen_random_uuid();

    INSERT INTO households (id, name)
    VALUES (current_household_id, 'Demo Household');

    INSERT INTO household_members (household_id, user_id, role)
    VALUES (current_household_id, current_user_id, 'owner')
    ON CONFLICT (household_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO categories (user_id, household_id, name, color, group_key, target_percent, is_group, sort_order)
  VALUES
    (current_user_id, current_household_id, 'Needs', '#9bb9e8', 'needs', 50, true, 10),
    (current_user_id, current_household_id, 'Wants', '#f3c394', 'wants', 15, true, 20),
    (current_user_id, current_household_id, 'Big Wants', '#d87363', 'bigWants', 15, true, 30),
    (current_user_id, current_household_id, 'Income', '#b7a7d8', 'income', NULL, true, 40),
    (current_user_id, current_household_id, 'Savings', '#ffe69b', 'savings', 20, true, 50)
  ON CONFLICT (household_id, name) DO UPDATE
    SET color = EXCLUDED.color,
        user_id = EXCLUDED.user_id,
        group_key = EXCLUDED.group_key,
        target_percent = EXCLUDED.target_percent,
        is_group = EXCLUDED.is_group,
        sort_order = EXCLUDED.sort_order;

  SELECT id INTO needs_id FROM categories WHERE household_id = current_household_id AND name = 'Needs';
  SELECT id INTO wants_id FROM categories WHERE household_id = current_household_id AND name = 'Wants';
  SELECT id INTO big_wants_id FROM categories WHERE household_id = current_household_id AND name = 'Big Wants';
  SELECT id INTO income_id FROM categories WHERE household_id = current_household_id AND name = 'Income';
  SELECT id INTO savings_id FROM categories WHERE household_id = current_household_id AND name = 'Savings';

  INSERT INTO categories (user_id, household_id, name, color, parent_category_id, group_key, default_monthly_budget_cents, is_income, sort_order)
  VALUES
    (current_user_id, current_household_id, 'Bills', '#c7d7f2', needs_id, 'needs', 530000, false, 10),
    (current_user_id, current_household_id, 'Groceries', '#c7d7f2', needs_id, 'needs', 80000, false, 20),
    (current_user_id, current_household_id, 'Home & Office', '#c7d7f2', needs_id, 'needs', 25000, false, 30),
    (current_user_id, current_household_id, 'Dependents', '#c7d7f2', needs_id, 'needs', 40000, false, 40),
    (current_user_id, current_household_id, 'Auto & Transport', '#c7d7f2', needs_id, 'needs', 30000, false, 50),
    (current_user_id, current_household_id, 'Health', '#c7d7f2', needs_id, 'needs', 30000, false, 60),
    (current_user_id, current_household_id, 'Entertainment', '#f7ddbe', wants_id, 'wants', 15000, false, 70),
    (current_user_id, current_household_id, 'Person A', '#f7ddbe', wants_id, 'wants', 35000, false, 80),
    (current_user_id, current_household_id, 'Person B', '#f7ddbe', wants_id, 'wants', 35000, false, 90),
    (current_user_id, current_household_id, 'Shared', '#f7ddbe', wants_id, 'wants', 25000, false, 100),
    (current_user_id, current_household_id, 'Projects', '#e6b1aa', big_wants_id, 'bigWants', 0, false, 110),
    (current_user_id, current_household_id, 'Travel', '#e6b1aa', big_wants_id, 'bigWants', 0, false, 120),
    (current_user_id, current_household_id, 'Income Transfers', '#d4caea', income_id, 'income', 0, true, 130),
    (current_user_id, current_household_id, 'Savings Transfers', '#fff1bd', savings_id, 'savings', 0, false, 140)
  ON CONFLICT (household_id, name) DO UPDATE
    SET color = EXCLUDED.color,
        user_id = EXCLUDED.user_id,
        parent_category_id = EXCLUDED.parent_category_id,
        group_key = EXCLUDED.group_key,
        default_monthly_budget_cents = EXCLUDED.default_monthly_budget_cents,
        is_income = EXCLUDED.is_income,
        sort_order = EXCLUDED.sort_order;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Dependents';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents, kind, formula_operator)
  VALUES
    (current_user_id, current_household_id, category_id, 'Dependent A Registration', 3992, 'fixed', NULL),
    (current_user_id, current_household_id, category_id, 'Dependent B Registration', 1917, 'fixed', NULL),
    (current_user_id, current_household_id, category_id, 'Dependent B Insurance', 5417, 'fixed', NULL)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        kind = EXCLUDED.kind,
        formula_operator = EXCLUDED.formula_operator,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Entertainment';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents, kind, formula_operator)
  VALUES
    (current_user_id, current_household_id, category_id, 'Amazon Prime', 1242, 'fixed', NULL),
    (current_user_id, current_household_id, category_id, 'Netflix', 690, 'fixed', NULL),
    (current_user_id, current_household_id, category_id, 'Monthly Entertainment', -3766, 'formula', 'negative_sum')
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        kind = EXCLUDED.kind,
        formula_operator = EXCLUDED.formula_operator,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Groceries';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents, kind, formula_operator)
  VALUES (current_user_id, current_household_id, category_id, 'Costco Membership', 1000, 'fixed', NULL)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        kind = EXCLUDED.kind,
        formula_operator = EXCLUDED.formula_operator,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Auto & Transport';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents, kind, formula_operator)
  VALUES
    (current_user_id, current_household_id, category_id, 'AAA Membership', 708, 'fixed', NULL),
    (current_user_id, current_household_id, category_id, 'Monthly Auto', -12034, 'formula', 'negative_sum')
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        kind = EXCLUDED.kind,
        formula_operator = EXCLUDED.formula_operator,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Home & Office';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents, kind, formula_operator)
  VALUES (current_user_id, current_household_id, category_id, 'Google Storage', 833, 'fixed', NULL)
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        kind = EXCLUDED.kind,
        formula_operator = EXCLUDED.formula_operator,
        is_active = true;

  SELECT id INTO category_id FROM categories WHERE household_id = current_household_id AND name = 'Bills';
  INSERT INTO recurring_values (user_id, household_id, category_id, name, amount_cents, kind, formula_operator)
  VALUES
    (current_user_id, current_household_id, category_id, 'Mint Mobile', 3344, 'fixed', NULL),
    (current_user_id, current_household_id, category_id, 'Monthly Bills', -3344, 'formula', 'negative_sum')
  ON CONFLICT (household_id, name) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        category_id = EXCLUDED.category_id,
        amount_cents = EXCLUDED.amount_cents,
        kind = EXCLUDED.kind,
        formula_operator = EXCLUDED.formula_operator,
        is_active = true;

  PERFORM sync_seeded_recurring_formulas(current_household_id);
END;
$$;


ALTER FUNCTION "public"."seed_workbook_constants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_auth_user_to_public_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO users (id, email, full_name)
  VALUES (
    NEW.id,
    LOWER(NEW.email),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, users.full_name),
        updated_at = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_auth_user_to_public_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_seeded_recurring_formulas"("target_household_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  monthly_auto_id UUID;
  monthly_bills_id UUID;
  monthly_entertainment_id UUID;
BEGIN
  SELECT id INTO monthly_auto_id
  FROM recurring_values
  WHERE household_id = target_household_id
  AND name = 'Monthly Auto';

  SELECT id INTO monthly_bills_id
  FROM recurring_values
  WHERE household_id = target_household_id
  AND name = 'Monthly Bills';

  SELECT id INTO monthly_entertainment_id
  FROM recurring_values
  WHERE household_id = target_household_id
  AND name = 'Monthly Entertainment';

  UPDATE recurring_values
  SET kind = 'fixed',
      formula_operator = NULL
  WHERE household_id = target_household_id
  AND name NOT IN ('Monthly Auto', 'Monthly Bills', 'Monthly Entertainment');

  UPDATE recurring_values
  SET kind = 'formula',
      formula_operator = 'negative_sum'
  WHERE id IN (monthly_auto_id, monthly_bills_id, monthly_entertainment_id);

  IF monthly_auto_id IS NOT NULL THEN
    DELETE FROM recurring_value_dependencies WHERE recurring_value_id = monthly_auto_id;

    INSERT INTO recurring_value_dependencies (recurring_value_id, depends_on_recurring_value_id)
    SELECT monthly_auto_id, id
    FROM recurring_values
    WHERE household_id = target_household_id
    AND name IN ('Dependent A Registration', 'Dependent B Insurance', 'Dependent B Registration', 'AAA Membership')
    ON CONFLICT DO NOTHING;
  END IF;

  IF monthly_bills_id IS NOT NULL THEN
    DELETE FROM recurring_value_dependencies WHERE recurring_value_id = monthly_bills_id;

    INSERT INTO recurring_value_dependencies (recurring_value_id, depends_on_recurring_value_id)
    SELECT monthly_bills_id, id
    FROM recurring_values
    WHERE household_id = target_household_id
    AND name IN ('Mint Mobile')
    ON CONFLICT DO NOTHING;
  END IF;

  IF monthly_entertainment_id IS NOT NULL THEN
    DELETE FROM recurring_value_dependencies WHERE recurring_value_id = monthly_entertainment_id;

    INSERT INTO recurring_value_dependencies (recurring_value_id, depends_on_recurring_value_id)
    SELECT monthly_entertainment_id, id
    FROM recurring_values
    WHERE household_id = target_household_id
    AND name IN ('Amazon Prime', 'Netflix', 'Costco Membership')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;


ALTER FUNCTION "public"."sync_seeded_recurring_formulas"("target_household_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_split_category_matches_household"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  category_household_id UUID;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT household_id INTO category_household_id
  FROM categories
  WHERE id = NEW.category_id;

  IF category_household_id IS NULL OR category_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'transaction split category must belong to split household';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."transaction_split_category_matches_household"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_split_household_matches_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  transaction_household_id UUID;
BEGIN
  SELECT household_id INTO transaction_household_id
  FROM transactions
  WHERE id = NEW.transaction_id;

  IF transaction_household_id IS NULL OR transaction_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'transaction split household must match transaction household';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."transaction_split_household_matches_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_split_tag_matches_household"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  split_household_id UUID;
  tag_household_id UUID;
BEGIN
  SELECT household_id INTO split_household_id
  FROM transaction_splits
  WHERE id = NEW.transaction_split_id;

  SELECT household_id INTO tag_household_id
  FROM tags
  WHERE id = NEW.tag_id;

  IF split_household_id IS NULL OR tag_household_id IS NULL OR split_household_id <> tag_household_id THEN
    RAISE EXCEPTION 'transaction split tag must belong to split household';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."transaction_split_tag_matches_household"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transaction_splits_sum_matches_transaction"("target_transaction_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(SUM(ts.amount_cents), 0) = t.amount_cents
  FROM transactions t
  LEFT JOIN transaction_splits ts ON ts.transaction_id = t.id
  WHERE t.id = target_transaction_id
  GROUP BY t.id, t.amount_cents;
$$;


ALTER FUNCTION "public"."transaction_splits_sum_matches_transaction"("target_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_manual_account_balance_for_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.source = 'manual' THEN
      UPDATE accounts
      SET
        current_balance_cents = COALESCE(current_balance_cents, 0) + OLD.amount_cents,
        available_balance_cents = COALESCE(available_balance_cents, 0) + OLD.amount_cents
      WHERE id = OLD.account_id AND source = 'manual';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.source = 'manual' THEN
      UPDATE accounts
      SET
        current_balance_cents = COALESCE(current_balance_cents, 0) - NEW.amount_cents,
        available_balance_cents = COALESCE(available_balance_cents, 0) - NEW.amount_cents
      WHERE id = NEW.account_id AND source = 'manual';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_manual_account_balance_for_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_budget_transaction_group_member"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."validate_budget_transaction_group_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_category_balance_adjustment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."validate_category_balance_adjustment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_credit_card_payment_link"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  checking_household_id UUID;
  checking_amount_cents BIGINT;
  checking_account_type TEXT;
  credit_household_id UUID;
  credit_amount_cents BIGINT;
  credit_account_type TEXT;
BEGIN
  SELECT t.household_id, t.amount_cents, a.type
  INTO checking_household_id, checking_amount_cents, checking_account_type
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  WHERE t.id = NEW.checking_transaction_id;

  SELECT t.household_id, t.amount_cents, a.type
  INTO credit_household_id, credit_amount_cents, credit_account_type
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  WHERE t.id = NEW.credit_transaction_id;

  IF checking_household_id IS NULL OR credit_household_id IS NULL THEN
    RAISE EXCEPTION 'credit card payment transactions were not found';
  END IF;

  IF checking_household_id <> NEW.household_id OR credit_household_id <> NEW.household_id THEN
    RAISE EXCEPTION 'credit card payment transactions must belong to the link household';
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


ALTER FUNCTION "public"."validate_credit_card_payment_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_source_transaction_fun_money_allocations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."validate_source_transaction_fun_money_allocations"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_balance_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "household_id" "uuid",
    "account_id" "uuid" NOT NULL,
    "current_balance_cents" bigint,
    "available_balance_cents" bigint,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."account_balance_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaid_account_id" "text",
    "plaid_item_id" "text",
    "name" "text" NOT NULL,
    "official_name" "text",
    "type" "text" NOT NULL,
    "subtype" "text",
    "current_balance_cents" bigint,
    "available_balance_cents" bigint,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_id" "uuid",
    "plaid_environment" "text",
    "last_balance_sync_at" timestamp with time zone,
    "balance_category" "text",
    "source" "text" DEFAULT 'plaid'::"text" NOT NULL,
    CONSTRAINT "accounts_balance_category_check" CHECK (("balance_category" = ANY (ARRAY['checking'::"text", 'savings'::"text", 'ccDebt'::"text", 'investments'::"text", 'hidden'::"text"]))),
    CONSTRAINT "accounts_plaid_environment_check" CHECK (("plaid_environment" = ANY (ARRAY['sandbox'::"text", 'development'::"text", 'production'::"text"]))),
    CONSTRAINT "accounts_source_check" CHECK (("source" = ANY (ARRAY['plaid'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."amazon_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "price_cents" bigint,
    "asin" "text",
    "quantity" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."amazon_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."amazon_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sync_session_id" "uuid",
    "order_id" "text" NOT NULL,
    "order_detail_url" "text",
    "item_subtotal_cents" bigint,
    "shipping_cents" bigint,
    "discounts_cents" bigint,
    "tax_cents" bigint,
    "grand_total_cents" bigint,
    "raw_summary_text" "text",
    "details_imported_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."amazon_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."amazon_payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sync_session_id" "uuid",
    "order_id" "text" NOT NULL,
    "transaction_date" "date",
    "amount_cents" bigint NOT NULL,
    "payment_method_hint" "text",
    "merchant_text" "text",
    "order_detail_url" "text",
    "raw_text" "text",
    "is_refund" boolean DEFAULT false NOT NULL,
    "plaid_transaction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."amazon_payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."amazon_sync_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "app_origin" "text" NOT NULL,
    "cutoff_date" "date",
    "expires_at" timestamp with time zone NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."amazon_sync_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_card_payment_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "checking_transaction_id" "uuid" NOT NULL,
    "credit_transaction_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_card_payment_links_check" CHECK (("checking_transaction_id" <> "credit_transaction_id"))
);


ALTER TABLE "public"."credit_card_payment_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."imported_budget_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "source" "text" NOT NULL,
    "source_sheet" "text" NOT NULL,
    "source_cell" "text" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "date" "date" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "description" "text" NOT NULL,
    "notes" "text",
    "raw_comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "imported_budget_lines_amount_cents_check" CHECK (("amount_cents" <> 0)),
    CONSTRAINT "imported_budget_lines_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);


ALTER TABLE "public"."imported_budget_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "household_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "amount_cents" bigint NOT NULL,
    "notes" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transaction_splits_amount_cents_check" CHECK (("amount_cents" <> 0))
);


ALTER TABLE "public"."transaction_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "plaid_transaction_id" "text",
    "date" "date" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "merchant_name" "text",
    "description" "text" NOT NULL,
    "pending" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_id" "uuid",
    "plaid_environment" "text",
    "source" "text" DEFAULT 'plaid'::"text" NOT NULL,
    CONSTRAINT "transactions_plaid_environment_check" CHECK (("plaid_environment" = ANY (ARRAY['sandbox'::"text", 'development'::"text", 'production'::"text"]))),
    CONSTRAINT "transactions_source_check" CHECK (("source" = ANY (ARRAY['plaid'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."budget_actual_lines" AS
 SELECT "t"."id" AS "transaction_id",
    NULL::"uuid" AS "transaction_split_id",
    NULL::"uuid" AS "imported_budget_line_id",
    "t"."user_id",
    "t"."household_id",
    "t"."account_id",
    "t"."category_id",
    "t"."date",
    "t"."amount_cents",
    "t"."pending",
    "t"."notes",
    "t"."plaid_environment",
    false AS "is_split",
    'transaction'::"text" AS "source_type",
    "t"."description",
    "t"."merchant_name"
   FROM "public"."transactions" "t"
  WHERE ((NOT (EXISTS ( SELECT 1
           FROM "public"."transaction_splits" "ts"
          WHERE ("ts"."transaction_id" = "t"."id")))) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."credit_card_payment_links" "ccpl"
          WHERE (("ccpl"."checking_transaction_id" = "t"."id") OR ("ccpl"."credit_transaction_id" = "t"."id"))))))
UNION ALL
 SELECT "t"."id" AS "transaction_id",
    "ts"."id" AS "transaction_split_id",
    NULL::"uuid" AS "imported_budget_line_id",
    "t"."user_id",
    "t"."household_id",
    "t"."account_id",
    "ts"."category_id",
    "t"."date",
    "ts"."amount_cents",
    "t"."pending",
    "ts"."notes",
    "t"."plaid_environment",
    true AS "is_split",
    'transaction_split'::"text" AS "source_type",
    "t"."description",
    "t"."merchant_name"
   FROM ("public"."transactions" "t"
     JOIN "public"."transaction_splits" "ts" ON (("ts"."transaction_id" = "t"."id")))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM "public"."credit_card_payment_links" "ccpl"
          WHERE (("ccpl"."checking_transaction_id" = "t"."id") OR ("ccpl"."credit_transaction_id" = "t"."id")))))
UNION ALL
 SELECT NULL::"uuid" AS "transaction_id",
    NULL::"uuid" AS "transaction_split_id",
    "ibl"."id" AS "imported_budget_line_id",
    "ibl"."user_id",
    "ibl"."household_id",
    NULL::"uuid" AS "account_id",
    "ibl"."category_id",
    "ibl"."date",
    "ibl"."amount_cents",
    false AS "pending",
    "ibl"."notes",
    NULL::"text" AS "plaid_environment",
    false AS "is_split",
    'imported_budget_line'::"text" AS "source_type",
    "ibl"."description",
    NULL::"text" AS "merchant_name"
   FROM "public"."imported_budget_lines" "ibl";


ALTER VIEW "public"."budget_actual_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_transaction_group_members" (
    "transaction_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "household_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."budget_transaction_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_transaction_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budget_transaction_groups_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80)))
);


ALTER TABLE "public"."budget_transaction_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "amount_cents" bigint NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_id" "uuid",
    CONSTRAINT "budgets_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "icon" "text",
    "parent_category_id" "uuid",
    "is_income" boolean DEFAULT false NOT NULL,
    "sort_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_id" "uuid",
    "group_key" "text",
    "target_percent" numeric(5,2),
    "is_group" boolean DEFAULT false NOT NULL,
    "default_monthly_budget_cents" bigint DEFAULT 0 NOT NULL,
    "rollover_enabled" boolean DEFAULT false NOT NULL,
    "rollover_start_date" "date",
    CONSTRAINT "categories_rollover_start_date_check" CHECK (((NOT "rollover_enabled") OR ("rollover_start_date" IS NOT NULL)))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."budget_vs_actual" AS
 SELECT "b"."user_id",
    "b"."household_id",
    "b"."year",
    "b"."month",
    "b"."category_id",
    "c"."name" AS "category_name",
    "b"."amount_cents" AS "budgeted_cents",
    COALESCE("sum"("bal"."amount_cents"), (0)::numeric) AS "actual_cents",
    (("b"."amount_cents")::numeric - COALESCE("sum"("bal"."amount_cents"), (0)::numeric)) AS "difference_cents"
   FROM (("public"."budgets" "b"
     JOIN "public"."categories" "c" ON (("b"."category_id" = "c"."id")))
     LEFT JOIN "public"."budget_actual_lines" "bal" ON ((("bal"."category_id" = "b"."category_id") AND ("bal"."household_id" = "b"."household_id") AND ((EXTRACT(year FROM "bal"."date"))::integer = "b"."year") AND ((EXTRACT(month FROM "bal"."date"))::integer = "b"."month") AND (NOT "bal"."pending"))))
  GROUP BY "b"."user_id", "b"."household_id", "b"."year", "b"."month", "b"."category_id", "c"."name", "b"."amount_cents";


ALTER VIEW "public"."budget_vs_actual" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_balance_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "source_transaction_id" "uuid",
    "effective_date" "date" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'posted'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "category_balance_adjustments_amount_cents_check" CHECK (("amount_cents" <> 0)),
    CONSTRAINT "category_balance_adjustments_check" CHECK (((("kind" = 'income_allocation'::"text") AND ("source_transaction_id" IS NOT NULL)) OR (("kind" <> 'income_allocation'::"text") AND ("source_transaction_id" IS NULL)))),
    CONSTRAINT "category_balance_adjustments_kind_check" CHECK (("kind" = ANY (ARRAY['income_allocation'::"text", 'gift'::"text", 'opening_balance'::"text", 'correction'::"text", 'other'::"text"]))),
    CONSTRAINT "category_balance_adjustments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'posted'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."category_balance_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_budget_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "start_month" integer NOT NULL,
    "amount_cents" bigint NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "category_budget_periods_start_month_check" CHECK ((("start_month" >= 1) AND ("start_month" <= 12))),
    CONSTRAINT "category_budget_periods_year_check" CHECK ((("year" >= 2000) AND ("year" <= 2100)))
);


ALTER TABLE "public"."category_budget_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_layout_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "parent_category_id" "uuid",
    "start_year" integer NOT NULL,
    "start_month" integer NOT NULL,
    "end_year" integer,
    "end_month" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "category_layout_periods_check" CHECK (((("end_year" IS NULL) AND ("end_month" IS NULL)) OR (("end_year" IS NOT NULL) AND ("end_month" IS NOT NULL)))),
    CONSTRAINT "category_layout_periods_check1" CHECK ((("end_year" IS NULL) OR ((("end_year" * 12) + "end_month") >= (("start_year" * 12) + "start_month")))),
    CONSTRAINT "category_layout_periods_end_month_check" CHECK ((("end_month" >= 1) AND ("end_month" <= 12))),
    CONSTRAINT "category_layout_periods_end_year_check" CHECK ((("end_year" >= 2000) AND ("end_year" <= 2100))),
    CONSTRAINT "category_layout_periods_start_month_check" CHECK ((("start_month" >= 1) AND ("start_month" <= 12))),
    CONSTRAINT "category_layout_periods_start_year_check" CHECK ((("start_year" >= 2000) AND ("start_year" <= 2100)))
);


ALTER TABLE "public"."category_layout_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."household_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "household_invitations_email_check" CHECK (("email" = "lower"("btrim"("email")))),
    CONSTRAINT "household_invitations_role_check" CHECK (("role" = 'member'::"text")),
    CONSTRAINT "household_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."household_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."household_members" (
    "household_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "household_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."household_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."households" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."households" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."monthly_spending_by_category" AS
 SELECT "bal"."user_id",
    "bal"."household_id",
    (EXTRACT(year FROM "bal"."date"))::integer AS "year",
    (EXTRACT(month FROM "bal"."date"))::integer AS "month",
    "c"."id" AS "category_id",
    "c"."name" AS "category_name",
    "sum"("bal"."amount_cents") AS "total_cents",
    "count"(*) AS "transaction_count"
   FROM ("public"."budget_actual_lines" "bal"
     JOIN "public"."categories" "c" ON (("bal"."category_id" = "c"."id")))
  WHERE (NOT "bal"."pending")
  GROUP BY "bal"."user_id", "bal"."household_id", ((EXTRACT(year FROM "bal"."date"))::integer), ((EXTRACT(month FROM "bal"."date"))::integer), "c"."id", "c"."name";


ALTER VIEW "public"."monthly_spending_by_category" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plaid_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaid_item_id" "text" NOT NULL,
    "plaid_access_token" "text" NOT NULL,
    "institution_id" "text",
    "institution_name" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "error_code" "text",
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_id" "uuid",
    "plaid_environment" "text" DEFAULT 'sandbox'::"text",
    CONSTRAINT "plaid_items_plaid_environment_check" CHECK (("plaid_environment" = ANY (ARRAY['sandbox'::"text", 'development'::"text", 'production'::"text"])))
);


ALTER TABLE "public"."plaid_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plaid_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plaid_item_id" "text",
    "account_id" "uuid",
    "plaid_environment" "text",
    "sync_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "start_date" "date",
    "end_date" "date",
    "requested_count" integer DEFAULT 0 NOT NULL,
    "imported_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plaid_sync_runs_plaid_environment_check" CHECK (("plaid_environment" = ANY (ARRAY['sandbox'::"text", 'development'::"text", 'production'::"text"]))),
    CONSTRAINT "plaid_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text", 'skipped'::"text"]))),
    CONSTRAINT "plaid_sync_runs_sync_type_check" CHECK (("sync_type" = ANY (ARRAY['transactions'::"text", 'balances'::"text"])))
);


ALTER TABLE "public"."plaid_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_value_dependencies" (
    "recurring_value_id" "uuid" NOT NULL,
    "depends_on_recurring_value_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_value_dependencies_check" CHECK (("recurring_value_id" <> "depends_on_recurring_value_id"))
);


ALTER TABLE "public"."recurring_value_dependencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_value_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "household_id" "uuid" NOT NULL,
    "recurring_value_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "start_month" integer NOT NULL,
    "amount_cents" bigint NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_value_periods_start_month_check" CHECK ((("start_month" >= 1) AND ("start_month" <= 12))),
    CONSTRAINT "recurring_value_periods_year_check" CHECK ((("year" >= 2000) AND ("year" <= 2100)))
);


ALTER TABLE "public"."recurring_value_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "household_id" "uuid",
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "formula_operator" "text",
    "billing_frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    CONSTRAINT "recurring_values_billing_frequency_check" CHECK (("billing_frequency" = ANY (ARRAY['monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "recurring_values_formula_operator_check" CHECK (("formula_operator" = ANY (ARRAY['sum'::"text", 'negative_sum'::"text"]))),
    CONSTRAINT "recurring_values_kind_check" CHECK (("kind" = ANY (ARRAY['fixed'::"text", 'formula'::"text"])))
);


ALTER TABLE "public"."recurring_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "household_id" "uuid"
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_split_tags" (
    "transaction_split_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaction_split_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_tags" (
    "transaction_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaction_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_account_id_recorded_at_key" UNIQUE ("account_id", "recorded_at");



ALTER TABLE ONLY "public"."account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_plaid_environment_plaid_account_id_key" UNIQUE ("plaid_environment", "plaid_account_id");



ALTER TABLE ONLY "public"."amazon_order_items"
    ADD CONSTRAINT "amazon_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amazon_orders"
    ADD CONSTRAINT "amazon_orders_household_id_order_id_key" UNIQUE ("household_id", "order_id");



ALTER TABLE ONLY "public"."amazon_orders"
    ADD CONSTRAINT "amazon_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amazon_payment_transactions"
    ADD CONSTRAINT "amazon_payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amazon_payment_transactions"
    ADD CONSTRAINT "amazon_payment_transactions_unique" UNIQUE NULLS NOT DISTINCT ("household_id", "order_id", "amount_cents", "payment_method_hint", "transaction_date");



ALTER TABLE ONLY "public"."amazon_sync_sessions"
    ADD CONSTRAINT "amazon_sync_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amazon_sync_sessions"
    ADD CONSTRAINT "amazon_sync_sessions_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."budget_transaction_group_members"
    ADD CONSTRAINT "budget_transaction_group_members_pkey" PRIMARY KEY ("transaction_id");



ALTER TABLE ONLY "public"."budget_transaction_groups"
    ADD CONSTRAINT "budget_transaction_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_household_id_category_id_year_month_key" UNIQUE ("household_id", "category_id", "year", "month");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_category_id_year_month_key" UNIQUE ("user_id", "category_id", "year", "month");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_household_id_name_key" UNIQUE ("household_id", "name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."category_balance_adjustments"
    ADD CONSTRAINT "category_balance_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_balance_adjustments"
    ADD CONSTRAINT "category_balance_adjustments_source_transaction_id_category_key" UNIQUE ("source_transaction_id", "category_id");



ALTER TABLE ONLY "public"."category_budget_periods"
    ADD CONSTRAINT "category_budget_periods_household_id_category_id_year_start_key" UNIQUE ("household_id", "category_id", "year", "start_month");



ALTER TABLE ONLY "public"."category_budget_periods"
    ADD CONSTRAINT "category_budget_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_layout_periods"
    ADD CONSTRAINT "category_layout_periods_household_id_category_id_start_year_key" UNIQUE ("household_id", "category_id", "start_year", "start_month");



ALTER TABLE ONLY "public"."category_layout_periods"
    ADD CONSTRAINT "category_layout_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_card_payment_links"
    ADD CONSTRAINT "credit_card_payment_links_checking_transaction_id_key" UNIQUE ("checking_transaction_id");



ALTER TABLE ONLY "public"."credit_card_payment_links"
    ADD CONSTRAINT "credit_card_payment_links_credit_transaction_id_key" UNIQUE ("credit_transaction_id");



ALTER TABLE ONLY "public"."credit_card_payment_links"
    ADD CONSTRAINT "credit_card_payment_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."household_invitations"
    ADD CONSTRAINT "household_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."household_members"
    ADD CONSTRAINT "household_members_pkey" PRIMARY KEY ("household_id", "user_id");



ALTER TABLE ONLY "public"."households"
    ADD CONSTRAINT "households_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."imported_budget_lines"
    ADD CONSTRAINT "imported_budget_lines_household_id_source_source_sheet_sour_key" UNIQUE ("household_id", "source", "source_sheet", "source_cell");



ALTER TABLE ONLY "public"."imported_budget_lines"
    ADD CONSTRAINT "imported_budget_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plaid_items"
    ADD CONSTRAINT "plaid_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plaid_items"
    ADD CONSTRAINT "plaid_items_plaid_item_id_key" UNIQUE ("plaid_item_id");



ALTER TABLE ONLY "public"."plaid_sync_runs"
    ADD CONSTRAINT "plaid_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_value_dependencies"
    ADD CONSTRAINT "recurring_value_dependencies_pkey" PRIMARY KEY ("recurring_value_id", "depends_on_recurring_value_id");



ALTER TABLE ONLY "public"."recurring_value_periods"
    ADD CONSTRAINT "recurring_value_periods_household_id_recurring_value_id_yea_key" UNIQUE ("household_id", "recurring_value_id", "year", "start_month");



ALTER TABLE ONLY "public"."recurring_value_periods"
    ADD CONSTRAINT "recurring_value_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_values"
    ADD CONSTRAINT "recurring_values_household_id_name_key" UNIQUE ("household_id", "name");



ALTER TABLE ONLY "public"."recurring_values"
    ADD CONSTRAINT "recurring_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_values"
    ADD CONSTRAINT "recurring_values_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_household_id_name_key" UNIQUE ("household_id", "name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."transaction_split_tags"
    ADD CONSTRAINT "transaction_split_tags_pkey" PRIMARY KEY ("transaction_split_id", "tag_id");



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_tags"
    ADD CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("transaction_id", "tag_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_plaid_environment_plaid_transaction_id_key" UNIQUE ("plaid_environment", "plaid_transaction_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "household_invitations_email_status_idx" ON "public"."household_invitations" USING "btree" ("email", "status", "expires_at" DESC);



CREATE UNIQUE INDEX "household_invitations_pending_email_key" ON "public"."household_invitations" USING "btree" ("household_id", "email") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_account_balance_snapshots_account_recorded" ON "public"."account_balance_snapshots" USING "btree" ("account_id", "recorded_at");



CREATE INDEX "idx_account_balance_snapshots_household_recorded" ON "public"."account_balance_snapshots" USING "btree" ("household_id", "recorded_at");



CREATE INDEX "idx_accounts_household_balance_category" ON "public"."accounts" USING "btree" ("household_id", "balance_category");



CREATE INDEX "idx_accounts_household_balance_sync" ON "public"."accounts" USING "btree" ("household_id", "last_balance_sync_at");



CREATE INDEX "idx_accounts_household_id" ON "public"."accounts" USING "btree" ("household_id");



CREATE INDEX "idx_accounts_household_source" ON "public"."accounts" USING "btree" ("household_id", "source");



CREATE INDEX "idx_accounts_plaid_account_id" ON "public"."accounts" USING "btree" ("plaid_account_id");



CREATE INDEX "idx_accounts_user_id" ON "public"."accounts" USING "btree" ("user_id");



CREATE INDEX "idx_amazon_order_items_household_order" ON "public"."amazon_order_items" USING "btree" ("household_id", "order_id", "sort_order");



CREATE INDEX "idx_amazon_orders_household_imported" ON "public"."amazon_orders" USING "btree" ("household_id", "details_imported_at" DESC);



CREATE INDEX "idx_amazon_orders_household_order" ON "public"."amazon_orders" USING "btree" ("household_id", "order_id");



CREATE INDEX "idx_amazon_payment_transactions_household_created" ON "public"."amazon_payment_transactions" USING "btree" ("household_id", "created_at" DESC);



CREATE INDEX "idx_amazon_payment_transactions_household_order" ON "public"."amazon_payment_transactions" USING "btree" ("household_id", "order_id");



CREATE INDEX "idx_amazon_sync_sessions_expires" ON "public"."amazon_sync_sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_amazon_sync_sessions_household_created" ON "public"."amazon_sync_sessions" USING "btree" ("household_id", "created_at" DESC);



CREATE INDEX "idx_budget_transaction_group_members_group" ON "public"."budget_transaction_group_members" USING "btree" ("group_id");



CREATE UNIQUE INDEX "idx_budget_transaction_groups_household_name" ON "public"."budget_transaction_groups" USING "btree" ("household_id", "lower"("btrim"("name")));



CREATE INDEX "idx_budgets_category_id" ON "public"."budgets" USING "btree" ("category_id");



CREATE INDEX "idx_budgets_household_id" ON "public"."budgets" USING "btree" ("household_id");



CREATE INDEX "idx_budgets_user_id" ON "public"."budgets" USING "btree" ("user_id");



CREATE INDEX "idx_budgets_year_month" ON "public"."budgets" USING "btree" ("year", "month");



CREATE INDEX "idx_categories_group_key" ON "public"."categories" USING "btree" ("user_id", "group_key");



CREATE INDEX "idx_categories_household_group_key" ON "public"."categories" USING "btree" ("household_id", "group_key");



CREATE INDEX "idx_categories_household_id" ON "public"."categories" USING "btree" ("household_id");



CREATE INDEX "idx_categories_household_is_group" ON "public"."categories" USING "btree" ("household_id", "is_group");



CREATE INDEX "idx_categories_is_group" ON "public"."categories" USING "btree" ("user_id", "is_group");



CREATE INDEX "idx_categories_parent" ON "public"."categories" USING "btree" ("parent_category_id");



CREATE INDEX "idx_categories_user_id" ON "public"."categories" USING "btree" ("user_id");



CREATE INDEX "idx_category_balance_adjustments_category_date" ON "public"."category_balance_adjustments" USING "btree" ("category_id", "effective_date");



CREATE INDEX "idx_category_balance_adjustments_household_date" ON "public"."category_balance_adjustments" USING "btree" ("household_id", "effective_date");



CREATE INDEX "idx_category_balance_adjustments_source" ON "public"."category_balance_adjustments" USING "btree" ("source_transaction_id") WHERE ("source_transaction_id" IS NOT NULL);



CREATE INDEX "idx_category_budget_periods_lookup" ON "public"."category_budget_periods" USING "btree" ("household_id", "category_id", "year", "start_month");



CREATE INDEX "idx_category_layout_periods_household" ON "public"."category_layout_periods" USING "btree" ("household_id", "start_year", "start_month");



CREATE INDEX "idx_category_layout_periods_lookup" ON "public"."category_layout_periods" USING "btree" ("household_id", "category_id", "start_year", "start_month");



CREATE INDEX "idx_credit_card_payment_links_household" ON "public"."credit_card_payment_links" USING "btree" ("household_id", "created_at" DESC);



CREATE INDEX "idx_household_members_user_id" ON "public"."household_members" USING "btree" ("user_id");



CREATE INDEX "idx_imported_budget_lines_household_category" ON "public"."imported_budget_lines" USING "btree" ("household_id", "category_id");



CREATE INDEX "idx_imported_budget_lines_household_date" ON "public"."imported_budget_lines" USING "btree" ("household_id", "date");



CREATE INDEX "idx_imported_budget_lines_source" ON "public"."imported_budget_lines" USING "btree" ("household_id", "source");



CREATE INDEX "idx_plaid_items_household_id" ON "public"."plaid_items" USING "btree" ("household_id");



CREATE INDEX "idx_plaid_items_plaid_item_id" ON "public"."plaid_items" USING "btree" ("plaid_item_id");



CREATE INDEX "idx_plaid_items_user_id" ON "public"."plaid_items" USING "btree" ("user_id");



CREATE INDEX "idx_plaid_sync_runs_account_created" ON "public"."plaid_sync_runs" USING "btree" ("account_id", "created_at" DESC);



CREATE INDEX "idx_plaid_sync_runs_household_created" ON "public"."plaid_sync_runs" USING "btree" ("household_id", "created_at" DESC);



CREATE INDEX "idx_plaid_sync_runs_household_type_created" ON "public"."plaid_sync_runs" USING "btree" ("household_id", "sync_type", "created_at" DESC);



CREATE INDEX "idx_recurring_value_dependencies_depends_on" ON "public"."recurring_value_dependencies" USING "btree" ("depends_on_recurring_value_id");



CREATE INDEX "idx_recurring_value_periods_lookup" ON "public"."recurring_value_periods" USING "btree" ("household_id", "recurring_value_id", "year", "start_month");



CREATE INDEX "idx_recurring_values_category_id" ON "public"."recurring_values" USING "btree" ("category_id");



CREATE INDEX "idx_recurring_values_household_id" ON "public"."recurring_values" USING "btree" ("household_id");



CREATE INDEX "idx_recurring_values_user_id" ON "public"."recurring_values" USING "btree" ("user_id");



CREATE INDEX "idx_tags_household_id" ON "public"."tags" USING "btree" ("household_id");



CREATE INDEX "idx_tags_user_id" ON "public"."tags" USING "btree" ("user_id");



CREATE INDEX "idx_transaction_split_tags_tag_id" ON "public"."transaction_split_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_transaction_splits_household_category" ON "public"."transaction_splits" USING "btree" ("household_id", "category_id");



CREATE INDEX "idx_transaction_splits_transaction_id" ON "public"."transaction_splits" USING "btree" ("transaction_id");



CREATE INDEX "idx_transaction_tags_tag_id" ON "public"."transaction_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_transaction_tags_transaction_id" ON "public"."transaction_tags" USING "btree" ("transaction_id");



CREATE INDEX "idx_transactions_account_id" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_category_id" ON "public"."transactions" USING "btree" ("category_id");



CREATE INDEX "idx_transactions_date" ON "public"."transactions" USING "btree" ("date");



CREATE INDEX "idx_transactions_household_category_date" ON "public"."transactions" USING "btree" ("household_id", "category_id", "date" DESC);



CREATE INDEX "idx_transactions_household_date" ON "public"."transactions" USING "btree" ("household_id", "date" DESC);



CREATE INDEX "idx_transactions_household_environment_date" ON "public"."transactions" USING "btree" ("household_id", "plaid_environment", "date" DESC);



CREATE INDEX "idx_transactions_household_id" ON "public"."transactions" USING "btree" ("household_id");



CREATE INDEX "idx_transactions_household_source" ON "public"."transactions" USING "btree" ("household_id", "source");



CREATE INDEX "idx_transactions_plaid_id" ON "public"."transactions" USING "btree" ("plaid_transaction_id");



CREATE INDEX "idx_transactions_user_id" ON "public"."transactions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "remove_invalid_credit_card_payment_links_trigger" AFTER UPDATE OF "account_id", "household_id", "amount_cents" ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."remove_invalid_credit_card_payment_links"();



CREATE OR REPLACE TRIGGER "transaction_split_category_matches_household_trigger" BEFORE INSERT OR UPDATE OF "category_id", "household_id" ON "public"."transaction_splits" FOR EACH ROW EXECUTE FUNCTION "public"."transaction_split_category_matches_household"();



CREATE OR REPLACE TRIGGER "transaction_split_household_matches_transaction_trigger" BEFORE INSERT OR UPDATE OF "transaction_id", "household_id" ON "public"."transaction_splits" FOR EACH ROW EXECUTE FUNCTION "public"."transaction_split_household_matches_transaction"();



CREATE OR REPLACE TRIGGER "transaction_split_tag_matches_household_trigger" BEFORE INSERT OR UPDATE OF "transaction_split_id", "tag_id" ON "public"."transaction_split_tags" FOR EACH ROW EXECUTE FUNCTION "public"."transaction_split_tag_matches_household"();



CREATE OR REPLACE TRIGGER "update_accounts_updated_at" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_amazon_orders_updated_at" BEFORE UPDATE ON "public"."amazon_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_amazon_payment_transactions_updated_at" BEFORE UPDATE ON "public"."amazon_payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_budget_transaction_groups_updated_at" BEFORE UPDATE ON "public"."budget_transaction_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_budgets_updated_at" BEFORE UPDATE ON "public"."budgets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_category_balance_adjustments_updated_at" BEFORE UPDATE ON "public"."category_balance_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_category_budget_periods_updated_at" BEFORE UPDATE ON "public"."category_budget_periods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_category_layout_periods_updated_at" BEFORE UPDATE ON "public"."category_layout_periods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_households_updated_at" BEFORE UPDATE ON "public"."households" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_imported_budget_lines_updated_at" BEFORE UPDATE ON "public"."imported_budget_lines" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_manual_account_balance_for_transaction_trigger" AFTER INSERT OR DELETE OR UPDATE OF "account_id", "amount_cents", "source" ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_manual_account_balance_for_transaction"();



CREATE OR REPLACE TRIGGER "update_plaid_items_updated_at" BEFORE UPDATE ON "public"."plaid_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_recurring_value_periods_updated_at" BEFORE UPDATE ON "public"."recurring_value_periods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_recurring_values_updated_at" BEFORE UPDATE ON "public"."recurring_values" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_transaction_splits_updated_at" BEFORE UPDATE ON "public"."transaction_splits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_budget_transaction_group_member_trigger" BEFORE INSERT OR UPDATE OF "transaction_id", "group_id", "household_id" ON "public"."budget_transaction_group_members" FOR EACH ROW EXECUTE FUNCTION "public"."validate_budget_transaction_group_member"();



CREATE OR REPLACE TRIGGER "validate_category_balance_adjustment_trigger" BEFORE INSERT OR UPDATE OF "household_id", "category_id", "source_transaction_id", "effective_date", "amount_cents", "status" ON "public"."category_balance_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_category_balance_adjustment"();



CREATE OR REPLACE TRIGGER "validate_credit_card_payment_link_trigger" BEFORE INSERT OR UPDATE ON "public"."credit_card_payment_links" FOR EACH ROW EXECUTE FUNCTION "public"."validate_credit_card_payment_link"();



CREATE OR REPLACE TRIGGER "validate_source_transaction_fun_money_allocations_trigger" BEFORE UPDATE OF "amount_cents", "pending" ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_source_transaction_fun_money_allocations"();



ALTER TABLE ONLY "public"."account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_balance_snapshots"
    ADD CONSTRAINT "account_balance_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_order_items"
    ADD CONSTRAINT "amazon_order_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_order_items"
    ADD CONSTRAINT "amazon_order_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_orders"
    ADD CONSTRAINT "amazon_orders_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_orders"
    ADD CONSTRAINT "amazon_orders_sync_session_id_fkey" FOREIGN KEY ("sync_session_id") REFERENCES "public"."amazon_sync_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."amazon_orders"
    ADD CONSTRAINT "amazon_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_payment_transactions"
    ADD CONSTRAINT "amazon_payment_transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_payment_transactions"
    ADD CONSTRAINT "amazon_payment_transactions_plaid_transaction_id_fkey" FOREIGN KEY ("plaid_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."amazon_payment_transactions"
    ADD CONSTRAINT "amazon_payment_transactions_sync_session_id_fkey" FOREIGN KEY ("sync_session_id") REFERENCES "public"."amazon_sync_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."amazon_payment_transactions"
    ADD CONSTRAINT "amazon_payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_sync_sessions"
    ADD CONSTRAINT "amazon_sync_sessions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."amazon_sync_sessions"
    ADD CONSTRAINT "amazon_sync_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transaction_group_members"
    ADD CONSTRAINT "budget_transaction_group_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."budget_transaction_group_members"
    ADD CONSTRAINT "budget_transaction_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."budget_transaction_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transaction_group_members"
    ADD CONSTRAINT "budget_transaction_group_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transaction_group_members"
    ADD CONSTRAINT "budget_transaction_group_members_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_transaction_groups"
    ADD CONSTRAINT "budget_transaction_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."budget_transaction_groups"
    ADD CONSTRAINT "budget_transaction_groups_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_balance_adjustments"
    ADD CONSTRAINT "category_balance_adjustments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_balance_adjustments"
    ADD CONSTRAINT "category_balance_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."category_balance_adjustments"
    ADD CONSTRAINT "category_balance_adjustments_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_balance_adjustments"
    ADD CONSTRAINT "category_balance_adjustments_source_transaction_id_fkey" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_budget_periods"
    ADD CONSTRAINT "category_budget_periods_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_budget_periods"
    ADD CONSTRAINT "category_budget_periods_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_layout_periods"
    ADD CONSTRAINT "category_layout_periods_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_layout_periods"
    ADD CONSTRAINT "category_layout_periods_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_layout_periods"
    ADD CONSTRAINT "category_layout_periods_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_card_payment_links"
    ADD CONSTRAINT "credit_card_payment_links_checking_transaction_id_fkey" FOREIGN KEY ("checking_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_card_payment_links"
    ADD CONSTRAINT "credit_card_payment_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_card_payment_links"
    ADD CONSTRAINT "credit_card_payment_links_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_card_payment_links"
    ADD CONSTRAINT "credit_card_payment_links_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."household_invitations"
    ADD CONSTRAINT "household_invitations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."household_invitations"
    ADD CONSTRAINT "household_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."household_members"
    ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."household_members"
    ADD CONSTRAINT "household_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."imported_budget_lines"
    ADD CONSTRAINT "imported_budget_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."imported_budget_lines"
    ADD CONSTRAINT "imported_budget_lines_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."imported_budget_lines"
    ADD CONSTRAINT "imported_budget_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plaid_items"
    ADD CONSTRAINT "plaid_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plaid_items"
    ADD CONSTRAINT "plaid_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plaid_sync_runs"
    ADD CONSTRAINT "plaid_sync_runs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plaid_sync_runs"
    ADD CONSTRAINT "plaid_sync_runs_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plaid_sync_runs"
    ADD CONSTRAINT "plaid_sync_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_value_dependencies"
    ADD CONSTRAINT "recurring_value_dependencies_depends_on_recurring_value_id_fkey" FOREIGN KEY ("depends_on_recurring_value_id") REFERENCES "public"."recurring_values"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_value_dependencies"
    ADD CONSTRAINT "recurring_value_dependencies_recurring_value_id_fkey" FOREIGN KEY ("recurring_value_id") REFERENCES "public"."recurring_values"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_value_periods"
    ADD CONSTRAINT "recurring_value_periods_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_value_periods"
    ADD CONSTRAINT "recurring_value_periods_recurring_value_id_fkey" FOREIGN KEY ("recurring_value_id") REFERENCES "public"."recurring_values"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_values"
    ADD CONSTRAINT "recurring_values_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_values"
    ADD CONSTRAINT "recurring_values_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_values"
    ADD CONSTRAINT "recurring_values_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_split_tags"
    ADD CONSTRAINT "transaction_split_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_split_tags"
    ADD CONSTRAINT "transaction_split_tags_transaction_split_id_fkey" FOREIGN KEY ("transaction_split_id") REFERENCES "public"."transaction_splits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_splits"
    ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_tags"
    ADD CONSTRAINT "transaction_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_tags"
    ADD CONSTRAINT "transaction_tags_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can view household account balance snapshots" ON "public"."account_balance_snapshots" FOR SELECT USING (("household_id" IN ( SELECT "household_members"."household_id"
   FROM "public"."household_members"
  WHERE ("household_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."account_balance_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts_policy" ON "public"."accounts" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."amazon_order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "amazon_order_items_policy" ON "public"."amazon_order_items" FOR SELECT USING ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."amazon_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "amazon_orders_policy" ON "public"."amazon_orders" FOR SELECT USING ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."amazon_payment_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "amazon_payment_transactions_policy" ON "public"."amazon_payment_transactions" FOR SELECT USING ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."amazon_sync_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "amazon_sync_sessions_policy" ON "public"."amazon_sync_sessions" FOR SELECT USING ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."budget_transaction_group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_transaction_group_members_policy" ON "public"."budget_transaction_group_members" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."budget_transaction_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_transaction_groups_policy" ON "public"."budget_transaction_groups" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budgets_policy" ON "public"."budgets" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_policy" ON "public"."categories" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."category_balance_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "category_balance_adjustments_policy" ON "public"."category_balance_adjustments" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."category_budget_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "category_budget_periods_policy" ON "public"."category_budget_periods" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."category_layout_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "category_layout_periods_policy" ON "public"."category_layout_periods" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."credit_card_payment_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_card_payment_links_policy" ON "public"."credit_card_payment_links" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."household_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "household_invitations_delete_policy" ON "public"."household_invitations" FOR DELETE USING ("public"."is_household_owner"("household_id"));



CREATE POLICY "household_invitations_insert_policy" ON "public"."household_invitations" FOR INSERT WITH CHECK (("public"."is_household_owner"("household_id") AND ("invited_by" = "auth"."uid"())));



CREATE POLICY "household_invitations_select_policy" ON "public"."household_invitations" FOR SELECT USING (("public"."is_household_owner"("household_id") OR ("email" = "lower"(COALESCE(("auth"."jwt"() ->> 'email'::"text"), ''::"text")))));



CREATE POLICY "household_invitations_update_policy" ON "public"."household_invitations" FOR UPDATE USING ("public"."is_household_owner"("household_id")) WITH CHECK ("public"."is_household_owner"("household_id"));



ALTER TABLE "public"."household_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "household_members_delete_policy" ON "public"."household_members" FOR DELETE USING ("public"."is_household_owner"("household_id"));



CREATE POLICY "household_members_insert_policy" ON "public"."household_members" FOR INSERT WITH CHECK ("public"."is_household_owner"("household_id"));



CREATE POLICY "household_members_select_policy" ON "public"."household_members" FOR SELECT USING ("public"."is_household_member"("household_id"));



CREATE POLICY "household_members_update_policy" ON "public"."household_members" FOR UPDATE USING ("public"."is_household_owner"("household_id")) WITH CHECK ("public"."is_household_owner"("household_id"));



ALTER TABLE "public"."households" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "households_policy" ON "public"."households" USING ("public"."is_household_member"("id")) WITH CHECK (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."imported_budget_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "imported_budget_lines_policy" ON "public"."imported_budget_lines" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."plaid_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plaid_items_select_policy" ON "public"."plaid_items" FOR SELECT USING ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."plaid_sync_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plaid_sync_runs_policy" ON "public"."plaid_sync_runs" FOR SELECT USING ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."recurring_value_dependencies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_value_dependencies_policy" ON "public"."recurring_value_dependencies" USING ((EXISTS ( SELECT 1
   FROM "public"."recurring_values" "rv"
  WHERE (("rv"."id" = "recurring_value_dependencies"."recurring_value_id") AND "public"."is_household_member"("rv"."household_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."recurring_values" "rv"
  WHERE (("rv"."id" = "recurring_value_dependencies"."recurring_value_id") AND "public"."is_household_member"("rv"."household_id")))));



ALTER TABLE "public"."recurring_value_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_value_periods_policy" ON "public"."recurring_value_periods" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."recurring_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_values_policy" ON "public"."recurring_values" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tags_policy" ON "public"."tags" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."transaction_split_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_split_tags_policy" ON "public"."transaction_split_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."transaction_splits" "ts"
  WHERE (("ts"."id" = "transaction_split_tags"."transaction_split_id") AND "public"."is_household_member"("ts"."household_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."transaction_splits" "ts"
     JOIN "public"."tags" ON (("tags"."id" = "transaction_split_tags"."tag_id")))
  WHERE (("ts"."id" = "transaction_split_tags"."transaction_split_id") AND ("ts"."household_id" = "tags"."household_id") AND "public"."is_household_member"("ts"."household_id")))));



ALTER TABLE "public"."transaction_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_splits_policy" ON "public"."transaction_splits" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."transaction_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transaction_tags_policy" ON "public"."transaction_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."transactions"
  WHERE (("transactions"."id" = "transaction_tags"."transaction_id") AND "public"."is_household_member"("transactions"."household_id")))));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions_policy" ON "public"."transactions" USING ("public"."is_household_member"("household_id")) WITH CHECK ("public"."is_household_member"("household_id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_policy" ON "public"."users" USING (("auth"."uid"() = "id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




























































































































































REVOKE ALL ON FUNCTION "public"."accept_household_invitation"("invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_household_invitation"("invitation_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."seed_workbook_constants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_workbook_constants"() TO "authenticated";


















GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_balance_snapshots" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_balance_snapshots" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_balance_snapshots" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."accounts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."accounts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."accounts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_order_items" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."amazon_order_items" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."amazon_orders" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_payment_transactions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."amazon_payment_transactions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_sync_sessions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."amazon_sync_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."amazon_sync_sessions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."credit_card_payment_links" TO "anon";
GRANT ALL ON TABLE "public"."credit_card_payment_links" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_card_payment_links" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."imported_budget_lines" TO "anon";
GRANT ALL ON TABLE "public"."imported_budget_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."imported_budget_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transaction_splits" TO "anon";
GRANT ALL ON TABLE "public"."transaction_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_splits" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_actual_lines" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_actual_lines" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_actual_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_transaction_group_members" TO "anon";
GRANT ALL ON TABLE "public"."budget_transaction_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_transaction_group_members" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_transaction_groups" TO "anon";
GRANT ALL ON TABLE "public"."budget_transaction_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_transaction_groups" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budgets" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budgets" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budgets" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."categories" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."categories" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."categories" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_vs_actual" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_vs_actual" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_vs_actual" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."category_balance_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."category_balance_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."category_balance_adjustments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."category_budget_periods" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."category_budget_periods" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."category_budget_periods" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."category_layout_periods" TO "anon";
GRANT ALL ON TABLE "public"."category_layout_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."category_layout_periods" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."household_invitations" TO "anon";
GRANT ALL ON TABLE "public"."household_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."household_invitations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."household_members" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."household_members" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."household_members" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."households" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."households" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."households" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."monthly_spending_by_category" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."monthly_spending_by_category" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."monthly_spending_by_category" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plaid_items" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plaid_items" TO "authenticated";
GRANT ALL ON TABLE "public"."plaid_items" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("plaid_item_id") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("institution_id") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("institution_name") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("error_code") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("last_sync_at") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("household_id") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT SELECT("plaid_environment") ON TABLE "public"."plaid_items" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plaid_sync_runs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plaid_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."plaid_sync_runs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_value_dependencies" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_value_dependencies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_value_dependencies" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_value_periods" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_value_periods" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_value_periods" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_values" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_values" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."recurring_values" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tags" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tags" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tags" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transaction_split_tags" TO "anon";
GRANT ALL ON TABLE "public"."transaction_split_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_split_tags" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transaction_tags" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transaction_tags" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transaction_tags" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "sync_auth_user_to_public_user_trigger" AFTER INSERT OR UPDATE OF "email", "raw_user_meta_data" ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."sync_auth_user_to_public_user"();
