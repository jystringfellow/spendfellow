import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupersededPeriodIds, resolveCategoryBudgetAmount } from '../src/lib/constantPeriods';
import type { CategoryBudgetPeriod } from '../src/types/database';

function period(id: string, year: number, startMonth: number, amountCents: number): CategoryBudgetPeriod {
  return {
    id,
    household_id: 'household',
    category_id: 'fun',
    year,
    start_month: startMonth,
    amount_cents: amountCents,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

test('a manual effective date supersedes later monthly budget periods', () => {
  const periods = [
    period('jan', 2026, 1, 10_000),
    period('feb', 2026, 2, 35_000),
    period('dec', 2026, 12, 40_000),
    period('next-year', 2027, 1, 45_000),
    period('prior-year', 2025, 12, 5_000),
  ];

  assert.deepEqual(getSupersededPeriodIds(periods, 2026, 1), ['feb', 'dec', 'next-year']);
});

test('the replacement period remains effective after later periods are removed', () => {
  const periods = [
    period('jan', 2026, 1, 10_000),
    period('feb', 2026, 2, 35_000),
    period('mar', 2026, 3, 40_000),
  ];
  const supersededIds = new Set(getSupersededPeriodIds(periods, 2026, 1));
  const remainingPeriods = periods.filter((candidate) => !supersededIds.has(candidate.id));

  assert.equal(resolveCategoryBudgetAmount('fun', 10_000, remainingPeriods, 2026, 1).amount_cents, 10_000);
  assert.equal(resolveCategoryBudgetAmount('fun', 10_000, remainingPeriods, 2026, 2).amount_cents, 10_000);
  assert.equal(resolveCategoryBudgetAmount('fun', 10_000, remainingPeriods, 2026, 12).amount_cents, 10_000);
});

test('a midyear change preserves earlier history', () => {
  const periods = [
    period('jan', 2026, 1, 10_000),
    period('may', 2026, 5, 20_000),
    period('jun', 2026, 6, 30_000),
  ];

  assert.deepEqual(getSupersededPeriodIds(periods, 2026, 5), ['jun']);
});
