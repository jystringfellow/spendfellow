import { dollarsToCents } from './money';
import type { PlaidEnvironment } from './plaid';

interface PlaidAccountBalance {
  current?: number | null;
  available?: number | null;
  iso_currency_code?: string | null;
}

interface PlaidAccountLike {
  account_id: string;
  name: string;
  official_name?: string | null;
  type: string;
  subtype?: string | null;
  balances: PlaidAccountBalance;
}

function optionalDollarsToCents(value: number | null | undefined): number | null {
  return typeof value === 'number' ? dollarsToCents(value) : null;
}

export function toAccountUpsertRows({
  accounts,
  accountNameOverridesByPlaidAccountId,
  householdId,
  includeBalanceSyncAt = true,
  itemId,
  plaidEnvironment,
  userId,
  syncedAt,
}: {
  accounts: PlaidAccountLike[];
  accountNameOverridesByPlaidAccountId?: Map<string, string>;
  householdId: string;
  includeBalanceSyncAt?: boolean;
  itemId: string;
  plaidEnvironment: PlaidEnvironment;
  userId: string;
  syncedAt?: string;
}) {
  return accounts.map((account) => {
    const row = {
      user_id: userId,
      household_id: householdId,
      plaid_account_id: account.account_id,
      plaid_item_id: itemId,
      plaid_environment: plaidEnvironment,
      name: accountNameOverridesByPlaidAccountId?.get(account.account_id) ?? account.name,
      official_name: account.official_name ?? null,
      type: account.type,
      subtype: account.subtype ?? null,
      current_balance_cents: optionalDollarsToCents(account.balances.current),
      available_balance_cents: optionalDollarsToCents(account.balances.available),
      currency_code: account.balances.iso_currency_code ?? 'USD',
      is_active: true,
    };

    return includeBalanceSyncAt ? { ...row, last_balance_sync_at: syncedAt ?? null } : row;
  });
}
