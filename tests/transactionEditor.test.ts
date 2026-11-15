import assert from 'node:assert/strict';
import { before, beforeEach, afterEach, test } from 'node:test';
import { createElement } from 'react';
import { createRequire } from 'node:module';
import { installDom } from './support/dom';
import type { EditableTransactionRow } from '../src/components/transactions/TransactionsTable';

let testing: typeof import('@testing-library/react');
let userEvent: typeof import('@testing-library/user-event').default;
let TransactionsTable: typeof import('../src/components/transactions/TransactionsTable').default;
let ThemeProvider: typeof import('@mui/material/styles').ThemeProvider;
let createAppTheme: typeof import('../src/app/theme').createAppTheme;
let AppRouterContext: typeof import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterContext;
const requests: { url: string; body: Record<string, unknown> }[] = [];
const originalFetch = globalThis.fetch;
let failSave = false;
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: 'test' };
const categories = [
  { id: 'groceries', name: 'Groceries', is_income: false, rollover_enabled: false, rollover_start_date: null },
  { id: 'rent', name: 'Rent', is_income: false, rollover_enabled: false, rollover_start_date: null },
];
function transaction(id: string, overrides: Partial<EditableTransactionRow> = {}): EditableTransactionRow {
  return { id, user_id: 'user', household_id: 'household', account_id: 'account', category_id: 'groceries',
    plaid_transaction_id: id, plaid_environment: 'sandbox', source: 'plaid', date: '2026-11-15', amount_cents: 1200,
    merchant_name: id, description: `Description for ${id}`, pending: false, notes: null, created_at: '', updated_at: '',
    accounts: { name: 'Checking', type: 'depository', source: 'plaid' }, transaction_tag_ids: [], transaction_split_count: 0,
    transaction_splits: [], fun_money_allocations: [], budget_group: null, ...overrides };
}

before(async () => {
  installDom();
  testing = await import('@testing-library/react');
  userEvent = (await import('@testing-library/user-event')).default;
  TransactionsTable = (await import('../src/components/transactions/TransactionsTable')).default;
  ThemeProvider = (await import('@mui/material/styles')).ThemeProvider;
  createAppTheme = (await import('../src/app/theme')).createAppTheme;
  AppRouterContext = createRequire(`${process.cwd()}/package.json`)('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterContext;
});
beforeEach(() => {
  requests.length = 0; failSave = false;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: options?.body ? JSON.parse(String(options.body)) : {} });
    return new Response(JSON.stringify(failSave ? { error: 'Save failed. Try again.' } : { budget_group: null, tags: [] }), { status: failSave ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
  };
});
afterEach(() => { testing.cleanup(); globalThis.fetch = originalFetch; });
function renderTable(rows = [transaction('First'), transaction('Second')]) {
  const ui = (transactions: EditableTransactionRow[]) => createElement(AppRouterContext.Provider, { value: router },
    createElement(ThemeProvider, { theme: createAppTheme('dark') }, createElement(TransactionsTable, { transactions, categories, tags: [{ id: 'tag-food', name: 'Food tag', color: null }], budgetGroups: [], accounts: [{ id: 'account', name: 'Checking', type: 'depository', source: 'plaid' }] })));
  const view = testing.render(ui(rows));
  return { ...view, user: userEvent.setup(), replaceRows: (next: EditableTransactionRow[]) => view.rerender(ui(next)) };
}

test('multiple selection never opens the row editor; bulk edits include every selected ID', async () => {
  const { user } = renderTable();
  await user.click(testing.screen.getByRole('checkbox', { name: 'Select First' }));
  await user.click(testing.screen.getByRole('checkbox', { name: 'Select Second' }));
  assert.equal(testing.screen.queryByRole('dialog'), null);
  assert.ok(testing.screen.getByText('2 selected'));
  await user.click(testing.screen.getByRole('button', { name: 'Bulk edit' }));
  await user.click(testing.screen.getByLabelText('Change category'));
  await user.click(testing.screen.getByRole('button', { name: 'Apply changes' }));
  await testing.waitFor(() => assert.equal(requests.length, 1));
  assert.deepEqual(requests[0].body.transaction_ids, ['First', 'Second']);
  assert.equal(requests[0].url, '/api/transactions/bulk');
});

test('rows are read-only and clicking the merchant opens the editor; Save commits the draft', async () => {
  const { user } = renderTable();
  assert.equal(testing.screen.queryByRole('textbox'), null);
  assert.equal(testing.screen.queryByRole('button', { name: 'Save' }), null);
  await user.click(testing.screen.getByText('First', { exact: true }));
  assert.ok(testing.screen.getByRole('dialog', { name: 'Edit transaction' }));
  await user.type(testing.screen.getByLabelText('Notes'), 'Test note');
  assert.equal(requests.length, 0);
  await user.click(testing.screen.getByRole('button', { name: 'Save changes' }));
  await testing.waitFor(() => assert.equal(requests[0]?.body.notes, 'Test note'));
  await testing.waitFor(() => assert.equal(testing.screen.queryByRole('dialog'), null));
});

test('Cancel protects unsaved edits and lets the person keep editing or discard', async () => {
  const { user } = renderTable();
  await user.click(testing.screen.getByRole('button', { name: 'Edit First' }));
  await user.type(testing.screen.getByLabelText('Notes'), 'Keep this');
  await user.click(testing.screen.getByRole('button', { name: 'Cancel' }));
  assert.ok(testing.screen.getByRole('dialog', { name: 'Discard unsaved changes?' }));
  await user.click(testing.screen.getByRole('button', { name: 'Keep editing' }));
  await testing.waitFor(() => assert.ok(testing.screen.getByRole('button', { name: 'Cancel' })));
  assert.equal((testing.screen.getByLabelText('Notes') as HTMLTextAreaElement).value, 'Keep this');
  await user.click(testing.screen.getByRole('button', { name: 'Cancel' }));
  await user.click(testing.screen.getByRole('button', { name: 'Discard changes' }));
  await testing.waitFor(() => assert.equal(testing.screen.queryByRole('dialog'), null));
  assert.equal(requests.length, 0);
});

test('single-row editor hides queue controls and keyboard save closes without advancing', async () => {
  const { user, replaceRows } = renderTable();
  await user.click(testing.screen.getByRole('button', { name: 'Edit First' }));
  for (const name of ['Back', 'Skip', 'Save and next']) {
    assert.equal(testing.screen.queryByRole('button', { name }), null);
  }
  assert.equal(testing.screen.queryByRole('progressbar'), null);
  await user.type(testing.screen.getByLabelText('Notes'), 'Reviewed');
  await user.keyboard('{Control>}{Enter}{/Control}');
  await testing.waitFor(() => assert.equal(requests[0]?.url, '/api/transactions/First'));
  assert.equal(requests[0].body.notes, 'Reviewed');
  replaceRows([transaction('Second')]);
  await testing.waitFor(() => assert.equal(testing.screen.queryByRole('dialog'), null));
  assert.equal(requests.length, 1);
});

test('categorization retains progress and Save and next advances the queue', async () => {
  const CategorizationModeButton = (await import('../src/components/transactions/CategorizationModeButton')).default;
  testing.render(createElement(AppRouterContext.Provider, { value: router },
    createElement(ThemeProvider, { theme: createAppTheme('dark') },
      createElement(CategorizationModeButton, { transactions: [transaction('First'), transaction('Second')], categories, tags: [], budgetGroups: [] }))));
  const user = userEvent.setup();
  await user.click(testing.screen.getByRole('button', { name: 'Categorize uncategorized (2)' }));
  assert.ok(testing.screen.getByRole('progressbar'));
  assert.ok(testing.screen.getByRole('button', { name: 'Back' }));
  assert.ok(testing.screen.getByRole('button', { name: 'Skip' }));
  await user.click(testing.screen.getByRole('button', { name: 'Save and next' }));
  await testing.waitFor(() => assert.equal(requests[0]?.url, '/api/transactions/First'));
  assert.ok(testing.screen.getByText('Second', { exact: true }));
  assert.ok(testing.screen.getByText('1 of 2 done'));
  assert.ok(testing.screen.getByRole('button', { name: 'Save and next' }));
});

test('failed saves keep the editor and draft available for retry', async () => {
  failSave = true;
  const { user } = renderTable();
  await user.click(testing.screen.getByRole('button', { name: 'Edit First' }));
  await user.type(testing.screen.getByLabelText('Notes'), 'Do not lose');
  await user.click(testing.screen.getByRole('button', { name: 'Save changes' }));
  await testing.waitFor(() => assert.ok(testing.screen.getByText('Save failed. Try again.')));
  assert.equal((testing.screen.getByLabelText('Notes') as HTMLTextAreaElement).value, 'Do not lose');
  assert.ok(testing.screen.getByRole('button', { name: 'Save changes' }));
});

test('existing split amounts, categories and tags round-trip through the editor', async () => {
  const splits = [
    { id: 'split1', amount_cents: 500, category_id: 'groceries', notes: 'Food', tag_ids: ['tag-food'] },
    { id: 'split2', amount_cents: 700, category_id: 'rent', notes: 'Other', tag_ids: [] },
  ];
  const { user } = renderTable([transaction('Split', { transaction_split_count: 2, category_id: null, transaction_splits: splits })]);
  await user.click(testing.screen.getByRole('button', { name: 'Edit Split' }));
  await user.click(testing.screen.getByRole('button', { name: 'Save changes' }));
  await testing.waitFor(() => assert.deepEqual(requests[0]?.body.splits, splits.map(({ id: _id, ...split }) => ({ ...split, tag_names: [] }))));
});


test('select-all, deselect-all and clear selection keep checkbox selection independent of editing', async () => {
  const { user } = renderTable();
  const all = testing.screen.getByRole('checkbox', { name: 'Select all transactions on this page' }) as HTMLInputElement;
  await user.click(all);
  assert.ok(testing.screen.getByText('2 selected'));
  assert.equal(testing.screen.queryByRole('dialog'), null);
  await user.click(all);
  assert.equal(all.checked, false);
  assert.equal(testing.screen.queryByRole('button', { name: 'Bulk edit' }), null);
  await user.click(all);
  await user.click(testing.screen.getByRole('button', { name: 'Clear selection' }));
  assert.equal(all.checked, false);
});

test('a failed bulk save keeps every selected transaction and the requested change', async () => {
  failSave = true;
  const { user } = renderTable();
  await user.click(testing.screen.getByRole('checkbox', { name: 'Select all transactions on this page' }));
  await user.click(testing.screen.getByRole('button', { name: 'Bulk edit' }));
  await user.click(testing.screen.getByLabelText('Change category'));
  await user.click(testing.screen.getByRole('button', { name: 'Apply changes' }));
  await testing.waitFor(() => assert.ok(testing.screen.getByText('Save failed. Try again.')));
  assert.deepEqual(requests[0].body.transaction_ids, ['First', 'Second']);
  assert.equal((testing.screen.getByLabelText('Change category') as HTMLInputElement).checked, true);
  assert.ok(testing.screen.getByRole('dialog', { name: 'Bulk edit 2 transactions' }));
});


test('imported amounts remain read-only while manual transaction details stay editable', async () => {
  const { user } = renderTable([transaction('Bank'), transaction('Manual', { source: 'manual' })]);
  await user.click(testing.screen.getByRole('button', { name: 'Edit Bank' }));
  assert.equal(testing.screen.queryByLabelText('Amount'), null);
  assert.equal(testing.screen.queryByLabelText('Date'), null);
  assert.equal(testing.screen.queryByRole('button', { name: 'Edit manual details' }), null);
  await user.click(testing.screen.getByRole('button', { name: 'Cancel' }));
  await user.click(testing.screen.getByRole('button', { name: 'Edit Manual' }));
  await user.click(testing.screen.getByRole('button', { name: 'Edit manual details' }));
  assert.ok(testing.screen.getByLabelText('Amount'));
  assert.ok(testing.screen.getByLabelText('Date'));
  assert.ok(testing.screen.getByLabelText('Account'));
});
