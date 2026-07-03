import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getCurrentHousehold } from '@/lib/households';
import { exchangePublicToken, fetchAccounts, getConfiguredPlaidEnvironment, parsePlaidEnvironment, PlaidApiError } from '@/lib/plaid';
import { toAccountUpsertRows } from '@/lib/plaidAccounts';
import { createServiceSupabaseClient } from '@/lib/supabaseService';

interface ExchangePayload {
  public_token?: string;
  environment?: string;
  institution?: {
    institution_id?: string;
    name?: string;
  } | null;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as ExchangePayload;

  if (!payload.public_token) {
    return NextResponse.json({ error: 'Missing Plaid public token.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to connect accounts.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before connecting Plaid accounts.' }, { status: 400 });
  }

  try {
    const plaidEnvironment = payload.environment
      ? parsePlaidEnvironment(payload.environment)
      : getConfiguredPlaidEnvironment();

    if (!plaidEnvironment) {
      return NextResponse.json({ error: 'Plaid environment must be sandbox, development, or production.' }, { status: 400 });
    }

    const { accessToken, itemId } = await exchangePublicToken(payload.public_token, plaidEnvironment);
    const plaidAccounts = await fetchAccounts(accessToken, plaidEnvironment);
    const serviceSupabase = createServiceSupabaseClient();
    const now = new Date().toISOString();

    const { error: itemError } = await serviceSupabase.from('plaid_items').upsert(
      {
        user_id: user.id,
        household_id: household.id,
        plaid_item_id: itemId,
        plaid_access_token: accessToken,
        plaid_environment: plaidEnvironment,
        institution_id: payload.institution?.institution_id ?? null,
        institution_name: payload.institution?.name ?? null,
        status: 'active',
        error_code: null,
      },
      { onConflict: 'plaid_item_id' }
    );

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    const accountRows = toAccountUpsertRows({
      accounts: plaidAccounts,
      householdId: household.id,
      itemId,
      plaidEnvironment,
      syncedAt: now,
      userId: user.id,
    });

    const { error: accountsError } = await serviceSupabase.from('accounts').upsert(accountRows, {
      onConflict: 'plaid_environment,plaid_account_id',
    });

    if (accountsError) {
      return NextResponse.json({ error: accountsError.message }, { status: 500 });
    }

    return NextResponse.json({ item_id: itemId, accounts_count: accountRows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to exchange Plaid token.';
    const plaidError = error instanceof PlaidApiError ? error.plaidError : undefined;

    return NextResponse.json(
      {
        error: plaidError?.error_code ? `${plaidError.error_code}: ${message}` : message,
        plaid_error: plaidError,
      },
      { status: 500 }
    );
  }
}
