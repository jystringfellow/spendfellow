import assert from 'node:assert/strict';
import test from 'node:test';
import { matchAmazonPaymentsToTransactions } from '../src/lib/amazonTransactionMatching';

test('matches purchases to debits and refunds to credits with the same amount', () => {
  const matches = matchAmazonPaymentsToTransactions(
    [
      { id: 'debit', date: '2026-08-01', amountCents: 2_500 },
      { id: 'credit', date: '2026-08-02', amountCents: -2_500 },
    ],
    [
      {
        id: 'purchase',
        transactionDate: '2026-08-01',
        amountCents: 2_500,
        isRefund: false,
        plaidTransactionId: null,
      },
      {
        id: 'refund',
        transactionDate: '2026-08-02',
        amountCents: 2_500,
        isRefund: true,
        plaidTransactionId: null,
      },
    ]
  );

  assert.deepEqual(Object.fromEntries(matches), {
    debit: 'purchase',
    credit: 'refund',
  });
});

test('does not show a refund on a debit or a purchase on a credit', () => {
  const matches = matchAmazonPaymentsToTransactions(
    [
      { id: 'debit', date: '2026-08-01', amountCents: 2_500 },
      { id: 'credit', date: '2026-08-01', amountCents: -4_000 },
    ],
    [
      {
        id: 'refund',
        transactionDate: '2026-08-01',
        amountCents: 2_500,
        isRefund: true,
        plaidTransactionId: null,
      },
      {
        id: 'purchase',
        transactionDate: '2026-08-01',
        amountCents: 4_000,
        isRefund: false,
        plaidTransactionId: null,
      },
    ]
  );

  assert.equal(matches.size, 0);
});

test('uses each Amazon payment only once', () => {
  const matches = matchAmazonPaymentsToTransactions(
    [
      { id: 'first', date: '2026-08-01', amountCents: 1_000 },
      { id: 'second', date: '2026-08-02', amountCents: 1_000 },
    ],
    [
      {
        id: 'payment',
        transactionDate: '2026-08-01',
        amountCents: 1_000,
        isRefund: false,
        plaidTransactionId: null,
      },
    ]
  );

  assert.deepEqual(Object.fromEntries(matches), { first: 'payment' });
});

test('prefers a valid explicit link and ignores a linked payment as a heuristic candidate', () => {
  const matches = matchAmazonPaymentsToTransactions(
    [
      { id: 'linked', date: '2026-08-02', amountCents: -1_500 },
      { id: 'other', date: '2026-08-02', amountCents: -1_500 },
    ],
    [
      {
        id: 'refund',
        transactionDate: '2026-08-02',
        amountCents: 1_500,
        isRefund: true,
        plaidTransactionId: 'linked',
      },
    ]
  );

  assert.deepEqual(Object.fromEntries(matches), { linked: 'refund' });
});
