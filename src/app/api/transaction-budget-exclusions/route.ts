import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { isCreditCardPaymentTransaction } from '@/lib/transactionLedger';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface CreateExclusionPayload {
  transaction_id?: string;
  reason?: 'credit_card_payment';
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as CreateExclusionPayload;
  if (!payload.transaction_id || payload.reason !== 'credit_card_payment') {
    return NextResponse.json({ error: 'Choose a transaction and exclusion reason.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const household = user && !userError ? await getCurrentHousehold(supabase) : null;

  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to mark payments.' }, { status: 401 });
  }
  if (!household) {
    return NextResponse.json({ error: 'Create a household before marking payments.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const [{ data: transaction, error: transactionError }, { data: existingLinks, error: linksError }] =
    await Promise.all([
      serviceSupabase
        .from('transactions')
        .select('id, amount_cents, pending, accounts(type)')
        .eq('id', payload.transaction_id)
        .eq('household_id', household.id)
        .maybeSingle(),
      serviceSupabase
        .from('credit_card_payment_links')
        .select('id')
        .eq('household_id', household.id)
        .or(
          `checking_transaction_id.eq.${payload.transaction_id},credit_transaction_id.eq.${payload.transaction_id}`
        )
        .limit(1),
    ]);

  const lookupError = transactionError ?? linksError;
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
  }
  if ((existingLinks ?? []).length > 0) {
    return NextResponse.json({ error: 'This transaction is already part of a linked payment.' }, { status: 409 });
  }

  const row = transaction as unknown as {
    id: string;
    amount_cents: number;
    pending: boolean;
    accounts: { type: string } | null;
  };
  if (
    row.pending ||
    !isCreditCardPaymentTransaction({
      amountCents: row.amount_cents,
      accountType: row.accounts?.type ?? '',
    })
  ) {
    return NextResponse.json(
      { error: 'Only posted checking debits or credit-card credits can be marked as CC payments.' },
      { status: 400 }
    );
  }

  const { data: exclusion, error } = await serviceSupabase
    .from('transaction_budget_exclusions')
    .upsert(
      {
        transaction_id: row.id,
        household_id: household.id,
        reason: 'credit_card_payment',
        created_by: user.id,
      },
      { onConflict: 'transaction_id' }
    )
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ exclusion }, { status: 201 });
}
