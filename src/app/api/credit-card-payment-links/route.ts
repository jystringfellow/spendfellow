import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import {
  addDaysToIsoDate,
  getCreditCardPaymentRoles,
  isCreditCardPaymentTransaction,
} from '@/lib/transactionLedger';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface LinkTransactionRow {
  id: string;
  household_id: string | null;
  account_id: string;
  date: string;
  amount_cents: number;
  pending: boolean;
  merchant_name: string | null;
  description: string;
  accounts: {
    name: string;
    type: string;
  } | null;
}

interface CreateLinkPayload {
  transaction_id?: string;
  counterpart_transaction_id?: string;
}

async function getAuthenticatedHousehold() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const household = user && !userError ? await getCurrentHousehold(supabase) : null;

  return { user, household };
}

export async function GET(request: NextRequest) {
  const transactionId = request.nextUrl.searchParams.get('transactionId');
  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId is required.' }, { status: 400 });
  }

  const { user, household } = await getAuthenticatedHousehold();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to link payments.' }, { status: 401 });
  }
  if (!household) {
    return NextResponse.json({ error: 'Create a household before linking payments.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: transaction, error: transactionError } = await serviceSupabase
    .from('transactions')
    .select('id, household_id, account_id, date, amount_cents, merchant_name, description, pending, accounts(name, type)')
    .eq('id', transactionId)
    .eq('household_id', household.id)
    .maybeSingle();

  if (transactionError) {
    return NextResponse.json({ error: transactionError.message }, { status: 500 });
  }
  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
  }

  const source = transaction as unknown as LinkTransactionRow;
  const sourceType = source.accounts?.type;
  const isEligibleSource = isCreditCardPaymentTransaction({
    amountCents: source.amount_cents,
    accountType: sourceType ?? '',
    pending: source.pending,
  });
  if (!isEligibleSource) {
    return NextResponse.json({ candidates: [] });
  }

  const { data: existingLinks, error: existingLinksError } = await serviceSupabase
    .from('credit_card_payment_links')
    .select('id, checking_transaction_id, credit_transaction_id')
    .eq('household_id', household.id)
    .or(`checking_transaction_id.eq.${transactionId},credit_transaction_id.eq.${transactionId}`);

  if (existingLinksError) {
    return NextResponse.json({ error: existingLinksError.message }, { status: 500 });
  }
  if ((existingLinks ?? []).length > 0) {
    return NextResponse.json({ error: 'This transaction is already linked.' }, { status: 409 });
  }

  const expectedCounterpartType = sourceType === 'depository' ? 'credit' : 'depository';
  const { data: candidateRows, error: candidatesError } = await serviceSupabase
    .from('transactions')
    .select('id, household_id, account_id, date, amount_cents, merchant_name, description, pending, accounts(name, type)')
    .eq('household_id', household.id)
    .eq('amount_cents', -source.amount_cents)
    .eq('pending', false)
    .neq('id', source.id)
    .gte('date', addDaysToIsoDate(source.date, -14))
    .lte('date', addDaysToIsoDate(source.date, 14))
    .order('date', { ascending: false })
    .limit(50);

  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 });
  }

  const candidates = ((candidateRows ?? []) as unknown as LinkTransactionRow[]).filter(
    (candidate) => candidate.accounts?.type === expectedCounterpartType
  );
  const candidateIds = candidates.map((candidate) => candidate.id);
  const { data: candidateLinks, error: candidateLinksError } =
    candidateIds.length > 0
      ? await serviceSupabase
          .from('credit_card_payment_links')
          .select('checking_transaction_id, credit_transaction_id')
          .eq('household_id', household.id)
          .or(
            `checking_transaction_id.in.(${candidateIds.join(',')}),credit_transaction_id.in.(${candidateIds.join(',')})`
          )
      : { data: [], error: null };

  if (candidateLinksError) {
    return NextResponse.json({ error: candidateLinksError.message }, { status: 500 });
  }

  const alreadyLinkedIds = new Set(
    (candidateLinks ?? []).flatMap((link) => [link.checking_transaction_id, link.credit_transaction_id])
  );

  return NextResponse.json({
    candidates: candidates
      .filter((candidate) => !alreadyLinkedIds.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        date: candidate.date,
        amount_cents: candidate.amount_cents,
        description: candidate.description,
        merchant_name: candidate.merchant_name,
        account_name: candidate.accounts?.name ?? 'Unknown account',
      })),
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as CreateLinkPayload;
  if (!payload.transaction_id || !payload.counterpart_transaction_id) {
    return NextResponse.json({ error: 'Choose two transactions to link.' }, { status: 400 });
  }

  const { user, household } = await getAuthenticatedHousehold();
  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to link payments.' }, { status: 401 });
  }
  if (!household) {
    return NextResponse.json({ error: 'Create a household before linking payments.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: transactionRows, error: transactionsError } = await serviceSupabase
    .from('transactions')
    .select('id, household_id, amount_cents, pending, accounts(name, type)')
    .eq('household_id', household.id)
    .in('id', [payload.transaction_id, payload.counterpart_transaction_id]);

  if (transactionsError) {
    return NextResponse.json({ error: transactionsError.message }, { status: 500 });
  }
  if ((transactionRows ?? []).length !== 2) {
    return NextResponse.json({ error: 'One or both transactions were not found.' }, { status: 404 });
  }

  const rows = transactionRows as unknown as Array<{
    id: string;
    amount_cents: number;
    pending: boolean;
    accounts: { type: string } | null;
  }>;
  const roles = getCreditCardPaymentRoles(
    {
      id: rows[0].id,
      amountCents: rows[0].amount_cents,
      accountType: rows[0].accounts?.type ?? '',
      pending: rows[0].pending,
    },
    {
      id: rows[1].id,
      amountCents: rows[1].amount_cents,
      accountType: rows[1].accounts?.type ?? '',
      pending: rows[1].pending,
    }
  );

  if (!roles) {
    return NextResponse.json(
      { error: 'Payments must link equal-and-opposite checking and credit-card transactions.' },
      { status: 400 }
    );
  }

  const { data: link, error } = await serviceSupabase
    .from('credit_card_payment_links')
    .insert({
      household_id: household.id,
      checking_transaction_id: roles.checkingTransactionId,
      credit_transaction_id: roles.creditTransactionId,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    const message = error.code === '23505' ? 'One of these transactions is already linked.' : error.message;
    return NextResponse.json({ error: message }, { status: error.code === '23505' ? 409 : 500 });
  }

  return NextResponse.json({ link }, { status: 201 });
}
