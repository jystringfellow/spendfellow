import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBudgetImportMode, planBudgetLineImport } from '../src/lib/budgetImportLines';

const existingLines = [
  { id: 'jan-a', source_sheet: 'Jan', source_cell: 'B2', month: 1 },
  { id: 'jan-old', source_sheet: 'Jan', source_cell: 'B3', month: 1 },
  { id: 'feb-a', source_sheet: 'Feb', source_cell: 'B2', month: 2 },
];

test('replace updates matching lines, inserts new lines, and removes stale lines in selected months', () => {
  const plan = planBudgetLineImport(
    [
      { source_sheet: 'Jan', source_cell: 'B2', month: 1 },
      { source_sheet: 'Jan', source_cell: 'B4', month: 1 },
    ],
    existingLines,
    [1],
    'replace'
  );

  assert.deepEqual(plan, {
    insertCount: 1,
    updateCount: 1,
    deleteIds: ['jan-old'],
  });
});

test('replace scopes removals by month even when a worksheet has been renamed', () => {
  const plan = planBudgetLineImport(
    [{ source_sheet: 'January', source_cell: 'B2', month: 1 }],
    existingLines,
    [1],
    'replace'
  );

  assert.equal(plan.insertCount, 1);
  assert.equal(plan.updateCount, 0);
  assert.deepEqual(plan.deleteIds, ['jan-a', 'jan-old']);
});

test('merge never removes lines absent from the workbook', () => {
  const plan = planBudgetLineImport(
    [{ source_sheet: 'Jan', source_cell: 'B2', month: 1 }],
    existingLines,
    [1],
    'merge'
  );

  assert.deepEqual(plan, {
    insertCount: 0,
    updateCount: 1,
    deleteIds: [],
  });
});

test('validates explicit import modes', () => {
  assert.equal(parseBudgetImportMode('replace'), 'replace');
  assert.equal(parseBudgetImportMode('merge'), 'merge');
  assert.equal(parseBudgetImportMode('append'), null);
  assert.equal(parseBudgetImportMode(null), null);
});
