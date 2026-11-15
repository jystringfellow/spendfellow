import assert from 'node:assert/strict';
import { before, beforeEach, afterEach, test } from 'node:test';
import { createElement } from 'react';
import { createRequire } from 'node:module';
import { installDom } from './support/dom';

let testing: typeof import('@testing-library/react');
let userEvent: typeof import('@testing-library/user-event').default;
let AccountNameEditor: typeof import('../src/components/accounts/AccountNameEditor').default;
let AccountBalanceCategorySelect: typeof import('../src/components/accounts/AccountBalanceCategorySelect').default;
let LinkedInstitutionCard: typeof import('../src/components/accounts/LinkedInstitutionCard').LinkedInstitutionCard;
let AppRouterContext: typeof import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterContext;
const originalFetch = globalThis.fetch;
let offline = true;
let saved: unknown;
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: 'test' };

before(async () => {
  installDom();
  testing = await import('@testing-library/react');
  userEvent = (await import('@testing-library/user-event')).default;
  AccountNameEditor = (await import('../src/components/accounts/AccountNameEditor')).default;
  AccountBalanceCategorySelect = (await import('../src/components/accounts/AccountBalanceCategorySelect')).default;
  LinkedInstitutionCard = (await import('../src/components/accounts/LinkedInstitutionCard')).LinkedInstitutionCard;
  AppRouterContext = createRequire(`${process.cwd()}/package.json`)('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterContext;
});
beforeEach(() => {
  offline = true;
  saved = undefined;
  globalThis.fetch = async (_url, options) => {
    if (offline) throw new TypeError('Network unavailable');
    saved = JSON.parse(String(options?.body));
    return new Response('{}', { status: 200 });
  };
});
afterEach(() => { testing.cleanup(); globalThis.fetch = originalFetch; });

function render(child: ReturnType<typeof createElement>) {
  testing.render(createElement(AppRouterContext.Provider, { value: router }, child));
  return userEvent.setup();
}

test('account rename keeps the draft after a network failure and allows retry', async () => {
  const user = render(createElement(AccountNameEditor, { accountId: 'account', name: 'Checking', officialName: null }));
  await user.click(testing.screen.getByRole('button', { name: 'Rename Checking' }));
  const input = testing.screen.getByLabelText('Account name');
  assert.equal(document.activeElement, input);
  await user.clear(input);
  await user.type(input, 'Everyday spending');
  await user.click(testing.screen.getByRole('button', { name: 'Save account name' }));
  await testing.waitFor(() => assert.ok(testing.screen.getByRole('alert')));
  assert.equal((input as HTMLInputElement).value, 'Everyday spending');
  offline = false;
  await user.click(testing.screen.getByRole('button', { name: 'Save account name' }));
  await testing.waitFor(() => assert.deepEqual(saved, { name: 'Everyday spending' }));
  await testing.waitFor(() => assert.equal(testing.screen.queryByLabelText('Account name'), null));
});

test('balance category recovers from network failure without leaving the control disabled', async () => {
  const user = render(createElement(AccountBalanceCategorySelect, { accountId: 'account', value: null, inferredValue: null }));
  await user.click(testing.screen.getByRole('combobox', { name: 'Balance category' }));
  await user.click(testing.screen.getByRole('option', { name: 'Not shown' }));
  await testing.waitFor(() => assert.ok(testing.screen.getByRole('alert')));
  assert.equal(testing.screen.getByRole('combobox').getAttribute('aria-disabled'), null);
  offline = false;
  await user.click(testing.screen.getByRole('combobox'));
  await user.click(testing.screen.getByRole('option', { name: 'Not shown' }));
  await testing.waitFor(() => assert.deepEqual(saved, { balance_category: 'hidden' }));
});

test('institution title toggles account details and exposes its expanded state', async () => {
  const user = render(createElement(LinkedInstitutionCard, { title: 'My bank', info: 'Sync details', status: 'Connected', summary: '2 accounts', children: createElement('p', null, 'Account details') }));
  const toggle = testing.screen.getByRole('button', { name: 'My bank' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(testing.screen.getByText('Connected'));
  await user.click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  await testing.waitFor(() => assert.equal(testing.screen.queryByText('Account details'), null));
  await user.click(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(testing.screen.getByText('Account details'));
});
