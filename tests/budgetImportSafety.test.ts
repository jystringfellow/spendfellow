import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDuplicateSourceSuggestion,
  getPotentialOriginalSource,
  normalizeBudgetImportSource,
} from '../src/lib/budgetImportSafety';

test('detects browser-style duplicate download suffixes', () => {
  assert.equal(
    getPotentialOriginalSource('Stringfellow Monthly Budget - 2026 (1)'),
    'Stringfellow Monthly Budget - 2026'
  );
  assert.equal(getPotentialOriginalSource('Stringfellow Monthly Budget - 2026'), null);
});

test('suggests an existing original source before a duplicate source is created', () => {
  assert.equal(
    getDuplicateSourceSuggestion(
      'Stringfellow Monthly Budget - 2026 (1)',
      ['Stringfellow Monthly Budget - 2026']
    ),
    'Stringfellow Monthly Budget - 2026'
  );
});

test('allows an explicitly established suffixed source to be updated', () => {
  assert.equal(
    getDuplicateSourceSuggestion(
      'Stringfellow Monthly Budget - 2025 (1)',
      ['Stringfellow Monthly Budget - 2025', 'Stringfellow Monthly Budget - 2025 (1)']
    ),
    null
  );
});

test('uses an explicit source and otherwise derives it from the workbook name', () => {
  assert.equal(normalizeBudgetImportSource(' Household history ', 'ignored.xlsx'), 'Household history');
  assert.equal(
    normalizeBudgetImportSource(null, 'Stringfellow Monthly Budget - 2026 (1).xlsx'),
    'Stringfellow Monthly Budget - 2026 (1)'
  );
});
