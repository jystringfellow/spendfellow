import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const environment = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'smoke-test-publishable-key',
  SUPABASE_SECRET_KEY: 'smoke-test-secret-key',
};
const build = spawn(process.execPath, [nextBin, 'build'], { env: environment, stdio: 'inherit' });
const [buildCode] = await once(build, 'exit');
assert.equal(buildCode, 0, 'Production build succeeds');

const server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', '0'], {
  env: environment,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.setEncoding('utf8');
server.stderr.setEncoding('utf8');
server.stdout.on('data', (chunk) => { output += chunk; });
server.stderr.on('data', (chunk) => { output += chunk; });

try {
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Production server did not start.\n${output}`)), 30_000);
    const checkReady = () => {
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url && output.includes('Ready in')) {
        clearTimeout(timeout);
        resolve(url);
      }
    };
    server.stdout.on('data', checkReady);
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Production server exited (${code}).\n${output}`)); });
  });

  async function request(path, options = {}) {
    return fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(10_000), ...options });
  }

  for (const mode of ['dark', 'light']) {
    const response = await request('/', { headers: { cookie: `spendfellow-color-mode=${mode}` } });
    assert.equal(response.status, 200, `${mode} home status`);
    const html = await response.text();
    assert.match(html, /Categorize transactions/);
    assert.match(html, /aria-label="Main navigation"/);
    assert.ok(html.includes(`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`), `${mode} theme cookie is read during rendering`);
  }

  const login = await request('/login?error=framework-smoke-check');
  assert.equal(login.status, 200);
  assert.match(await login.text(), /framework-smoke-check/);

  for (const path of ['/accounts', '/budgets?year=2026&sheet=jan', '/transactions?q=smoke&page=2', '/settings?year=2026&month=2', '/reports', '/auth/set-password?invitation=smoke']) {
    const response = await request(path);
    assert.equal(response.status, 307, `${path} redirects without a session`);
    assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login', `${path} redirects to login`);
  }

  const routes = [
    ['PATCH', '/api/accounts/smoke', { name: 'Smoke test' }],
    ['PATCH', '/api/transactions/smoke', {}],
    ['PATCH', '/api/manual-transactions/smoke', {}],
    ['DELETE', '/api/manual-transactions/smoke'],
    ['DELETE', '/api/plaid/items/smoke'],
    ['DELETE', '/api/credit-card-payment-links/smoke'],
    ['DELETE', '/api/transaction-budget-exclusions/smoke'],
    ['DELETE', '/api/fun-money-adjustments/smoke'],
    ['DELETE', '/api/household-invitations/smoke'],
    ['DELETE', '/api/household-members/smoke'],
  ];
  for (const [method, path, body] of routes) {
    const response = await request(path, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, 401, `${method} ${path} rejects requests without a session`);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  console.log('Production smoke checks passed: both themes, login query errors, protected page redirects, and all dynamic API handlers without a session.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const forceStop = setTimeout(() => server.kill('SIGKILL'), 5_000);
    await exited;
    clearTimeout(forceStop);
  }
}
