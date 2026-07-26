import assert from 'node:assert/strict';
import test from 'node:test';
import { groupBudgetLines } from '../src/lib/budgetLineGrouping';

const baseLine = {
  budget_group_id: null,
  budget_group_name: null,
  date: '2026-07-01',
  description: 'HSA reimbursement',
  merchant_name: null,
};

test('groups lines only when the user linked them to the same budget group', () => {
  const groups = groupBudgetLines([
    { ...baseLine, budget_group_id: 'hsa', budget_group_name: 'HSA reimbursements', amount_cents: -1_000 },
    {
      ...baseLine,
      budget_group_id: 'hsa',
      budget_group_name: 'HSA reimbursements',
      date: '2026-07-02',
      description: 'Different description',
      amount_cents: -2_500,
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.amountCents, -3_500);
  assert.equal(groups[0]?.lines.length, 2);
});

test('does not automatically group matching unlinked transactions', () => {
  const groups = groupBudgetLines([
    { ...baseLine, amount_cents: -1_000 },
    { ...baseLine, amount_cents: -2_000 },
  ]);

  assert.equal(groups.length, 2);
});

test('keeps linked debits and credits in separate display groups', () => {
  const groups = groupBudgetLines([
    { ...baseLine, budget_group_id: 'hsa', budget_group_name: 'HSA reimbursements', amount_cents: 1_000 },
    { ...baseLine, budget_group_id: 'hsa', budget_group_name: 'HSA reimbursements', amount_cents: -1_000 },
  ]);

  assert.equal(groups.length, 2);
});

test('uses the manual group name as the display label', () => {
  const groups = groupBudgetLines([
    { ...baseLine, budget_group_id: 'hsa', budget_group_name: 'HSA reimbursements', amount_cents: -1_000 },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.label, 'HSA reimbursements');
});
