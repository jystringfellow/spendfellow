export interface TransactionFilterValues {
  q?: string;
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  sort?: string;
  dir?: string;
  page?: string;
}

export function transactionFilterHref(values: TransactionFilterValues, updates: Partial<Record<keyof TransactionFilterValues, string | null>>) {
  const next = { ...values, ...updates, page: null };
  const params = new URLSearchParams();
  Object.entries(next).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.size ? `/transactions?${params}` : '/transactions';
}
