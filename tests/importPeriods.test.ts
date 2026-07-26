import assert from 'node:assert/strict';
import test from 'node:test';
import { getImportRestorationMonths } from '../src/lib/importPeriods';

test('restores immediately after a contiguous partial import', () => {
  assert.deepEqual(
    getImportRestorationMonths([
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
    ]),
    [{ year: 2026, month: 6 }]
  );
});

test('restores after every non-contiguous imported range', () => {
  assert.deepEqual(
    getImportRestorationMonths([
      { year: 2026, month: 1 },
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
    ]),
    [
      { year: 2026, month: 2 },
      { year: 2026, month: 5 },
    ]
  );
});

test('restores in January after a December import', () => {
  assert.deepEqual(
    getImportRestorationMonths([{ year: 2026, month: 12 }]),
    [{ year: 2027, month: 1 }]
  );
});
