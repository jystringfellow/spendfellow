import { NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface RouteParams {
  params: {
    memberUserId: string;
  };
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to remove a household member.' }, { status: 401 });
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
    return NextResponse.json({ error: 'Only a household owner can remove members.' }, { status: 403 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: targetMembership, error: targetError } = await serviceSupabase
    .from('household_members')
    .select('role')
    .eq('household_id', household.id)
    .eq('user_id', params.memberUserId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  if (!targetMembership) {
    return NextResponse.json({ error: 'Household member not found.' }, { status: 404 });
  }

  if (targetMembership.role === 'owner') {
    return NextResponse.json({ error: 'The household owner cannot be removed.' }, { status: 400 });
  }

  const { error: deleteError } = await serviceSupabase
    .from('household_members')
    .delete()
    .eq('household_id', household.id)
    .eq('user_id', params.memberUserId)
    .eq('role', 'member');

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ removed: true });
}
