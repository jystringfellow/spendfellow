import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRolloverCategoryBalance } from '../src/lib/categoryBalances';
import type {
  Category,
  CategoryBalanceAdjustment,
  CategoryBudgetPeriod,
} from '../src/types/database';

const category: Category = {
  id: 'fun',
  user_id: 'user',
  household_id: 'household',
  name: 'Person A',
  color: null,
  icon: null,
  parent_category_id: null,
  group_key: 'wants',
  target_percent: null,
  is_group: false,
  default_monthly_budget_cents: 35_000,
  rollover_enabled: true,
  rollover_start_date: '2026-01-01',
  is_income: false,
  sort_order: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const adjustment = (
  overrides: Partial<CategoryBalanceAdjustment>
): CategoryBalanceAdjustment => ({
  id: 'adjustment',
  household_id: 'household',
  category_id: 'fun',
  source_transaction_id: null,
  effective_date: '2026-02-15',
  amount_cents: 10_000,
  kind: 'gift',
  status: 'posted',
  description: 'Gift card',
  notes: null,
  created_by: 'user',
  created_at: '2026-02-15T00:00:00Z',
  updated_at: '2026-02-15T00:00:00Z',
  ...overrides,
});

test('rolls prior balance forward and credits adjustments without reducing gross spend', () => {
  const balance = calculateRolloverCategoryBalance(
    category,
    [],
    [
      { category_id: 'fun', date: '2026-01-10', amount_cents: 20_000 },
      { category_id: 'fun', date: '2026-02-10', amount_cents: 40_000 },
    ],
    [adjustment({})],
    2026,
    2
  );

  assert.deepEqual(balance, {
    active: true,
    openingBalanceCents: 15_000,
    monthlyAllotmentCents: 35_000,
    adjustmentsThisMonthCents: 10_000,
    availableBeforeSpendCents: 60_000,
    spentThisMonthCents: 40_000,
    endingBalanceCents: 20_000,
  });
});

test('uses historical monthly budget periods for rollover allotments', () => {
  const periods: CategoryBudgetPeriod[] = [
    {
      id: 'period',
      household_id: 'household',
      category_id: 'fun',
      year: 2026,
      start_month: 2,
      amount_cents: 50_000,
      notes: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const balance = calculateRolloverCategoryBalance(
    category,
    periods,
    [],
    [],
    2026,
    2
  );

  assert.equal(balance.openingBalanceCents, 35_000);
  assert.equal(balance.monthlyAllotmentCents, 50_000);
  assert.equal(balance.endingBalanceCents, 85_000);
});

test('excludes pending adjustments and remains inactive before the configured start', () => {
  const beforeStart = calculateRolloverCategoryBalance(
    { ...category, rollover_start_date: '2026-03-01' },
    [],
    [],
    [adjustment({ status: 'pending' })],
    2026,
    2
  );

  assert.equal(beforeStart.active, false);
  assert.equal(beforeStart.endingBalanceCents, 0);
});
