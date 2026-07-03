import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHousehold } from '@/lib/households';
import { fetchAccounts, resolvePlaidEnvironment, PlaidApiError } from '@/lib/plaid';
import { toAccountUpsertRows } from '@/lib/plaidAccounts';
import { logPlaidSyncRun } from '@/lib/plaidSyncRuns';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';
import type { Account, PlaidItem } from '@/types/database';

interface RefreshPayload {
  account_ids?: string[];
}

interface RefreshAccountRow
  extends Pick<
    Account,
    'id' | 'name' | 'plaid_account_id' | 'plaid_item_id' | 'plaid_environment' | 'last_balance_sync_at' | 'is_active'
  > {}

interface RefreshItemDetail {
  item_id: string;
  institution_name: string | null;
  environment: PlaidItem['plaid_environment'];
  accounts_count: number;
  skipped_count: number;
}

function isMissingLastBalanceSyncColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error &&
      (error.code === 'PGRST204' || /schema cache|last_balance_sync_at/i.test(error.message ?? '')) &&
      /last_balance_sync_at/i.test(error.message ?? '')
  );
}

function getStartOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function wasRefreshedToday(lastBalanceSyncAt: string | null): boolean {
  return Boolean(lastBalanceSyncAt && new Date(lastBalanceSyncAt) >= getStartOfToday());
}

function getItemKey(plaidItemId: string | null, plaidEnvironment: Account['plaid_environment']): string {
  return `${plaidEnvironment ?? 'unknown'}:${plaidItemId ?? 'unknown'}`;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as RefreshPayload;
  const requestedAccountIds = Array.isArray(payload.account_ids)
    ? payload.account_ids.filter((accountId): accountId is string => typeof accountId === 'string' && accountId.length > 0)
    : [];

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to refresh account balances.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before refreshing account balances.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const buildAccountsQuery = (selectColumns: string) => {
    let query = serviceSupabase
      .from('accounts')
      .select(selectColumns)
      .eq('household_id', household.id)
      .eq('is_active', true)
      .not('plaid_account_id', 'is', null)
      .not('plaid_item_id', 'is', null);

    if (requestedAccountIds.length > 0) {
      query = query.in('id', requestedAccountIds);
    }

    return query;
  };

  const accountsQuery = buildAccountsQuery(
    'id, name, plaid_account_id, plaid_item_id, plaid_environment, last_balance_sync_at, is_active'
  );
  const accountsResult = await accountsQuery;
  let accountRows = (accountsResult.data ?? null) as RefreshAccountRow[] | null;
  let accountsSelectError = accountsResult.error;
  let supportsBalanceSyncTracking = true;

  if (isMissingLastBalanceSyncColumn(accountsSelectError)) {
    supportsBalanceSyncTracking = false;
    const fallbackAccountsQuery = buildAccountsQuery('id, name, plaid_account_id, plaid_item_id, plaid_environment, is_active');
    const fallbackResult = await fallbackAccountsQuery;
    accountRows =
      ((fallbackResult.data ?? []) as unknown as Omit<RefreshAccountRow, 'last_balance_sync_at'>[]).map((account) => ({
        ...account,
        last_balance_sync_at: null,
      })) ?? null;
    accountsSelectError = fallbackResult.error;
  }

  if (accountsSelectError) {
    return NextResponse.json({ error: accountsSelectError.message }, { status: 500 });
  }

  const refreshAccounts = accountRows ?? [];
  if (refreshAccounts.length === 0) {
    return NextResponse.json({ accounts_count: 0, skipped_count: 0, items: [] });
  }

  const staleAccounts = refreshAccounts.filter((account) => !wasRefreshedToday(account.last_balance_sync_at));
  const skippedAlreadyFreshCount = refreshAccounts.length - staleAccounts.length;

  if (staleAccounts.length === 0) {
    await Promise.all(
      refreshAccounts.map((account) =>
        logPlaidSyncRun(serviceSupabase, {
          householdId: household.id,
          userId: user.id,
          plaidItemId: account.plaid_item_id,
          accountId: account.id,
          plaidEnvironment: account.plaid_environment,
          syncType: 'balances',
          status: 'skipped',
          skippedCount: 1,
          metadata: { reason: 'already_refreshed_today' },
        })
      )
    );
    return NextResponse.json({ accounts_count: 0, skipped_count: skippedAlreadyFreshCount, items: [] });
  }

  const { data: plaidItems, error: itemError } = await serviceSupabase
    .from('plaid_items')
    .select('*')
    .eq('household_id', household.id)
    .eq('status', 'active');

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  if (!plaidItems?.length) {
    return NextResponse.json({ error: 'No active Plaid items found.' }, { status: 400 });
  }

  const itemByKey = new Map<string, PlaidItem>();
  ((plaidItems ?? []) as PlaidItem[]).forEach((item) => {
    const plaidEnvironment = resolvePlaidEnvironment(item.plaid_environment, item.plaid_access_token);
    itemByKey.set(getItemKey(item.plaid_item_id, plaidEnvironment), item);
  });

  const accountsByItemKey = new Map<string, RefreshAccountRow[]>();
  staleAccounts.forEach((account) => {
    const key = getItemKey(account.plaid_item_id, account.plaid_environment);
    accountsByItemKey.set(key, [...(accountsByItemKey.get(key) ?? []), account]);
  });

  const details: RefreshItemDetail[] = [];
  let accountsCount = 0;
  let skippedCount = skippedAlreadyFreshCount;
  const now = new Date().toISOString();

  try {
    for (const [itemKey, accountsForItem] of accountsByItemKey.entries()) {
      const item = itemByKey.get(itemKey);

      if (!item) {
        skippedCount += accountsForItem.length;
        await Promise.all(
          accountsForItem.map((account) =>
            logPlaidSyncRun(serviceSupabase, {
              householdId: household.id,
              userId: user.id,
              plaidItemId: account.plaid_item_id,
              accountId: account.id,
              plaidEnvironment: account.plaid_environment,
              syncType: 'balances',
              status: 'skipped',
              skippedCount: 1,
              metadata: { reason: 'no_active_plaid_item' },
            })
          )
        );
        continue;
      }

      const plaidEnvironment = resolvePlaidEnvironment(item.plaid_environment, item.plaid_access_token);
      const runStartedAt = new Date().toISOString();
      const plaidAccounts = await fetchAccounts(item.plaid_access_token, plaidEnvironment);
      const accountNameOverridesByPlaidAccountId = new Map(
        accountsForItem
          .filter((account): account is RefreshAccountRow & { plaid_account_id: string } => Boolean(account.plaid_account_id))
          .map((account) => [account.plaid_account_id, account.name])
      );
      const accountRowsToUpsert = toAccountUpsertRows({
        accountNameOverridesByPlaidAccountId,
        accounts: plaidAccounts,
        householdId: household.id,
        includeBalanceSyncAt: supportsBalanceSyncTracking,
        itemId: item.plaid_item_id,
        plaidEnvironment,
        syncedAt: now,
        userId: user.id,
      });

      if (accountRowsToUpsert.length > 0) {
        let { error: accountsError } = await serviceSupabase.from('accounts').upsert(accountRowsToUpsert, {
          onConflict: 'plaid_environment,plaid_account_id',
        });

        if (isMissingLastBalanceSyncColumn(accountsError)) {
          supportsBalanceSyncTracking = false;
          const retryRows = toAccountUpsertRows({
            accountNameOverridesByPlaidAccountId,
            accounts: plaidAccounts,
            householdId: household.id,
            includeBalanceSyncAt: false,
            itemId: item.plaid_item_id,
            plaidEnvironment,
            userId: user.id,
          });
          const retryResult = await serviceSupabase.from('accounts').upsert(retryRows, {
            onConflict: 'plaid_environment,plaid_account_id',
          });
          accountsError = retryResult.error;
        }

        if (accountsError) {
          return NextResponse.json({ error: accountsError.message }, { status: 500 });
        }
      }

      const { error: itemUpdateError } = await serviceSupabase
        .from('plaid_items')
        .update({ error_code: null, plaid_environment: plaidEnvironment })
        .eq('id', item.id);

      if (itemUpdateError) {
        return NextResponse.json({ error: itemUpdateError.message }, { status: 500 });
      }

      accountsCount += accountRowsToUpsert.length;
      await logPlaidSyncRun(serviceSupabase, {
        householdId: household.id,
        userId: user.id,
        plaidItemId: item.plaid_item_id,
        plaidEnvironment,
        syncType: 'balances',
        status: 'success',
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        requestedCount: accountsForItem.length,
        importedCount: accountRowsToUpsert.length,
        metadata: {
          institution_name: item.institution_name,
          requested_account_ids: accountsForItem.map((account) => account.id),
        },
      });
      details.push({
        item_id: item.id,
        institution_name: item.institution_name,
        environment: plaidEnvironment,
        accounts_count: accountRowsToUpsert.length,
        skipped_count: 0,
      });
    }

    return NextResponse.json({ accounts_count: accountsCount, skipped_count: skippedCount, items: details });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refresh account balances.';
    const plaidError = error instanceof PlaidApiError ? error.plaidError : undefined;
    await Promise.all(
      staleAccounts.map((account) =>
        logPlaidSyncRun(serviceSupabase, {
          householdId: household.id,
          userId: user.id,
          plaidItemId: account.plaid_item_id,
          accountId: account.id,
          plaidEnvironment: account.plaid_environment,
          syncType: 'balances',
          status: 'error',
          errorCode: plaidError?.error_code ?? null,
          errorMessage: message,
        })
      )
    );

    return NextResponse.json(
      {
        error: plaidError?.error_code ? `${plaidError.error_code}: ${message}` : message,
        plaid_error: plaidError,
      },
      { status: 500 }
    );
  }
}
