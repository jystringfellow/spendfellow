import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { isIsoDate, normalizeLedgerText } from '@/lib/transactionLedger';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface RouteParams {
  params: { transactionId: string };
}

interface UpdateManualTransactionPayload {
  account_id?: string;
  category_id?: string | null;
  date?: string;
  amount_cents?: number;
  description?: string;
  notes?: string | null;
}

async function getContext() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  const household = user && !error ? await getCurrentHousehold(supabase) : null;
  return { user, household };
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const payload = (await request.json().catch(() => ({}))) as UpdateManualTransactionPayload;
  const { user, household } = await getContext();

  if (!user) return NextResponse.json({ error: 'You must be signed in to edit transactions.' }, { status: 401 });
  if (!household) return NextResponse.json({ error: 'Create a household before editing transactions.' }, { status: 400 });
  if (!payload.account_id) return NextResponse.json({ error: 'Choose an account.' }, { status: 400 });
  if (!isIsoDate(payload.date)) return NextResponse.json({ error: 'Choose a valid transaction date.' }, { status: 400 });
  if (!Number.isSafeInteger(payload.amount_cents) || payload.amount_cents === 0) {
    return NextResponse.json({ error: 'Enter a non-zero transaction amount.' }, { status: 400 });
  }

  const description = normalizeLedgerText(payload.description, 240);
  const notes = normalizeLedgerText(payload.notes, 1000);
  if (!description) return NextResponse.json({ error: 'Description is required.' }, { status: 400 });

  const serviceSupabase = createServiceSupabaseClient();
  const [transactionResult, accountResult, categoryResult] = await Promise.all([
    serviceSupabase
      .from('transactions')
      .select('id, source, amount_cents')
      .eq('id', params.transactionId)
      .eq('household_id', household.id)
      .maybeSingle(),
    serviceSupabase
      .from('accounts')
      .select('id')
      .eq('id', payload.account_id)
      .eq('household_id', household.id)
      .eq('is_active', true)
      .maybeSingle(),
    payload.category_id
      ? serviceSupabase
          .from('categories')
          .select('id')
          .eq('id', payload.category_id)
          .eq('household_id', household.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const lookupError = transactionResult.error ?? accountResult.error ?? categoryResult.error;
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!transactionResult.data || transactionResult.data.source !== 'manual') {
    return NextResponse.json({ error: 'Manual transaction not found.' }, { status: 404 });
  }
  if (!accountResult.data) return NextResponse.json({ error: 'Account not found.' }, { status: 400 });
  if (payload.category_id && !categoryResult.data) {
    return NextResponse.json({ error: 'Category not found.' }, { status: 400 });
  }

  const [linksResult, splitsResult] = await Promise.all([
    serviceSupabase
      .from('credit_card_payment_links')
      .select('id')
      .eq('household_id', household.id)
      .or(`checking_transaction_id.eq.${params.transactionId},credit_transaction_id.eq.${params.transactionId}`)
      .limit(1),
    serviceSupabase.from('transaction_splits').select('id').eq('transaction_id', params.transactionId).limit(1),
  ]);
  const dependencyError = linksResult.error ?? splitsResult.error;
  if (dependencyError) return NextResponse.json({ error: dependencyError.message }, { status: 500 });
  if ((linksResult.data ?? []).length > 0) {
    return NextResponse.json({ error: 'Unlink this payment before editing it.' }, { status: 409 });
  }
  if ((splitsResult.data ?? []).length > 0 && payload.amount_cents !== transactionResult.data.amount_cents) {
    return NextResponse.json({ error: 'Remove or update the splits before changing this amount.' }, { status: 409 });
  }

  const { data: transaction, error } = await serviceSupabase
    .from('transactions')
    .update({
      account_id: payload.account_id,
      category_id: payload.category_id || null,
      date: payload.date,
      amount_cents: payload.amount_cents,
      description,
      notes,
    })
    .eq('id', params.transactionId)
    .eq('household_id', household.id)
    .eq('source', 'manual')
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transaction });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { user, household } = await getContext();
  if (!user) return NextResponse.json({ error: 'You must be signed in to delete transactions.' }, { status: 401 });
  if (!household) return NextResponse.json({ error: 'Create a household before deleting transactions.' }, { status: 400 });

  const serviceSupabase = createServiceSupabaseClient();
  const { data: transaction, error: transactionError } = await serviceSupabase
    .from('transactions')
    .select('id, source')
    .eq('id', params.transactionId)
    .eq('household_id', household.id)
    .maybeSingle();

  if (transactionError) return NextResponse.json({ error: transactionError.message }, { status: 500 });
  if (!transaction || transaction.source !== 'manual') {
    return NextResponse.json({ error: 'Manual transaction not found.' }, { status: 404 });
  }

  const { data: links, error: linksError } = await serviceSupabase
    .from('credit_card_payment_links')
    .select('id')
    .eq('household_id', household.id)
    .or(`checking_transaction_id.eq.${params.transactionId},credit_transaction_id.eq.${params.transactionId}`)
    .limit(1);
  if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });
  if ((links ?? []).length > 0) {
    return NextResponse.json({ error: 'Unlink this payment before deleting it.' }, { status: 409 });
  }

  const { error } = await serviceSupabase
    .from('transactions')
    .delete()
    .eq('id', params.transactionId)
    .eq('household_id', household.id)
    .eq('source', 'manual');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
