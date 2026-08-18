import { NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface RouteParams {
  params: { transactionId: string };
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to include payments.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before including payments.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: exclusion, error: lookupError } = await serviceSupabase
    .from('transaction_budget_exclusions')
    .select('transaction_id')
    .eq('transaction_id', params.transactionId)
    .eq('household_id', household.id)
    .eq('reason', 'credit_card_payment')
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!exclusion) {
    return NextResponse.json({ error: 'CC payment mark not found.' }, { status: 404 });
  }

  const { error } = await serviceSupabase
    .from('transaction_budget_exclusions')
    .delete()
    .eq('transaction_id', params.transactionId)
    .eq('household_id', household.id)
    .eq('reason', 'credit_card_payment');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
