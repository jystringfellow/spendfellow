import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const sourceScript = join(process.cwd(), 'scripts', 'migrate-linked-database.sh');

async function createFixture(linked: boolean) {
  const root = await mkdtemp(join(tmpdir(), 'spendfellow-linked-migration-'));
  const scriptDirectory = join(root, 'scripts');
  const binDirectory = join(root, 'bin');
  const callsFile = join(root, 'pnpm-calls.txt');
  await mkdir(scriptDirectory, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(scriptDirectory, 'migrate-linked-database.sh'), await readFile(sourceScript));
  await writeFile(
    join(binDirectory, 'pnpm'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${callsFile}"\n`
  );
  await chmod(join(binDirectory, 'pnpm'), 0o755);

  if (linked) {
    await mkdir(join(root, 'supabase', '.temp'), { recursive: true });
    await writeFile(join(root, 'supabase', '.temp', 'project-ref'), 'example-project');
  }

  return {
    callsFile,
    script: join(scriptDirectory, 'migrate-linked-database.sh'),
    environment: { ...process.env, PATH: `${binDirectory}:${process.env.PATH ?? ''}` },
  };
}

test('documents the guarded linked-database workflow', () => {
  const result = spawnSync('bash', [sourceScript, '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /pnpm db:migrate:linked/);
  assert.match(result.stdout, /typed confirmation/);
});

test('refuses to run without local Supabase link metadata', async () => {
  const fixture = await createFixture(false);
  const result = spawnSync('bash', [fixture.script], {
    encoding: 'utf8',
    env: fixture.environment,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not linked to a hosted Supabase project/);
});

test('previews but does not apply migrations without an interactive terminal', async () => {
  const fixture = await createFixture(true);
  const result = spawnSync('bash', [fixture.script], {
    encoding: 'utf8',
    env: fixture.environment,
    input: 'APPLY\n',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing to apply migrations without an interactive terminal/);
  assert.deepEqual((await readFile(fixture.callsFile, 'utf8')).trim().split('\n'), [
    'supabase migration list --linked',
    'db:push:dry-run',
  ]);
});
