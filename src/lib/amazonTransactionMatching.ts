export interface AmazonBankTransactionCandidate {
  id: string;
  date: string;
  amountCents: number;
}

export interface AmazonPaymentMatchCandidate {
  id: string;
  transactionDate: string | null;
  amountCents: number;
  isRefund: boolean;
  plaidTransactionId: string | null;
}

interface MatchPair {
  transactionId: string;
  paymentId: string;
  dateDistanceDays: number;
  paymentDate: string;
}

function getDateDistanceDays(left: string | null, right: string) {
  if (!left) {
    return Number.POSITIVE_INFINITY;
  }

  const leftDate = new Date(`${left}T00:00:00`).getTime();
  const rightDate = new Date(`${right}T00:00:00`).getTime();
  return Math.abs(Math.round((leftDate - rightDate) / 86_400_000));
}

function hasCompatibleDirection(
  transaction: AmazonBankTransactionCandidate,
  payment: AmazonPaymentMatchCandidate
) {
  if (transaction.amountCents === 0) {
    return false;
  }

  const transactionIsCredit = transaction.amountCents < 0;
  return transactionIsCredit === payment.isRefund;
}

function isCompatibleMatch(
  transaction: AmazonBankTransactionCandidate,
  payment: AmazonPaymentMatchCandidate,
  maximumDateDistanceDays: number
) {
  return (
    hasCompatibleDirection(transaction, payment) &&
    Math.abs(transaction.amountCents) === Math.abs(payment.amountCents) &&
    getDateDistanceDays(payment.transactionDate, transaction.date) <= maximumDateDistanceDays
  );
}

/**
 * Matches Amazon payment rows to ledger transactions without allowing a
 * purchase to match a credit (or a refund to match a debit). Each payment and
 * ledger transaction can be used only once, keeping equal-value nearby orders
 * from displaying the same Amazon match.
 */
export function matchAmazonPaymentsToTransactions(
  transactions: AmazonBankTransactionCandidate[],
  payments: AmazonPaymentMatchCandidate[],
  maximumDateDistanceDays = 5
) {
  const paymentIdByTransactionId = new Map<string, string>();
  const usedTransactionIds = new Set<string>();
  const usedPaymentIds = new Set<string>();
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  payments.forEach((payment) => {
    if (!payment.plaidTransactionId) {
      return;
    }

    const transaction = transactionById.get(payment.plaidTransactionId);
    if (!transaction || !isCompatibleMatch(transaction, payment, maximumDateDistanceDays)) {
      return;
    }

    paymentIdByTransactionId.set(transaction.id, payment.id);
    usedTransactionIds.add(transaction.id);
    usedPaymentIds.add(payment.id);
  });

  const candidatePairs: MatchPair[] = [];
  transactions.forEach((transaction) => {
    if (usedTransactionIds.has(transaction.id)) {
      return;
    }

    payments.forEach((payment) => {
      if (
        payment.plaidTransactionId ||
        usedPaymentIds.has(payment.id) ||
        !isCompatibleMatch(transaction, payment, maximumDateDistanceDays)
      ) {
        return;
      }

      candidatePairs.push({
        transactionId: transaction.id,
        paymentId: payment.id,
        dateDistanceDays: getDateDistanceDays(payment.transactionDate, transaction.date),
        paymentDate: payment.transactionDate ?? '',
      });
    });
  });

  candidatePairs
    .sort(
      (left, right) =>
        left.dateDistanceDays - right.dateDistanceDays ||
        right.paymentDate.localeCompare(left.paymentDate) ||
        left.transactionId.localeCompare(right.transactionId) ||
        left.paymentId.localeCompare(right.paymentId)
    )
    .forEach((pair) => {
      if (usedTransactionIds.has(pair.transactionId) || usedPaymentIds.has(pair.paymentId)) {
        return;
      }

      paymentIdByTransactionId.set(pair.transactionId, pair.paymentId);
      usedTransactionIds.add(pair.transactionId);
      usedPaymentIds.add(pair.paymentId);
    });

  return paymentIdByTransactionId;
}
