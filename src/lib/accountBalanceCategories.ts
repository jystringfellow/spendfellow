import type { Account } from '@/types/database';

export type AccountBalanceCategory = 'checking' | 'savings' | 'ccDebt' | 'investments' | 'hidden';

export const ACCOUNT_BALANCE_CATEGORY_OPTIONS: { value: AccountBalanceCategory; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'ccDebt', label: 'CC Debt' },
  { value: 'investments', label: 'Investments' },
];

export function isAccountBalanceCategory(value: unknown): value is AccountBalanceCategory {
  return (
    value === 'checking' ||
    value === 'savings' ||
    value === 'ccDebt' ||
    value === 'investments' ||
    value === 'hidden'
  );
}

export function inferAccountBalanceCategory(account: Pick<Account, 'name' | 'type' | 'subtype'>): AccountBalanceCategory | null {
  const name = account.name.toLowerCase();
  const subtype = account.subtype?.toLowerCase();

  if (account.type === 'credit') {
    return 'ccDebt';
  }

  if (account.type === 'investment') {
    return 'investments';
  }

  if (account.type === 'depository') {
    return subtype === 'savings' || name.includes('savings') ? 'savings' : 'checking';
  }

  return null;
}

export function getAccountBalanceCategory(account: Pick<Account, 'name' | 'type' | 'subtype' | 'balance_category'>) {
  return account.balance_category ?? inferAccountBalanceCategory(account);
}

export function getAccountBalanceCategoryLabel(value: AccountBalanceCategory | null): string {
  if (value === 'hidden') {
    return 'Not shown';
  }

  return ACCOUNT_BALANCE_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? 'Not shown';
}
