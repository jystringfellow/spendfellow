import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDaysToIsoDate,
  applyTransactionDirection,
  getCreditCardPaymentRoles,
  isCreditCardPaymentTransaction,
  isIsoDate,
  normalizeLedgerText,
} from '../src/lib/transactionLedger';

test('stores expenses as positive and income as negative ledger amounts', () => {
  assert.equal(applyTransactionDirection(2_500, 'expense'), 2_500);
  assert.equal(applyTransactionDirection(2_500, 'income'), -2_500);
  assert.equal(applyTransactionDirection(-2_500, 'expense'), 2_500);
});

test('recognizes an equal-and-opposite checking to credit-card payment', () => {
  assert.deepEqual(
    getCreditCardPaymentRoles(
      { id: 'credit-side', amountCents: -12_345, accountType: 'credit' },
      { id: 'checking-side', amountCents: 12_345, accountType: 'depository' }
    ),
    { checkingTransactionId: 'checking-side', creditTransactionId: 'credit-side' }
  );
});

test('recognizes either posted ledger side as eligible for a one-sided CC payment mark', () => {
  assert.equal(isCreditCardPaymentTransaction({ amountCents: 12_345, accountType: 'depository' }), true);
  assert.equal(isCreditCardPaymentTransaction({ amountCents: -12_345, accountType: 'credit' }), true);
  assert.equal(isCreditCardPaymentTransaction({ amountCents: -12_345, accountType: 'depository' }), false);
  assert.equal(isCreditCardPaymentTransaction({ amountCents: 12_345, accountType: 'credit' }), false);
});

test('rejects mismatched amounts and incorrect account roles', () => {
  assert.equal(
    getCreditCardPaymentRoles(
      { id: 'checking', amountCents: 10_000, accountType: 'depository' },
      { id: 'credit', amountCents: -9_999, accountType: 'credit' }
    ),
    null
  );
  assert.equal(
    getCreditCardPaymentRoles(
      { id: 'checking-one', amountCents: 10_000, accountType: 'depository' },
      { id: 'checking-two', amountCents: -10_000, accountType: 'depository' }
    ),
    null
  );
});

test('normalizes ledger input and date windows', () => {
  assert.equal(normalizeLedgerText('  Farmers   Market  ', 100), 'Farmers Market');
  assert.equal(normalizeLedgerText('   ', 100), null);
  assert.equal(isIsoDate('2026-07-21'), true);
  assert.equal(isIsoDate('07/21/2026'), false);
  assert.equal(addDaysToIsoDate('2026-07-21', -14), '2026-07-07');
  assert.equal(addDaysToIsoDate('2026-07-21', 14), '2026-08-04');
});
