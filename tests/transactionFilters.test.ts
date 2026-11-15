import assert from 'node:assert/strict';
import test from 'node:test';
import { transactionFilterHref } from '../src/lib/transactionFilters';

test('changing views preserves search and account filters and resets pagination', () => {
  const url = new URL(transactionFilterHref({ q: 'coffee & tea', accountId: 'checking', page: '4', sort: 'date', dir: 'asc' }, { categoryId: 'uncategorized' }), 'http://localhost');
  assert.equal(url.searchParams.get('q'), 'coffee & tea');
  assert.equal(url.searchParams.get('accountId'), 'checking');
  assert.equal(url.searchParams.get('categoryId'), 'uncategorized');
  assert.equal(url.searchParams.get('dir'), 'asc');
  assert.equal(url.searchParams.has('page'), false);
});

test('removing one filter keeps the remaining filters', () => {
  const url = new URL(transactionFilterHref({ q: 'rent', from: '2026-01-01', categoryId: 'uncategorized' }, { q: null }), 'http://localhost');
  assert.equal(url.searchParams.has('q'), false);
  assert.equal(url.searchParams.get('from'), '2026-01-01');
  assert.equal(url.searchParams.get('categoryId'), 'uncategorized');
  assert.equal(transactionFilterHref({ categoryId: 'uncategorized', page: '3' }, { categoryId: null }), '/transactions');
});
