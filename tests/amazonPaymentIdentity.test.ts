import assert from 'node:assert/strict';
import test from 'node:test';
import { getAmazonPaymentIdentity } from '../src/lib/amazonPaymentIdentity';

test('treats a purchase and refund with otherwise identical details as distinct payments', () => {
  const sharedFields = {
    order_id: '123-1234567-1234567',
    amount_cents: 2_500,
    payment_method_hint: 'Visa ending in 1234',
    transaction_date: '2026-08-01',
  };

  assert.notEqual(
    getAmazonPaymentIdentity({ ...sharedFields, is_refund: false }),
    getAmazonPaymentIdentity({ ...sharedFields, is_refund: true })
  );
});
