import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from '../src/proxy';

test('protected pages redirect to setup instead of crashing without valid Supabase configuration', async (t) => {
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const [name, url, key] of [
      ['missing URL', undefined, 'test-key'],
      ['invalid URL', 'your_supabase_url', 'test-key'],
      ['missing key', 'https://example.supabase.co', undefined],
    ] as const) {
      await t.test(name, async () => {
        for (const variable of keys) delete process.env[variable];
        if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
        if (key) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
        const response = await proxy(new NextRequest('http://localhost:3000/accounts?view=all'));
        assert.equal(response.status, 307);
        const location = new URL(response.headers.get('location')!);
        assert.equal(location.pathname, '/login');
        assert.equal(location.searchParams.get('next'), '/accounts?view=all');
      });
    }
  } finally {
    for (const variable of keys) {
      if (original[variable] === undefined) delete process.env[variable];
      else process.env[variable] = original[variable];
    }
  }
});

test('setup checks cover protected pages while allowing login and public assets', () => {
  for (const url of ['/accounts', '/budgets', '/transactions', '/settings', '/auth/set-password', '/reports']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), true, url);
  }
  for (const url of ['/', '/login', '/spendfellow-logo.png', '/_next/static/chunk.js', '/auth/callback']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, url }), false, url);
  }
});
