import assert from 'node:assert/strict';
import test from 'node:test';
import { createCategoryLayoutRestorationRows } from '../src/lib/categoryLayouts';
import type { Category, CategoryLayoutPeriod } from '../src/types/database';

function category(id: string): Category {
  return {
    id,
    user_id: 'user',
    household_id: 'household',
    name: id,
    color: null,
    icon: null,
    parent_category_id: null,
    group_key: 'needs',
    target_percent: null,
    is_group: false,
    default_monthly_budget_cents: 0,
    rollover_enabled: false,
    rollover_start_date: null,
    is_income: false,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function layout(categoryId: string): CategoryLayoutPeriod {
  return {
    id: `layout-${categoryId}`,
    household_id: 'household',
    category_id: categoryId,
    parent_category_id: null,
    start_year: 2026,
    start_month: 2,
    end_year: 2026,
    end_month: 2,
    sort_order: 0,
    is_visible: true,
    notes: 'Imported February layout',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

test('creates a complete open-ended restoration snapshot', () => {
  const categories = [category('needs'), category('wants'), category('big-wants')];
  const rows = createCategoryLayoutRestorationRows(
    categories,
    categories,
    categories.map((candidate) => layout(candidate.id)),
    new Set(categories.map((candidate) => candidate.id)),
    2026,
    2,
    'Restored layout'
  );

  assert.equal(rows.length, categories.length);
  assert.deepEqual(rows.map((row) => row.category_id), ['needs', 'wants', 'big-wants']);
  assert.ok(rows.every((row) => row.end_year === null && row.end_month === null));
  assert.ok(rows.every((row) => row.is_visible));
});

test('restores the underlying layout instead of leaking a finite imported month forward', () => {
  const categories = [category('needs'), category('wants'), category('big-wants')];
  const finiteFebruaryLayouts = [
    layout('needs'),
    { ...layout('wants'), is_visible: false },
    { ...layout('big-wants'), is_visible: false },
  ];
  const rows = createCategoryLayoutRestorationRows(
    categories,
    categories,
    finiteFebruaryLayouts,
    new Set(categories.map((candidate) => candidate.id)),
    2026,
    2,
    'Restored layout'
  );

  assert.ok(rows.every((row) => row.is_visible));
});
