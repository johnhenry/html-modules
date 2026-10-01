// The shipped declarations (types/) are generated from the JSDoc in src/ (`npm run types`): they must not drift, every
// entry point must have a "types" condition that exists, and a typed consumer must compile (npm run types:check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const tsc = join(root, 'node_modules/typescript/bin/tsc');

test('every JavaScript entry point has a "types" condition pointing at a file that ships', async () => {
  const entries = Object.entries(pkg.exports).filter(([key]) => key !== './package.json');
  assert.deepEqual(entries.map(([key]) => key), ['.', './browser', './runtime', './compiler', './dev', './vite']);
  for (const [key, condition] of entries) {
    assert.ok(condition.types?.endsWith('.d.ts'), `${key} has a types condition`);
    assert.ok(Object.keys(condition)[0] === 'types', `${key}: "types" comes first, as TypeScript requires`);
    await readFile(join(root, condition.types)); // throws if missing
  }
  assert.equal(pkg.types, './types/index.d.ts');
  assert.ok(pkg.files.includes('types'));
});

test('types/ is up to date with the JSDoc in src/ (run: npm run types)', async () => {
  const out = await mkdtemp(join(tmpdir(), 'html-modules-types-'));
  execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.types.json'), '--outDir', out], { cwd: root });
  const [fresh, committed] = await Promise.all([readdir(out), readdir(join(root, 'types'))]);
  assert.deepEqual(committed.sort(), fresh.sort(), 'the same declaration files');
  for (const file of fresh) assert.equal(await readFile(join(root, 'types', file), 'utf8'), await readFile(join(out, file), 'utf8'), `types/${file} is stale`);
});

test('a typed consumer of every entry point compiles under strict mode (npm run types:check)', () => {
  execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.usage.json')], { cwd: root, stdio: 'pipe' });
});
