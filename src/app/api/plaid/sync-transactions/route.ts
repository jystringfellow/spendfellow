import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceSupabaseClient } from '@/lib/supabaseService';
import { isSpendingAccountType } from '@/lib/accountTypes';
import { getCurrentHousehold } from '@/lib/households';
import { dollarsToCents } from '@/lib/money';
import { fetchTransactions, resolvePlaidEnvironment, PlaidApiError } from '@/lib/plaid';
import { logPlaidSyncRun } from '@/lib/plaidSyncRuns';
import {
  getPendingAwareStartDate,
  getPlaidPendingTransitions,
  getRemovedPendingTransactionIds,
} from '@/lib/plaidTransactionReconciliation';
import type { Account, PlaidItem } from '@/types/database';

interface AccountLookup {
  id: string;
  plaid_account_id: string | null;
  plaid_item_id: string | null;
  plaid_environment: Account['plaid_environment'];
  type: string;
}

interface ExistingTransactionEdits {
  plaid_transaction_id: string | null;
  category_id: string | null;
  notes: string | null;
}

interface ExistingPendingTransaction {
  id: string;
  date: string;
  plaid_transaction_id: string | null;
}

interface SyncItemDetail {
  item_id: string;
  institution_name: string | null;
  environment: Account['plaid_environment'];
  start_date: string;
  end_date: string;
  plaid_transaction_count: number;
  imported_count: number;
  skipped_count: number;
  spending_account_count: number;
  balance_only_account_count: number;
  note: string | null;
}

interface SyncPayload {
  mode?: 'latest' | 'last_30_days' | 'custom';
  start_date?: string;
  account_ids?: string[];
  item_ids?: string[];
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getSyncStartDate(lastSyncAt: string | null, payload: SyncPayload): string {
  if (payload.mode === 'custom' && isIsoDate(payload.start_date)) {
    return payload.start_date;
  }

  if (payload.mode === 'last_30_days' || !lastSyncAt) {
    return toIsoDate(addDays(new Date(), -30));
  }

  // Re-sync a small overlap because pending transactions and late postings can
  // change after the first import.
  return toIsoDate(addDays(new Date(lastSyncAt), -3));
}

function getAccountLookupKey(plaidEnvironment: Account['plaid_environment'], plaidAccountId: string): string {
  return `${plaidEnvironment ?? 'unknown'}:${plaidAccountId}`;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as SyncPayload;
  const requestedAccountIds = Array.isArray(payload.account_ids)
    ? payload.account_ids.filter((accountId): accountId is string => typeof accountId === 'string' && accountId.length > 0)
    : [];
  const requestedItemIds = Array.isArray(payload.item_ids)
    ? payload.item_ids.filter((itemId): itemId is string => typeof itemId === 'string' && itemId.length > 0)
    : [];

  if (payload.mode === 'custom' && !isIsoDate(payload.start_date)) {
    return NextResponse.json({ error: 'start_date must be a date in YYYY-MM-DD format.' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'You must be signed in to sync transactions.' }, { status: 401 });
  }

  const household = await getCurrentHousehold(supabase);
  if (!household) {
    return NextResponse.json({ error: 'Create a household before syncing transactions.' }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
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

  const { data: accountRows, error: accountsError } = await serviceSupabase
    .from('accounts')
    .select('id, plaid_account_id, plaid_item_id, plaid_environment, type')
    .eq('household_id', household.id);

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  const allAccounts = (accountRows ?? []) as AccountLookup[];
  const selectedAccountIdSet = requestedAccountIds.length > 0 ? new Set(requestedAccountIds) : null;
  const selectedItemIdSet = requestedItemIds.length > 0 ? new Set(requestedItemIds) : null;
  const selectedPlaidItemIdSet = new Set(
    ((plaidItems ?? []) as PlaidItem[])
      .filter((item) => selectedItemIdSet?.has(item.id))
      .map((item) => item.plaid_item_id)
  );
  const eligibleAccounts = allAccounts.filter((account) => {
    if (selectedAccountIdSet && !selectedAccountIdSet.has(account.id)) {
      return false;
    }

    if (selectedItemIdSet && (!account.plaid_item_id || !selectedPlaidItemIdSet.has(account.plaid_item_id))) {
      return false;
    }

    return isSpendingAccountType(account.type);
  });
  const accountByPlaidId = new Map(
    eligibleAccounts
      .filter((account) => account.plaid_account_id)
      .map((account) => [getAccountLookupKey(account.plaid_environment, account.plaid_account_id as string), account])
  );
  const selectedPlaidAccountIds = new Set(eligibleAccounts.map((account) => account.plaid_account_id).filter(Boolean));
  const scopedPlaidItems = ((plaidItems ?? []) as PlaidItem[]).filter((item) => {
    if (selectedItemIdSet && !selectedItemIdSet.has(item.id)) {
      return false;
    }

    if (selectedAccountIdSet && !eligibleAccounts.some((account) => account.plaid_item_id === item.plaid_item_id)) {
      return false;
    }

    return true;
  });

  if (scopedPlaidItems.length === 0) {
    return NextResponse.json({
      imported_count: 0,
      skipped_count: 0,
      items: [],
      message: 'No active spending accounts matched this sync request.',
    });
  }

  let importedCount = 0;
  let skippedCount = 0;
  const itemDetails: SyncItemDetail[] = [];
  const now = new Date().toISOString();

  try {
    for (const item of scopedPlaidItems) {
      const plaidEnvironment = resolvePlaidEnvironment(item.plaid_environment, item.plaid_access_token);
      const itemAccounts = allAccounts.filter(
        (account) => (account.plaid_environment === plaidEnvironment || account.plaid_environment === null) && account.plaid_account_id
      );
      const eligibleItemAccountIds = eligibleAccounts
        .filter((account) => account.plaid_item_id === item.plaid_item_id)
        .map((account) => account.id);
      const { data: existingPendingRows, error: existingPendingError } =
        eligibleItemAccountIds.length > 0
          ? await serviceSupabase
              .from('transactions')
              .select('id, date, plaid_transaction_id')
              .eq('household_id', household.id)
              .eq('plaid_environment', plaidEnvironment)
              .eq('pending', true)
              .in('account_id', eligibleItemAccountIds)
          : { data: [], error: null };

      if (existingPendingError) {
        return NextResponse.json({ error: existingPendingError.message }, { status: 500 });
      }

      const pendingTransactions = (existingPendingRows ?? []) as ExistingPendingTransaction[];
      const startDate = getPendingAwareStartDate(
        getSyncStartDate(item.last_sync_at, payload),
        pendingTransactions.map((transaction) => transaction.date)
      );
      const endDate = toIsoDate(new Date());
      const runStartedAt = new Date().toISOString();
      const plaidTransactions = await fetchTransactions(
        item.plaid_access_token,
        startDate,
        endDate,
        plaidEnvironment
      );
      const spendingAccountCount = itemAccounts.filter((account) => isSpendingAccountType(account.type)).length;
      const balanceOnlyAccountCount = itemAccounts.length - spendingAccountCount;

      const transactionRows = plaidTransactions
        .map((transaction) => {
          if (selectedPlaidAccountIds.size > 0 && !selectedPlaidAccountIds.has(transaction.account_id)) {
            return null;
          }

          const account =
            accountByPlaidId.get(getAccountLookupKey(plaidEnvironment, transaction.account_id)) ??
            accountByPlaidId.get(getAccountLookupKey(null, transaction.account_id));

          if (!account || !isSpendingAccountType(account.type)) {
            return null;
          }

          return {
            user_id: user.id,
            household_id: household.id,
            account_id: account.id,
            category_id: null,
            plaid_transaction_id: transaction.transaction_id,
            plaid_environment: plaidEnvironment,
            date: transaction.date,
            amount_cents: dollarsToCents(transaction.amount),
            merchant_name: transaction.merchant_name ?? null,
            description: transaction.name,
            pending: transaction.pending,
            notes: null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      const itemSkippedCount = plaidTransactions.length - transactionRows.length;

      if (transactionRows.length > 0) {
        const transactionIds = transactionRows.map((transaction) => transaction.plaid_transaction_id);
        const { data: existingTransactions, error: existingTransactionsError } = await serviceSupabase
          .from('transactions')
          .select('plaid_transaction_id, category_id, notes')
          .eq('plaid_environment', plaidEnvironment)
          .in('plaid_transaction_id', transactionIds);

        if (existingTransactionsError) {
          return NextResponse.json({ error: existingTransactionsError.message }, { status: 500 });
        }

        const editsByPlaidId = new Map(
          ((existingTransactions ?? []) as ExistingTransactionEdits[])
            .filter((transaction) => transaction.plaid_transaction_id)
            .map((transaction) => [transaction.plaid_transaction_id as string, transaction])
        );
        const rowsPreservingUserEdits = transactionRows.map((transaction) => {
          const existing = editsByPlaidId.get(transaction.plaid_transaction_id);

          return {
            ...transaction,
            category_id: existing?.category_id ?? transaction.category_id,
            notes: existing?.notes ?? transaction.notes,
          };
        });

        const { error: transactionsError } = await serviceSupabase.from('transactions').upsert(rowsPreservingUserEdits, {
          onConflict: 'plaid_environment,plaid_transaction_id',
        });

        if (transactionsError) {
          return NextResponse.json({ error: transactionsError.message }, { status: 500 });
        }

        const importedPlaidTransactionIds = new Set(transactionIds);
        const pendingTransitions = getPlaidPendingTransitions(plaidTransactions).filter((transition) =>
          importedPlaidTransactionIds.has(transition.postedTransactionId)
        );

        for (const transition of pendingTransitions) {
          const { error: reconciliationError } = await serviceSupabase.rpc('reconcile_plaid_pending_transaction', {
            target_plaid_environment: plaidEnvironment,
            target_pending_transaction_id: transition.pendingTransactionId,
            target_posted_transaction_id: transition.postedTransactionId,
          });

          if (reconciliationError) {
            return NextResponse.json({ error: reconciliationError.message }, { status: 500 });
          }
        }
      }

      const currentPlaidTransactionIds = new Set(
        transactionRows.map((transaction) => transaction.plaid_transaction_id)
      );
      const removedPendingTransactionIds = getRemovedPendingTransactionIds(
        pendingTransactions,
        currentPlaidTransactionIds
      );

      if (removedPendingTransactionIds.length > 0) {
        const { error: removedPendingError } = await serviceSupabase
          .from('transactions')
          .delete()
          .eq('household_id', household.id)
          .eq('pending', true)
          .in('id', removedPendingTransactionIds);

        if (removedPendingError) {
          return NextResponse.json({ error: removedPendingError.message }, { status: 500 });
        }
      }

      importedCount += transactionRows.length;
      skippedCount += itemSkippedCount;
      itemDetails.push({
        item_id: item.id,
        institution_name: item.institution_name,
        environment: plaidEnvironment,
        start_date: startDate,
        end_date: endDate,
        plaid_transaction_count: plaidTransactions.length,
        imported_count: transactionRows.length,
        skipped_count: itemSkippedCount,
        spending_account_count: spendingAccountCount,
        balance_only_account_count: balanceOnlyAccountCount,
        note:
          plaidTransactions.length === 0 && spendingAccountCount === 0 && balanceOnlyAccountCount > 0
            ? 'This item only has balance-only accounts. Transaction sync is for depository and credit accounts.'
            : null,
      });
      await logPlaidSyncRun(serviceSupabase, {
        householdId: household.id,
        userId: user.id,
        plaidItemId: item.plaid_item_id,
        plaidEnvironment,
        syncType: 'transactions',
        status: 'success',
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        startDate,
        endDate,
        requestedCount: plaidTransactions.length,
        importedCount: transactionRows.length,
        skippedCount: itemSkippedCount,
        metadata: {
          institution_name: item.institution_name,
          mode: payload.mode ?? 'latest',
          account_ids: requestedAccountIds,
          item_ids: requestedItemIds,
          spending_account_count: spendingAccountCount,
          balance_only_account_count: balanceOnlyAccountCount,
        },
      });
      await Promise.all(
        eligibleAccounts
          .filter((account) => account.plaid_item_id === item.plaid_item_id)
          .map((account) =>
            logPlaidSyncRun(serviceSupabase, {
              householdId: household.id,
              userId: user.id,
              plaidItemId: item.plaid_item_id,
              accountId: account.id,
              plaidEnvironment,
              syncType: 'transactions',
              status: 'success',
              startedAt: runStartedAt,
              finishedAt: new Date().toISOString(),
              startDate,
              endDate,
              requestedCount: plaidTransactions.filter((transaction) => transaction.account_id === account.plaid_account_id)
                .length,
              importedCount: transactionRows.filter((transaction) => transaction.account_id === account.id).length,
              skippedCount:
                plaidTransactions.filter((transaction) => transaction.account_id === account.plaid_account_id).length -
                transactionRows.filter((transaction) => transaction.account_id === account.id).length,
              metadata: {
                institution_name: item.institution_name,
                mode: payload.mode ?? 'latest',
              },
            })
          )
      );

      const { error: updateItemError } = await serviceSupabase
        .from('plaid_items')
        .update({ last_sync_at: now, error_code: null, plaid_environment: plaidEnvironment })
        .eq('id', item.id);

      if (updateItemError) {
        return NextResponse.json({ error: updateItemError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ imported_count: importedCount, skipped_count: skippedCount, items: itemDetails });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync transactions.';
    const plaidError = error instanceof PlaidApiError ? error.plaidError : undefined;
    await Promise.all(
      scopedPlaidItems.map((item) =>
        logPlaidSyncRun(serviceSupabase, {
          householdId: household.id,
          userId: user.id,
          plaidItemId: item.plaid_item_id,
          plaidEnvironment: item.plaid_environment,
          syncType: 'transactions',
          status: 'error',
          errorCode: plaidError?.error_code ?? null,
          errorMessage: message,
          metadata: {
            institution_name: item.institution_name,
            mode: payload.mode ?? 'latest',
            account_ids: requestedAccountIds,
            item_ids: requestedItemIds,
          },
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
