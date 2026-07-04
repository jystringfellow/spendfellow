import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { removePlaidItem, resolvePlaidEnvironment, PlaidApiError } from '@/lib/plaid';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';
import type { PlaidItem } from '@/types/database';

interface RouteParams {
  params: {
    itemId: string;
  };
}

type TransactionCleanupMode = 'keep' | 'delete_all' | 'delete_before';

interface AccountIdRow {
  id: string;
}

function getTransactionCleanupMode(request: NextRequest): TransactionCleanupMode {
  const cleanupMode = request.nextUrl.searchParams.get('transaction_cleanup');

  if (cleanupMode === 'keep' || cleanupMode === 'delete_all' || cleanupMode === 'delete_before') {
    return cleanupMode;
  }

  return request.nextUrl.searchParams.get('delete_transactions') === 'true' ? 'delete_all' : 'keep';
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to remove Plaid links.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before removing Plaid links.' }, { status: 400 });
  }

  const transactionCleanup = getTransactionCleanupMode(request);
  const deleteBeforeDate = request.nextUrl.searchParams.get('delete_before');

  if (transactionCleanup === 'delete_before' && !isIsoDate(deleteBeforeDate)) {
    return NextResponse.json({ error: 'delete_before must be a date in YYYY-MM-DD format.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const { data: plaidItemRow, error: plaidItemError } = await serviceSupabase
    .from('plaid_items')
    .select('*')
    .eq('id', params.itemId)
    .eq('household_id', household.id)
    .single();

  if (plaidItemError || !plaidItemRow) {
    return NextResponse.json({ error: plaidItemError?.message ?? 'Plaid item not found.' }, { status: 404 });
  }

  const plaidItem = plaidItemRow as PlaidItem;
  const plaidEnvironment = resolvePlaidEnvironment(plaidItem.plaid_environment, plaidItem.plaid_access_token);

  try {
    await removePlaidItem(plaidItem.plaid_access_token, plaidEnvironment);
  } catch (error) {
    const plaidError = error instanceof PlaidApiError ? error.plaidError : undefined;
    const message = error instanceof Error ? error.message : 'Unable to remove Plaid item.';

    return NextResponse.json(
      {
        error: plaidError?.error_code ? `${plaidError.error_code}: ${message}` : message,
        plaid_error: plaidError,
      },
      { status: 500 }
    );
  }

  if (transactionCleanup === 'delete_all') {
    const { error: accountsDeleteError } = await serviceSupabase
      .from('accounts')
      .delete()
      .eq('household_id', household.id)
      .eq('plaid_item_id', plaidItem.plaid_item_id)
      .eq('plaid_environment', plaidEnvironment);

    if (accountsDeleteError) {
      return NextResponse.json({ error: accountsDeleteError.message }, { status: 500 });
    }

    const { error: itemDeleteError } = await serviceSupabase
      .from('plaid_items')
      .delete()
      .eq('id', plaidItem.id)
      .eq('household_id', household.id);

    if (itemDeleteError) {
      return NextResponse.json({ error: itemDeleteError.message }, { status: 500 });
    }

    return NextResponse.json({ removed: true, transaction_cleanup: transactionCleanup });
  }

  if (transactionCleanup === 'delete_before') {
    const { data: accountRows, error: accountsSelectError } = await serviceSupabase
      .from('accounts')
      .select('id')
      .eq('household_id', household.id)
      .eq('plaid_item_id', plaidItem.plaid_item_id)
      .eq('plaid_environment', plaidEnvironment);

    if (accountsSelectError) {
      return NextResponse.json({ error: accountsSelectError.message }, { status: 500 });
    }

    const accountIds = ((accountRows ?? []) as AccountIdRow[]).map((account) => account.id);

    if (accountIds.length > 0) {
      const { error: transactionsDeleteError } = await serviceSupabase
        .from('transactions')
        .delete()
        .eq('household_id', household.id)
        .in('account_id', accountIds)
        .lt('date', deleteBeforeDate as string);

      if (transactionsDeleteError) {
        return NextResponse.json({ error: transactionsDeleteError.message }, { status: 500 });
      }
    }
  }

  const { error: accountsUpdateError } = await serviceSupabase
    .from('accounts')
    .update({ is_active: false })
    .eq('household_id', household.id)
    .eq('plaid_item_id', plaidItem.plaid_item_id)
    .eq('plaid_environment', plaidEnvironment);

  if (accountsUpdateError) {
    return NextResponse.json({ error: accountsUpdateError.message }, { status: 500 });
  }

  const { error: itemUpdateError } = await serviceSupabase
    .from('plaid_items')
    .update({ status: 'disconnected', error_code: null, plaid_environment: plaidEnvironment })
    .eq('id', plaidItem.id)
    .eq('household_id', household.id);

  if (itemUpdateError) {
    return NextResponse.json({ error: itemUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ removed: true, transaction_cleanup: transactionCleanup });
}
