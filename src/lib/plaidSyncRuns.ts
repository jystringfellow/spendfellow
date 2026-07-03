import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account } from '@/types/database';

export interface PlaidSyncRunInput {
  householdId: string;
  userId: string;
  plaidItemId?: string | null;
  accountId?: string | null;
  plaidEnvironment?: Account['plaid_environment'];
  syncType: 'transactions' | 'balances';
  status: 'success' | 'error' | 'skipped';
  startedAt?: string;
  finishedAt?: string;
  startDate?: string | null;
  endDate?: string | null;
  requestedCount?: number;
  importedCount?: number;
  skippedCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logPlaidSyncRun(supabase: SupabaseClient, input: PlaidSyncRunInput) {
  const { error } = await supabase.from('plaid_sync_runs').insert({
    household_id: input.householdId,
    user_id: input.userId,
    plaid_item_id: input.plaidItemId ?? null,
    account_id: input.accountId ?? null,
    plaid_environment: input.plaidEnvironment ?? null,
    sync_type: input.syncType,
    status: input.status,
    started_at: input.startedAt ?? new Date().toISOString(),
    finished_at: input.finishedAt ?? new Date().toISOString(),
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    requested_count: input.requestedCount ?? 0,
    imported_count: input.importedCount ?? 0,
    skipped_count: input.skippedCount ?? 0,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error('Unable to log Plaid sync run', error);
  }
}
