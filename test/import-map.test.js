import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveImportMap, compileImportMap, mergeImportMaps, importMapScript } from '../src/index.js';
import { basicRouter } from '../src/routers/index.js';

const base = 'https://app.example/';
const map = {
  imports: {
    react: 'https://esm.sh/react@19',
    'lodash/': 'https://esm.sh/lodash/',
    '@myorg/': '/vendor/myorg/',
    'lodash/fp': 'https://cdn.example/fp.js',
  },
  scopes: {
    'https://legacy.example.com/': { react: 'https://esm.sh/react@18' },
  },
};

test('exact and prefix matches', () => {
  assert.equal(resolveImportMap(map, 'react', { referrer: base }), 'https://esm.sh/react@19');
  assert.equal(resolveImportMap(map, 'lodash/debounce.js', { referrer: base }), 'https://esm.sh/lodash/debounce.js');
  assert.equal(resolveImportMap(map, 'lodash/fp', { referrer: base }), 'https://cdn.example/fp.js', 'longest key wins');
  assert.equal(resolveImportMap(map, '@myorg/foo.js', { referrer: base }), 'https://app.example/vendor/myorg/foo.js');
});

test('scopes route by referrer', () => {
  assert.equal(resolveImportMap(map, 'react', { referrer: 'https://legacy.example.com/a/b.js', mapBaseURL: base }), 'https://esm.sh/react@18');
  assert.equal(resolveImportMap(map, 'react', { referrer: 'https://other.example/x.js', mapBaseURL: base }), 'https://esm.sh/react@19');
});

test('relative/URL specifiers pass through; unmapped bare returns null', () => {
  assert.equal(resolveImportMap(map, './x.js', { referrer: 'https://app.example/a/b.js' }), 'https://app.example/a/x.js');
  assert.equal(resolveImportMap(map, 'https://x.example/y.js', { referrer: base }), 'https://x.example/y.js');
  assert.equal(resolveImportMap(map, 'vue', { referrer: base }), null);
});

test('URL keys remap absolute URLs', () => {
  const m = { imports: { 'https://esm.sh/react@19': 'https://mirror.example/react.js' } };
  assert.equal(resolveImportMap(m, 'https://esm.sh/react@19', { referrer: base }), 'https://mirror.example/react.js');
});

test('prefix targets must end with "/"', () => {
  assert.throws(() => resolveImportMap({ imports: { 'a/': 'https://x.example/a' } }, 'a/b', { referrer: base }), /must map to a URL ending/);
});

test('compileImportMap resolves through a router and returns lock data', async () => {
  const router = basicRouter({ routes: { '@std/*': 'https://jsr.example/', '*': 'https://esm.sh/' } });
  const { importMap, lock } = await compileImportMap(router, ['react@19', '@std/path', 'lit/'], {
    scopes: { 'https://legacy.example/': ['react@18'] },
  });
  assert.deepEqual(importMap, {
    imports: {
      'react@19': 'https://esm.sh/react@19',
      '@std/path': 'https://jsr.example/@std/path',
      'lit/': 'https://esm.sh/lit/',
    },
    scopes: { 'https://legacy.example/': { 'react@18': 'https://esm.sh/react@18' } },
  });
  assert.equal(lock.lockfileVersion, 1, "mport's lockfile format");
  assert.deepEqual(Object.keys(lock.packages), ['@std/path', 'https://legacy.example/ react@18', 'lit/', 'react@19'], 'sorted keys');
  assert.deepEqual(lock.packages['react@19'], { specifier: 'react@19', provider: 'esm.sh', url: 'https://esm.sh/react@19' });
  assert.equal(lock.packages['https://legacy.example/ react@18'].url, 'https://esm.sh/react@18');
});

test('compileImportMap: resolution keys, mport-style scopes, integrity, custom compile', async () => {
  const router = (s) => ({
    'react@^19': { url: 'https://esm.sh/react@19.2.0', key: 'react', registry: 'npm', name: 'react', range: '^19', version: '19.2.0', path: '', integrity: 'sha384-abc' },
    'lit/': { url: 'https://esm.sh/lit@3.3.1', base: 'https://esm.sh/lit@3.3.1/', key: 'lit/', registry: 'npm', name: 'lit', version: '3.3.1', path: '' },
    'react@18': { url: 'https://esm.sh/react@18.3.1', key: 'react', registry: 'npm', name: 'react', range: '18', version: '18.3.1', path: '' },
  })[s] ?? null;
  const { importMap, lock } = await compileImportMap(router, ['react@^19', 'lit/'], { scopes: { '/legacy/': { react: 'react@18' } } });
  assert.deepEqual(importMap, {
    imports: { react: 'https://esm.sh/react@19.2.0', 'lit/': 'https://esm.sh/lit@3.3.1/' },
    scopes: { '/legacy/': { react: 'https://esm.sh/react@18.3.1' } },
    integrity: { 'https://esm.sh/react@19.2.0': 'sha384-abc' },
  });
  assert.deepEqual(Object.keys(lock.packages), ['npm:lit@', 'npm:react@18', 'npm:react@^19']);
  assert.equal(lock.packages['npm:react@^19'].integrity, 'sha384-abc');
  const custom = await compileImportMap(router, ['lit/'], { compile: (resolved) => ({ imports: { n: String(resolved.length) } }) });
  assert.deepEqual(custom.importMap, { imports: { n: '1' } });
  await assert.rejects(compileImportMap(() => ({ url: 'https://x.example/a.js' }), ['a/']), /does not end in "\/"/);
});

test('compileImportMap rejects unresolvable specifiers', async () => {
  await assert.rejects(compileImportMap({ resolve: () => null }, ['x']), /could not resolve "x"/);
});

test('mergeImportMaps: later wins, scopes merge', () => {
  const merged = mergeImportMaps({ imports: { a: '1', b: '1' }, scopes: { s: { x: '1' } } }, { imports: { b: '2' }, scopes: { s: { y: '2' } } });
  assert.deepEqual(merged, { imports: { a: '1', b: '2' }, scopes: { s: { x: '1', y: '2' } } });
  assert.deepEqual(mergeImportMaps({ imports: { a: '1' } }), { imports: { a: '1' } });
  assert.deepEqual(mergeImportMaps({ imports: {}, integrity: { u: 'a' } }, { imports: {}, integrity: { u: 'b', v: 'c' } }).integrity, { u: 'b', v: 'c' });
});

test('importMapScript escapes "<"', () => {
  const out = importMapScript({ imports: { x: 'https://e.example/</script>' } });
  assert.match(out, /^<script type="importmap">/);
  assert.ok(!out.slice(10).includes('</script>\n}'));
  assert.ok(out.includes('\\u003c/script>'));
});
