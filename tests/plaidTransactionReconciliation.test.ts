import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPendingAwareStartDate,
  getPlaidPendingTransitions,
  getRemovedPendingTransactionIds,
} from '../src/lib/plaidTransactionReconciliation';

test('extends the sync window to the oldest unresolved pending transaction', () => {
  assert.equal(getPendingAwareStartDate('2026-08-16', ['2026-08-17', '2026-08-03']), '2026-08-03');
  assert.equal(getPendingAwareStartDate('2026-08-16', []), '2026-08-16');
});

test('finds local pending transactions Plaid no longer returns', () => {
  assert.deepEqual(
    getRemovedPendingTransactionIds(
      [
        { id: 'still-here', plaid_transaction_id: 'plaid-current' },
        { id: 'removed', plaid_transaction_id: 'plaid-removed' },
        { id: 'manual-or-invalid', plaid_transaction_id: null },
      ],
      new Set(['plaid-current', 'plaid-posted'])
    ),
    ['removed']
  );
});

test('finds Plaid pending-to-posted transitions', () => {
  assert.deepEqual(
    getPlaidPendingTransitions([
      {
        transaction_id: 'posted-transaction',
        pending_transaction_id: 'pending-transaction',
        pending: false,
      },
      {
        transaction_id: 'still-pending',
        pending_transaction_id: null,
        pending: true,
      },
      {
        transaction_id: 'ordinary-posted',
        pending_transaction_id: null,
        pending: false,
      },
    ]),
    [
      {
        pendingTransactionId: 'pending-transaction',
        postedTransactionId: 'posted-transaction',
      },
    ]
  );
});

test('ignores malformed and duplicate pending transition references', () => {
  assert.deepEqual(
    getPlaidPendingTransitions([
      {
        transaction_id: 'same-id',
        pending_transaction_id: 'same-id',
        pending: false,
      },
      {
        transaction_id: 'posted-first',
        pending_transaction_id: 'pending-id',
        pending: false,
      },
      {
        transaction_id: 'posted-latest',
        pending_transaction_id: 'pending-id',
        pending: false,
      },
    ]),
    [
      {
        pendingTransactionId: 'pending-id',
        postedTransactionId: 'posted-latest',
      },
    ]
  );
});
