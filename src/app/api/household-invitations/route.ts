import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import {
  findPendingHouseholdInvitation,
  getApplicationOrigin,
  normalizeInvitationEmail,
} from '@/lib/householdInvitations';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';
import type { HouseholdInvitation, HouseholdMember, User } from '@/types/database';

interface InvitePayload {
  email?: unknown;
}

interface MemberResponse extends HouseholdMember {
  email: string;
  full_name: string | null;
}

async function getSignedInUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { supabase, user: error ? null : user };
}

export async function GET() {
  const { supabase, user } = await getSignedInUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const household = await getCurrentHousehold(supabase);
  const incomingInvitation = await findPendingHouseholdInvitation(user.email, null, serviceSupabase);

  if (!household) {
    return NextResponse.json({
      household: null,
      members: [],
      invitations: [],
      incomingInvitations: incomingInvitation ? [incomingInvitation] : [],
    });
  }

  const { data: currentMembership, error: membershipError } = await serviceSupabase
    .from('household_members')
    .select('*')
    .eq('household_id', household.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || !currentMembership) {
    return NextResponse.json({ error: membershipError?.message ?? 'Household membership was not found.' }, { status: 500 });
  }

  const { data: memberData, error: membersError } = await serviceSupabase
    .from('household_members')
    .select('*')
    .eq('household_id', household.id)
    .order('created_at', { ascending: true });

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const memberRows = (memberData ?? []) as HouseholdMember[];
  const memberIds = memberRows.map((member) => member.user_id);
  const { data: profileData, error: profilesError } = memberIds.length
    ? await serviceSupabase.from('users').select('*').in('id', memberIds)
    : { data: [], error: null };

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const profiles = new Map(((profileData ?? []) as User[]).map((profile) => [profile.id, profile]));
  const members: MemberResponse[] = memberRows.map((member) => ({
    ...member,
    email: profiles.get(member.user_id)?.email ?? 'Unknown email',
    full_name: profiles.get(member.user_id)?.full_name ?? null,
  }));

  let invitations: HouseholdInvitation[] = [];
  if (currentMembership.role === 'owner') {
    const { data: invitationData, error: invitationsError } = await serviceSupabase
      .from('household_invitations')
      .select('*')
      .eq('household_id', household.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (invitationsError) {
      return NextResponse.json({ error: invitationsError.message }, { status: 500 });
    }

    invitations = (invitationData ?? []) as HouseholdInvitation[];
  }

  return NextResponse.json({
    household: { ...household, role: currentMembership.role },
    members,
    invitations,
    incomingInvitations: incomingInvitation ? [incomingInvitation] : [],
  });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getSignedInUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'You must be signed in to invite a household member.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before inviting members.' }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', household.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== 'owner') {
    return NextResponse.json({ error: 'Only a household owner can send invitations.' }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as InvitePayload;
  const email = normalizeInvitationEmail(payload.email);
  if (!email) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (email === user.email.toLowerCase()) {
    return NextResponse.json({ error: 'You already belong to this household.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: profileData, error: profileError } = await serviceSupabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  let existingProfile = profileData as { id: string } | null;

  if (existingProfile) {
    const { data: existingMemberships, error: existingMemberError } = await serviceSupabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', existingProfile.id);

    if (existingMemberError) {
      return NextResponse.json({ error: existingMemberError.message }, { status: 500 });
    }

    if (existingMemberships?.some((existingMembership) => existingMembership.household_id === household.id)) {
      return NextResponse.json({ error: 'That person is already a household member.' }, { status: 409 });
    }

    if (existingMemberships && existingMemberships.length > 0) {
      return NextResponse.json({ error: 'That account already belongs to another household.' }, { status: 409 });
    }

    const { data: authUserData, error: authUserError } = await serviceSupabase.auth.admin.getUserById(existingProfile.id);
    const authUserIsMissing =
      !authUserData.user &&
      (authUserError?.status === 404 || authUserError?.code === 'user_not_found' || /not found/i.test(authUserError?.message ?? ''));

    if (authUserError && !authUserIsMissing) {
      return NextResponse.json({ error: `Unable to verify the invited account: ${authUserError.message}` }, { status: 500 });
    }

    if (authUserIsMissing) {
      // Preserve any historical rows owned by this profile while freeing the real
      // email address for the replacement Auth user created by the new invite.
      const archivedEmail = `removed-${existingProfile.id}@users.invalid`;
      const { error: archiveError } = await serviceSupabase
        .from('users')
        .update({ email: archivedEmail, updated_at: new Date().toISOString() })
        .eq('id', existingProfile.id)
        .eq('email', email);

      if (archiveError) {
        return NextResponse.json({ error: `Unable to reset the deleted account: ${archiveError.message}` }, { status: 500 });
      }

      existingProfile = null;
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingInvitation, error: existingInvitationError } = await serviceSupabase
    .from('household_invitations')
    .select('*')
    .eq('household_id', household.id)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingInvitationError) {
    return NextResponse.json({ error: existingInvitationError.message }, { status: 500 });
  }

  let invitation: HouseholdInvitation;
  if (existingInvitation) {
    const { data, error } = await serviceSupabase
      .from('household_invitations')
      .update({ invited_by: user.id, expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', existingInvitation.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    invitation = data as HouseholdInvitation;
  } else {
    const { data, error } = await serviceSupabase
      .from('household_invitations')
      .insert({ household_id: household.id, email, invited_by: user.id, expires_at: expiresAt })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    invitation = data as HouseholdInvitation;
  }

  const origin = getApplicationOrigin(request.nextUrl.origin);
  const redirectTo = `${origin}/auth/set-password?invitation=${encodeURIComponent(invitation.id)}`;

  if (existingProfile) {
    const { error: magicLinkError } = await serviceSupabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });

    if (magicLinkError) {
      return NextResponse.json(
        {
          invitation,
          delivery: 'failed',
          error: `The invitation was saved, but Supabase could not send the sign-in email: ${magicLinkError.message}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      invitation,
      delivery: 'magic_link',
      message: `A household sign-in link was sent to ${email}.`,
    });
  }

  const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (inviteError) {
    return NextResponse.json(
      {
        invitation,
        delivery: 'failed',
        error: `The invitation was saved, but Supabase could not send the email: ${inviteError.message}`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    invitation,
    delivery: 'email',
    message: `Invitation sent to ${email}.`,
  });
}
