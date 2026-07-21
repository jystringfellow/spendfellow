import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateAmazonSplitAmounts } from '../src/lib/amazonSplitAllocation';

test('distributes tax proportionally across Amazon item splits', () => {
  const allocation = allocateAmazonSplitAmounts(
    [
      { id: 'household', amountCents: 6_000 },
      { id: 'clothing', amountCents: 4_000 },
    ],
    11_000,
    11_000
  );

  assert.deepEqual(allocation, {
    itemAmounts: [
      { id: 'household', amountCents: 6_600 },
      { id: 'clothing', amountCents: 4_400 },
    ],
    creditCents: 0,
    fullOrderTotalCents: 11_000,
  });
});

test('returns a credit that reconciles the full order total to the card charge', () => {
  const allocation = allocateAmazonSplitAmounts(
    [
      { id: 'household', amountCents: 6_000 },
      { id: 'clothing', amountCents: 4_000 },
    ],
    8_000,
    11_000
  );

  assert.ok(allocation);
  assert.deepEqual(allocation.itemAmounts, [
    { id: 'household', amountCents: 6_600 },
    { id: 'clothing', amountCents: 4_400 },
  ]);
  assert.equal(allocation.creditCents, 3_000);
  assert.equal(
    allocation.itemAmounts.reduce((total, item) => total + item.amountCents, 0) - allocation.creditCents,
    8_000
  );
});

test('assigns rounding cents deterministically while preserving the exact total', () => {
  const allocation = allocateAmazonSplitAmounts(
    [
      { id: 'first', amountCents: 1 },
      { id: 'second', amountCents: 1 },
      { id: 'third', amountCents: 1 },
    ],
    100,
    100
  );

  assert.deepEqual(allocation?.itemAmounts, [
    { id: 'first', amountCents: 34 },
    { id: 'second', amountCents: 33 },
    { id: 'third', amountCents: 33 },
  ]);
});

test('falls back to the transaction amount when the order total is missing or smaller', () => {
  const missingTotal = allocateAmazonSplitAmounts([{ id: 'item', amountCents: 7_500 }], 8_000, null);
  const smallerTotal = allocateAmazonSplitAmounts([{ id: 'item', amountCents: 7_500 }], 8_000, 7_500);

  assert.equal(missingTotal?.itemAmounts[0]?.amountCents, 8_000);
  assert.equal(missingTotal?.creditCents, 0);
  assert.equal(smallerTotal?.itemAmounts[0]?.amountCents, 8_000);
  assert.equal(smallerTotal?.creditCents, 0);
});

test('ignores unusable item amounts and rejects an unusable transaction', () => {
  const allocation = allocateAmazonSplitAmounts(
    [
      { id: 'valid', amountCents: 1_000 },
      { id: 'missing', amountCents: 0 },
    ],
    1_100,
    1_100
  );

  assert.deepEqual(allocation?.itemAmounts, [{ id: 'valid', amountCents: 1_100 }]);
  assert.equal(allocateAmazonSplitAmounts([{ id: 'item', amountCents: 1_000 }], 0, 1_000), null);
});
