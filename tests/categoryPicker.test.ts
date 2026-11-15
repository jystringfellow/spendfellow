import assert from 'node:assert/strict';
import { afterEach, before, test } from 'node:test';
import { installDom } from './support/dom';
import { createRequire } from 'node:module';
import { createElement, useState } from 'react';

let testing: typeof import('@testing-library/react');
let userEvent: typeof import('@testing-library/user-event').default;
let CategoryPicker: typeof import('../src/components/transactions/CategoryPicker').default;
let createAgent: typeof import('@ui-sdk/react/agent').createAgent;
let ThemeProvider: typeof import('@mui/material/styles').ThemeProvider;
let createAppTheme: typeof import('../src/app/theme').createAppTheme;
const categories = [{ id: 'groceries', name: 'Groceries' }, { id: 'rent', name: 'Rent' }, { id: 'travel', name: 'Travel' }];

before(async () => {
  installDom();
  testing = await import('@testing-library/react');
  userEvent = (await import('@testing-library/user-event')).default;
  CategoryPicker = (await import('../src/components/transactions/CategoryPicker')).default;
  createAgent = createRequire(`${process.cwd()}/package.json`)('@ui-sdk/react/agent').createAgent;
  ThemeProvider = (await import('@mui/material/styles')).ThemeProvider;
  createAppTheme = (await import('../src/app/theme')).createAppTheme;
});

afterEach(() => testing.cleanup());

function mount({ initial = 'groceries', disabled = false, mode = 'dark' as 'dark' | 'light' } = {}) {
  const changes: string[] = [];
  function Example() {
    const [value, setValue] = useState(initial);
    return createElement(ThemeProvider, { theme: createAppTheme(mode) },
      createElement(CategoryPicker, { categories, label: 'Review category', value, disabled,
        onChange: (next) => { changes.push(next); setValue(next); } }));
  }
  testing.render(createElement(Example));
  return { changes, user: userEvent.setup(), input: testing.screen.getByRole('combobox', { name: 'Review category' }) as HTMLInputElement };
}

test('typing filters without changing the draft; Enter selects the category ID', async () => {
  const { changes, user, input } = mount();
  assert.equal(input.value, 'Groceries');
  await user.clear(input);
  await user.type(input, 'Rent');
  assert.deepEqual(changes, []);
  await testing.waitFor(() => assert.ok(testing.screen.getByRole('option', { name: 'Rent' })));
  await user.keyboard('{Enter}');
  assert.deepEqual(changes, ['rent']);
  assert.equal(input.value, 'Rent');
  assert.equal(input.getAttribute('aria-expanded'), 'false');
});

test('Escape restores the selected label and focus without changing the draft', async () => {
  const { changes, user, input } = mount();
  await user.clear(input);
  await user.type(input, 'no-such-category');
  await testing.waitFor(() => assert.ok(testing.screen.getByText('No matching categories.')));
  await user.keyboard('{Escape}');
  assert.equal(input.value, 'Groceries');
  assert.equal(document.activeElement, input);
  assert.deepEqual(changes, []);
});

test('Uncategorized preserves the empty category ID used by transaction saves', async () => {
  const { changes, user, input } = mount({ mode: 'light' });
  await user.clear(input);
  await user.type(input, 'Uncategorized');
  await user.keyboard('{Enter}');
  assert.deepEqual(changes, ['']);
  assert.equal(input.value, 'Uncategorized');
});

test('disabled bulk controls cannot be edited', async () => {
  const { changes, user, input } = mount({ disabled: true });
  assert.equal(input.disabled, true);
  await user.type(input, 'Rent');
  assert.equal(input.value, 'Groceries');
  assert.deepEqual(changes, []);
});

test('the agent bridge finds the picker by name and updates the same draft callback', async () => {
  const agent = createAgent();
  const { changes, input } = mount();
  const entry = agent.snapshot().find((component) => !component.offPage && component.label === 'Review category');
  assert.ok(entry, 'Picker has an accessible, agent-readable name');
  assert.ok(entry.actions.includes('setValue'));
  await testing.act(async () => {
    await agent.act({ steps: [{ ref: entry.ref, action: 'setValue', args: ['Rent'] }] });
  });
  assert.deepEqual(changes, ['rent']);
  assert.equal(input.value, 'Rent');
});


test('arrow keys and pointer selection update only the chosen category', async () => {
  const { changes, user, input } = mount();
  await user.click(testing.screen.getByRole('button', { name: 'Show options for Review category' }));
  await user.keyboard('{ArrowDown}{ArrowUp}{ArrowDown}{Enter}');
  assert.equal(changes.length, 1);
  await user.click(testing.screen.getByRole('button', { name: 'Show options for Review category' }));
  await user.click(testing.screen.getByRole('option', { name: 'Travel' }));
  assert.equal(changes.at(-1), 'travel');
  assert.equal(input.value, 'Travel');
});

test('Escape closes the picker before the surrounding categorization dialog', async () => {
  const { Dialog, DialogTitle, DialogContent } = await import('@mui/material');
  let closeCount = 0;
  testing.render(createElement(ThemeProvider, { theme: createAppTheme('dark') },
    createElement(Dialog, { open: true, onClose: () => { closeCount += 1; } },
      createElement(DialogTitle, null, 'Review transaction'),
      createElement(DialogContent, null,
        createElement(CategoryPicker, { categories, label: 'Dialog category', value: 'groceries', onChange: () => {} })))));
  const input = testing.screen.getByRole('combobox', { name: 'Dialog category' });
  const user = userEvent.setup();
  await user.clear(input);
  await user.type(input, 'Rent');
  await user.keyboard('{Escape}');
  assert.equal(closeCount, 0);
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, input);
});
