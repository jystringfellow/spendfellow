import type { Transaction as PlaidTransaction } from 'plaid';

export interface PlaidPendingTransition {
  pendingTransactionId: string;
  postedTransactionId: string;
}

interface LocalPendingTransaction {
  id: string;
  plaid_transaction_id: string | null;
}

export function getPendingAwareStartDate(baseStartDate: string, pendingDates: string[]): string {
  return pendingDates.reduce(
    (earliestDate, pendingDate) => (pendingDate < earliestDate ? pendingDate : earliestDate),
    baseStartDate
  );
}

export function getRemovedPendingTransactionIds(
  localPendingTransactions: LocalPendingTransaction[],
  currentPlaidTransactionIds: Set<string>
): string[] {
  return localPendingTransactions
    .filter(
      (transaction) =>
        transaction.plaid_transaction_id && !currentPlaidTransactionIds.has(transaction.plaid_transaction_id)
    )
    .map((transaction) => transaction.id);
}

export function getPlaidPendingTransitions(
  transactions: Pick<PlaidTransaction, 'pending' | 'pending_transaction_id' | 'transaction_id'>[]
): PlaidPendingTransition[] {
  const transitions = new Map<string, PlaidPendingTransition>();

  transactions.forEach((transaction) => {
    if (
      transaction.pending ||
      !transaction.pending_transaction_id ||
      transaction.pending_transaction_id === transaction.transaction_id
    ) {
      return;
    }

    transitions.set(transaction.pending_transaction_id, {
      pendingTransactionId: transaction.pending_transaction_id,
      postedTransactionId: transaction.transaction_id,
    });
  });

  return Array.from(transitions.values());
}
