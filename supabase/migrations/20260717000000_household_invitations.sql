-- Secure, email-bound household invitations and automatic public user profiles.

CREATE TABLE household_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email = LOWER(BTRIM(email))),
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role = 'member'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX household_invitations_pending_email_key
  ON household_invitations (household_id, email)
  WHERE status = 'pending';

CREATE INDEX household_invitations_email_status_idx
  ON household_invitations (email, status, expires_at DESC);

ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY household_invitations_select_policy ON household_invitations
  FOR SELECT USING (
    is_household_owner(household_id)
    OR email = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  );

CREATE POLICY household_invitations_insert_policy ON household_invitations
  FOR INSERT WITH CHECK (
    is_household_owner(household_id)
    AND invited_by = auth.uid()
  );

CREATE POLICY household_invitations_update_policy ON household_invitations
  FOR UPDATE USING (is_household_owner(household_id))
  WITH CHECK (is_household_owner(household_id));

CREATE POLICY household_invitations_delete_policy ON household_invitations
  FOR DELETE USING (is_household_owner(household_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON household_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON household_invitations TO service_role;

-- Keep the app's public user record synchronized with Supabase Auth. Invitations
-- create auth.users rows before the recipient accepts the email.
CREATE OR REPLACE FUNCTION sync_auth_user_to_public_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS sync_auth_user_to_public_user_trigger ON auth.users;
CREATE TRIGGER sync_auth_user_to_public_user_trigger
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_auth_user_to_public_user();

INSERT INTO users (id, email, full_name)
SELECT
  id,
  LOWER(email),
  COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, users.full_name),
      updated_at = NOW();

-- The previous policy allowed a user to add themselves to any household whose
-- UUID they knew. Owners are now the only clients allowed to manage membership;
-- invitation acceptance below is the sole self-service entry point.
DROP POLICY IF EXISTS household_members_policy ON household_members;
DROP POLICY IF EXISTS household_members_select_policy ON household_members;
DROP POLICY IF EXISTS household_members_insert_policy ON household_members;
DROP POLICY IF EXISTS household_members_update_policy ON household_members;
DROP POLICY IF EXISTS household_members_delete_policy ON household_members;

CREATE POLICY household_members_select_policy ON household_members
  FOR SELECT USING (is_household_member(household_id));

CREATE POLICY household_members_insert_policy ON household_members
  FOR INSERT WITH CHECK (is_household_owner(household_id));

CREATE POLICY household_members_update_policy ON household_members
  FOR UPDATE USING (is_household_owner(household_id))
  WITH CHECK (is_household_owner(household_id));

CREATE POLICY household_members_delete_policy ON household_members
  FOR DELETE USING (is_household_owner(household_id));

CREATE OR REPLACE FUNCTION accept_household_invitation(invitation_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION accept_household_invitation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_household_invitation(UUID) TO authenticated;
