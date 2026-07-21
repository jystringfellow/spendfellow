import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { isIsoDate, normalizeLedgerText } from '@/lib/transactionLedger';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface CreateManualTransactionPayload {
  account_id?: string;
  category_id?: string | null;
  date?: string;
  amount_cents?: number;
  description?: string;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as CreateManualTransactionPayload;
  const description = normalizeLedgerText(payload.description, 240);
  const notes = normalizeLedgerText(payload.notes, 1000);

  if (!payload.account_id) {
    return NextResponse.json({ error: 'Choose an account.' }, { status: 400 });
  }

  if (!isIsoDate(payload.date)) {
    return NextResponse.json({ error: 'Choose a valid transaction date.' }, { status: 400 });
  }

  if (!Number.isSafeInteger(payload.amount_cents) || payload.amount_cents === 0) {
    return NextResponse.json({ error: 'Enter a non-zero transaction amount.' }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to add transactions.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before adding transactions.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const [{ data: account, error: accountError }, { data: category, error: categoryError }] = await Promise.all([
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

  if (accountError || categoryError) {
    return NextResponse.json({ error: accountError?.message ?? categoryError?.message }, { status: 500 });
  }

  if (!account) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 400 });
  }

  if (payload.category_id && !category) {
    return NextResponse.json({ error: 'Category not found.' }, { status: 400 });
  }

  const { data: transaction, error } = await serviceSupabase
    .from('transactions')
    .insert({
      user_id: user.id,
      household_id: household.id,
      account_id: payload.account_id,
      category_id: payload.category_id || null,
      plaid_transaction_id: null,
      plaid_environment: null,
      source: 'manual',
      date: payload.date,
      amount_cents: payload.amount_cents,
      merchant_name: null,
      description,
      pending: false,
      notes,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transaction }, { status: 201 });
}
