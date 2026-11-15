import assert from 'node:assert/strict';
import { before, beforeEach, afterEach, test } from 'node:test';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { createRequire } from 'node:module';
import { installDom } from './support/dom';

let testing: typeof import('@testing-library/react');
let userEvent: typeof import('@testing-library/user-event').default;
let Workspace: typeof import('../src/components/accounts/AccountsWorkspace').default;
let OrderedAccountRows: typeof import('../src/components/accounts/AccountsWorkspace').OrderedAccountRows;
let OrderedInstitutions: typeof import('../src/components/accounts/AccountsWorkspace').OrderedInstitutions;
let SyncButton: typeof import('../src/components/transactions/SyncTransactionsButton').default;
let AppRouterContext: typeof import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterContext;
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: 'test' };
const originalFetch = globalThis.fetch;
const requests: Record<string, unknown>[] = [];
let fail = false;
const accounts = [
  { id: 'a', name: 'Checking', institutionId: 'bank', syncable: true },
  { id: 'b', name: 'Credit card', institutionId: 'credit', syncable: true },
  { id: 'c', name: 'Mortgage', institutionId: 'bank', syncable: false },
];
const institutions = [{ id: 'bank', name: 'Bank' }, { id: 'credit', name: 'Credit union' }];
const storageKey = 'test-account-preferences';

before(async () => {
  console.log('dom'); installDom();
  testing = await import('@testing-library/react');
  userEvent = (await import('@testing-library/user-event')).default;
  const components = await import('../src/components/accounts/AccountsWorkspace');
  console.log('components loaded'); Workspace = components.default;
  OrderedAccountRows = components.OrderedAccountRows;
  OrderedInstitutions = components.OrderedInstitutions;
  SyncButton = (await import('../src/components/transactions/SyncTransactionsButton')).default;
  AppRouterContext = createRequire(`${process.cwd()}/package.json`)('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterContext;
});
beforeEach(() => {
  window.localStorage.clear(); requests.length = 0; fail = false;
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    if (fail) throw new TypeError('Offline');
    return new Response(JSON.stringify({ imported_count: 4, skipped_count: 7, items: [{ institution_name: 'Bank', start_date: '2026-11-01', end_date: '2026-11-15', imported_count: 4, skipped_count: 7, note: 'Extra diagnostic detail' }] }), { status: 200 });
  };
});
afterEach(() => { testing.cleanup(); globalThis.fetch = originalFetch; });
function Institution({ orderId, children }: { orderId: string; children?: ReactNode }) {
  return createElement('section', { 'aria-label': orderId }, children);
}
function workspace() {
  const rows = (ids: string[]) => createElement('table', null, createElement(OrderedAccountRows, null, ids.map((id) => createElement('tr', { key: id, 'data-account-id': id }, createElement('td', null, accounts.find((account) => account.id === id)?.name)))));
  return createElement(Workspace, { storageKey, accounts, institutions }, createElement(OrderedInstitutions, null,
    createElement(Institution, { orderId: 'bank' }, rows(['a', 'c'])),
    createElement(Institution, { orderId: 'credit' }, rows(['b']))));
}
function render(child: ReactNode = workspace()) {
  return { ...testing.render(createElement(AppRouterContext.Provider, { value: router }, child)), user: userEvent.setup() };
}

test('sync group excludes balance-only accounts and saves the chosen IDs across remounts', async () => {
  console.log('rendering'); const { user, unmount } = render(); console.log('rendered');
  await user.click(testing.screen.getByRole('button', { name: 'Choose accounts' })); console.log('choose opened');
  assert.equal((testing.screen.getByRole('checkbox', { name: /Mortgage/ }) as HTMLInputElement).disabled, true);
  await user.click(testing.screen.getByRole('checkbox', { name: 'Credit card' }));
  await user.click(testing.screen.getByRole('button', { name: 'Save selection' })); console.log('selection saved');
  await testing.waitFor(() => assert.equal(testing.screen.queryByRole('dialog'), null));
  unmount();
  console.log('unmounted'); const next = render(); console.log('remounted');
  await next.user.click(testing.screen.getByRole('button', { name: 'Sync selected (1)' }));
  await testing.waitFor(() => assert.deepEqual(requests[0], { mode: 'latest', account_ids: ['a'] }));
  assert.equal(testing.screen.queryByText('Extra diagnostic detail'), null);
  assert.ok(testing.screen.getByRole('button', { name: 'Sync selected (1)' }));
  await next.user.click(testing.screen.getByRole('button', { name: 'Details' }));
  assert.ok(testing.screen.getByText('Extra diagnostic detail'));
});

test('empty selection disables sync and never falls back to syncing all accounts', async () => {
  const { user } = render();
  await user.click(testing.screen.getByRole('button', { name: 'Choose accounts' }));
  await user.click(testing.screen.getByRole('button', { name: 'Clear selection' }));
  await user.click(testing.screen.getByRole('button', { name: 'Save selection' }));
  await testing.waitFor(() => assert.equal((testing.screen.getByRole('button', { name: 'Sync selected (0)' }) as HTMLButtonElement).disabled, true));
  assert.equal(requests.length, 0);
});

test('arranging institutions and accounts changes the rendered order and survives remounts', async () => {
  const { user, unmount } = render();
  await user.click(testing.screen.getByRole('button', { name: 'Arrange' }));
  await user.click(testing.screen.getByRole('button', { name: 'Move Credit union up' }));
  await user.click(testing.screen.getByRole('button', { name: 'Move Mortgage up' }));
  await user.click(testing.screen.getByRole('button', { name: 'Save order' }));
  await testing.waitFor(() => assert.equal(testing.screen.queryByRole('dialog'), null));
  assert.deepEqual(testing.screen.getAllByRole('region').map((node) => node.getAttribute('aria-label')), ['credit', 'bank']);
  assert.deepEqual(testing.within(testing.screen.getByRole('region', { name: 'bank' })).getAllByRole('row').map((node) => node.textContent), ['Mortgage', 'Checking']);
  unmount(); render();
  assert.deepEqual(testing.screen.getAllByRole('region').map((node) => node.getAttribute('aria-label')), ['credit', 'bank']);
  assert.deepEqual(testing.within(testing.screen.getByRole('region', { name: 'bank' })).getAllByRole('row').map((node) => node.textContent), ['Mortgage', 'Checking']);
});

test('failed sync recovers and custom-date options preserve the selected account scope', async () => {
  fail = true;
  const { user } = render(createElement(SyncButton, { accountIds: ['a'], size: 'small', variant: 'outlined' }));
  await user.click(testing.screen.getByRole('button', { name: 'Sync transactions' }));
  await testing.waitFor(() => assert.ok(testing.screen.getByText('Unable to reach the server. Please try syncing again.')));
  fail = false;
  await user.click(testing.screen.getByRole('button', { name: 'Sync options' }));
  await user.click(testing.screen.getByRole('menuitem', { name: 'Sync from custom date' }));
  await user.type(testing.screen.getByLabelText('Start date'), '2026-10-01');
  await user.click(testing.screen.getByRole('button', { name: /^Sync$/ }));
  await testing.waitFor(() => assert.deepEqual(requests[1], { mode: 'custom', account_ids: ['a'], start_date: '2026-10-01' }));
});
