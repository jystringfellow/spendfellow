import assert from 'node:assert/strict';
import test from 'node:test';
import { findUniqueAmazonRefundItemIds } from '../src/lib/amazonRefundItems';

test('identifies a uniquely matching refunded item after proportional tax allocation', () => {
  assert.deepEqual(
    findUniqueAmazonRefundItemIds(
      [
        { id: 'larger', amountCents: 6_000 },
        { id: 'smaller', amountCents: 4_000 },
      ],
      -4_400,
      11_000
    ),
    ['smaller']
  );
});

test('identifies a uniquely matching group of refunded items', () => {
  assert.deepEqual(
    findUniqueAmazonRefundItemIds(
      [
        { id: 'first', amountCents: 4_000 },
        { id: 'second', amountCents: 3_500 },
        { id: 'third', amountCents: 2_500 },
      ],
      6_600,
      11_000
    ),
    ['second', 'third']
  );
});

test('does not guess when equal-priced items make a refund ambiguous', () => {
  assert.equal(
    findUniqueAmazonRefundItemIds(
      [
        { id: 'first', amountCents: 2_000 },
        { id: 'second', amountCents: 2_000 },
      ],
      2_200,
      4_400
    ),
    null
  );
});

test('does not guess when the refund amount cannot be reconciled', () => {
  assert.equal(
    findUniqueAmazonRefundItemIds([{ id: 'item', amountCents: 2_000 }], 1_000, 2_200),
    null
  );
});

test('uses a clearly closest item when Amazon applies item-specific tax or discounts', () => {
  assert.deepEqual(
    findUniqueAmazonRefundItemIds(
      [
        { id: 'returned', amountCents: 1_119 },
        { id: 'other', amountCents: 1_503 },
        { id: 'another', amountCents: 753 },
      ],
      1_200,
      3_600
    ),
    ['returned']
  );
});

test('does not use closest-item matching when two items are nearly tied', () => {
  assert.equal(
    findUniqueAmazonRefundItemIds(
      [
        { id: 'first', amountCents: 880 },
        { id: 'second', amountCents: 879 },
        { id: 'other', amountCents: 1_300 },
      ],
      943,
      3_200
    ),
    null
  );
});
