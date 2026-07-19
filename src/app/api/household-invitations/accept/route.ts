import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

interface AcceptPayload {
  invitationId?: unknown;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json({ error: 'You must be signed in to accept an invitation.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as AcceptPayload;
  const invitationId = typeof payload.invitationId === 'string' ? payload.invitationId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
    return NextResponse.json({ error: 'Choose a valid household invitation.' }, { status: 400 });
  }

  const { data: householdId, error } = await supabase.rpc('accept_household_invitation', {
    invitation_id: invitationId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ householdId });
}
