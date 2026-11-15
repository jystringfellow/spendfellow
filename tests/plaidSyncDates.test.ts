import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSelectedAccountsSyncStartDate } from '../src/lib/plaidSyncDates';
const now = new Date('2026-11-15T12:00:00Z');

test('a selected account with older history is not skipped when its sibling synced recently', () => {
  assert.equal(getSelectedAccountsSyncStartDate(['2026-11-14T12:00:00Z', '2026-10-01T12:00:00Z'], { mode: 'latest' }, now), '2026-09-28');
});
test('an account without history receives the initial 30 day window', () => {
  assert.equal(getSelectedAccountsSyncStartDate(['2026-11-14T12:00:00Z', null], {}, now), '2026-10-16');
});
test('custom and last 30 day modes keep their explicit range', () => {
  assert.equal(getSelectedAccountsSyncStartDate(['2026-01-01'], { mode: 'last_30_days' }, now), '2026-10-16');
  assert.equal(getSelectedAccountsSyncStartDate(['2026-01-01'], { mode: 'custom', start_date: '2026-10-10' }, now), '2026-10-10');
});
