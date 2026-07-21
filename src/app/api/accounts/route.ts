import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { normalizeLedgerText } from '@/lib/transactionLedger';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface CreateManualAccountPayload {
  name?: string;
  starting_balance_cents?: number;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as CreateManualAccountPayload;
  const name = normalizeLedgerText(payload.name, 120);
  const startingBalanceCents = payload.starting_balance_cents ?? 0;

  if (!name) {
    return NextResponse.json({ error: 'Account name is required.' }, { status: 400 });
  }

  if (!Number.isSafeInteger(startingBalanceCents)) {
    return NextResponse.json({ error: 'Enter a valid starting balance.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to create accounts.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before creating accounts.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: account, error } = await serviceSupabase
    .from('accounts')
    .insert({
      user_id: user.id,
      household_id: household.id,
      plaid_account_id: null,
      plaid_item_id: null,
      plaid_environment: null,
      name,
      official_name: null,
      type: 'depository',
      subtype: 'cash',
      current_balance_cents: startingBalanceCents,
      available_balance_cents: startingBalanceCents,
      balance_category: 'checking',
      currency_code: 'USD',
      is_active: true,
      source: 'manual',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account }, { status: 201 });
}
