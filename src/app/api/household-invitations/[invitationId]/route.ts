import { NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface RouteParams {
  params: {
    invitationId: string;
  };
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to revoke an invitation.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Household not found.' }, { status: 404 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', household.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== 'owner') {
    return NextResponse.json({ error: 'Only a household owner can revoke invitations.' }, { status: 403 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data, error } = await serviceSupabase
    .from('household_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', params.invitationId)
    .eq('household_id', household.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Pending invitation not found.' }, { status: 404 });
  }

  return NextResponse.json({ revoked: true });
}
