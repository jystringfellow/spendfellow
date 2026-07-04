import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface RouteParams {
  params: {
    accountId: string;
  };
}

interface UpdateAccountPayload {
  name?: string;
}

function normalizeAccountName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const payload = (await request.json().catch(() => ({}))) as UpdateAccountPayload;
  const name = normalizeAccountName(payload.name);

  if (!name) {
    return NextResponse.json({ error: 'Account name is required.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to edit accounts.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before editing accounts.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: account, error: accountError } = await serviceSupabase
    .from('accounts')
    .select('id, household_id')
    .eq('id', params.accountId)
    .maybeSingle();

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 });
  }

  if (!account || account.household_id !== household.id) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const { error: updateError } = await serviceSupabase
    .from('accounts')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', params.accountId)
    .eq('household_id', household.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ account: { id: params.accountId, name } });
}
