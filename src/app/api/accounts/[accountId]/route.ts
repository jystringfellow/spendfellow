import { NextRequest, NextResponse } from 'next/server';
import { isAccountBalanceCategory } from '@/lib/accountBalanceCategories';
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
  balance_category?: string | null;
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
  const updates: { name?: string; balance_category?: UpdateAccountPayload['balance_category']; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if ('name' in payload) {
    const name = normalizeAccountName(payload.name);

    if (!name) {
      return NextResponse.json({ error: 'Account name is required.' }, { status: 400 });
    }

    updates.name = name;
  }

  if ('balance_category' in payload) {
    if (payload.balance_category !== null && !isAccountBalanceCategory(payload.balance_category)) {
      return NextResponse.json({ error: 'Choose a valid balance category.' }, { status: 400 });
    }

    updates.balance_category = payload.balance_category;
  }

  if (!updates.name && !('balance_category' in updates)) {
    return NextResponse.json({ error: 'No account updates provided.' }, { status: 400 });
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
    .update(updates)
    .eq('id', params.accountId)
    .eq('household_id', household.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ account: { id: params.accountId, ...updates } });
}
