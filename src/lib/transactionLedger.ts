export type TransactionDirection = 'expense' | 'income';

export interface CreditCardPaymentTransactionShape {
  id: string;
  amountCents: number;
  accountType: string;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeLedgerText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function applyTransactionDirection(amountCents: number, direction: TransactionDirection): number {
  const magnitude = Math.abs(amountCents);
  return direction === 'income' ? -magnitude : magnitude;
}

export function getCreditCardPaymentRoles(
  first: CreditCardPaymentTransactionShape,
  second: CreditCardPaymentTransactionShape
): { checkingTransactionId: string; creditTransactionId: string } | null {
  const checking = [first, second].find(
    (transaction) => transaction.accountType === 'depository' && transaction.amountCents > 0
  );
  const credit = [first, second].find(
    (transaction) => transaction.accountType === 'credit' && transaction.amountCents < 0
  );

  if (!checking || !credit || checking.amountCents + credit.amountCents !== 0) {
    return null;
  }

  return {
    checkingTransactionId: checking.id,
    creditTransactionId: credit.id,
  };
}

export function addDaysToIsoDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
