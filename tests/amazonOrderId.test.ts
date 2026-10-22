import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrderId } from '../src/lib/amazonOrderId';

test('accepts standard Amazon and Whole Foods payment order identifiers', () => {
  assert.equal(normalizeOrderId('Order #113-1234567-1234567'), '113-1234567-1234567');
  assert.equal(normalizeOrderId('Order #4b343282-fcce-4610-8e41-8c8cfebe36ec'), '4b343282-fcce-4610-8e41-8c8cfebe36ec');
  assert.equal(normalizeOrderId('Order #not-an-order'), null);
});
