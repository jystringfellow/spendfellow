import type { Account } from '@/types/database';

export function isSpendingAccountType(type: string | null | undefined): boolean {
  return type === 'depository' || type === 'credit';
}

export function getAccountTransactionRole(account: Pick<Account, 'type'>): 'spending' | 'balance_only' {
  return isSpendingAccountType(account.type) ? 'spending' : 'balance_only';
}
