import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, esmSh, jsDelivr, jsr, fallback } from 'mport';
import { createLoader, basicRouter, chainRouters, fromMport, exportNames } from '../src/index.js';
import { fixtures, fileFetch, makeWindow, fakeFetch, registry } from './helpers.js';

const make = (opts = {}) => createLoader({ baseURL: fixtures, fetch: fileFetch, window: makeWindow(), ...opts });

test('loads JS modules with native import()', async () => {
  const loader = make();
  const ns = await loader.load('./ui.js');
  assert.equal(typeof ns.Card, 'function');
  assert.equal(ns.config.theme, 'dark');
});

test('loads HTML modules by extension and caches by URL', async () => {
  let fetches = 0;
  const loader = make({ fetch: (u) => (fetches++, fileFetch(u)) });
  const a = await loader.load('./ui.html');
  const b = await loader.load(new URL('ui.html', fixtures).href);
  assert.equal(a, b);
  assert.equal(fetches, 1);
  assert.equal(a.Card.localName, 'template');
});

test('HTML barrels re-export from HTML and JS', async () => {
  const loader = make();
  const barrel = await loader.load('./barrel.html');
  const ui = await loader.load('./ui.js');
  assert.deepEqual(exportNames(barrel), ['Button', 'Card', 'Local', 'Panel', 'config']);
  assert.equal(barrel.Button, ui.Button, 'same binding identity across languages');
  assert.equal(barrel.Card, ui.Card, 'export * from ui.js');
  assert.equal(barrel.Panel.localName, 'template', 'Card from ui.html re-exported as Panel');
});

test('circular HTML re-exports are detected', async () => {
  await assert.rejects(make().load('./cycle-a.html'), /Circular HTML module re-export: .*cycle-b\.html -> .*cycle-a\.html -> .*cycle-b\.html/);
  await assert.rejects(make().load('./cycle-self.html'), /Circular HTML module re-export: .*cycle-self\.html -> .*cycle-self\.html/);
});

test('circular HTML re-exports loaded concurrently reject instead of deadlocking', async () => {
  const loader = make();
  const settled = Promise.allSettled([loader.load('./cycle-a.html'), loader.load('./cycle-b.html')]);
  const timeout = new Promise((r) => setTimeout(() => r('timeout'), 1000).unref());
  const result = await Promise.race([settled, timeout]);
  assert.notEqual(result, 'timeout', 'loads must settle');
  for (const r of result) {
    assert.equal(r.status, 'rejected');
    assert.match(r.reason.message, /Circular HTML module re-export/);
  }
  // Failed loads are evicted, so a later attempt reports the cycle again rather than hanging.
  await assert.rejects(loader.load('./cycle-b.html'), /Circular/);
});

test('shared dependencies (diamonds) are not cycles, even when loaded concurrently', async () => {
  const loader = make();
  const [diamond, barrel, ui] = await Promise.all(['./diamond.html', './barrel.html', './ui.html'].map((s) => loader.load(s)));
  assert.equal(diamond.ui, ui, 'export * as ui');
  assert.equal(diamond.Panel, barrel.Panel);
  assert.equal(diamond.Panel, ui.Card);
});

test('HTML modules without a doctype or <html> wrapper', async () => {
  const ns = await make().load('./card.html');
  assert.deepEqual(exportNames(ns), ['default']);
  assert.equal(ns.default.localName, 'template');
});

test('explicit type overrides extension detection', async () => {
  const loader = make({ importModule: async (u) => ({ imported: u }) });
  const ns = await loader.load('./ui.html', undefined, { type: 'js' });
  assert.match(ns.imported, /ui\.html$/);
});

test('bare specifiers: importMap, then router, then hostResolve', async () => {
  const ui = new URL('ui.js', fixtures).href;
  const events = [];
  const loader = make({
    importMap: { imports: { pinned: ui } },
    router: basicRouter({ routes: { 'routed/*': (rest) => new URL(rest.slice('routed/'.length), fixtures).href } }),
    hostResolve: (s) => (s === 'hosted' ? ui : undefined),
    onEvent: (e) => events.push(e.type),
  });
  assert.equal((await loader.resolve('pinned')).provider, 'import-map');
  assert.equal((await loader.resolve('routed/ui.html')).url, new URL('ui.html', fixtures).href);
  assert.equal((await loader.resolve('hosted')).url, ui);
  await assert.rejects(loader.resolve('nowhere'), /Unable to resolve bare specifier "nowhere"/);
  const ns = await loader.load('routed/ui.html');
  assert.ok(ns.Card);
  assert.deepEqual(events, ['resolve', 'load']);
});

test('router-provided module (mport) is reused without re-importing', async () => {
  let imports = 0;
  const module = { fromRouter: true };
  const loader = make({
    router: { resolve: async () => ({ url: 'https://cdn.example/x.js', provider: 'cdn.example', module }) },
    importModule: async () => (imports++, {}),
  });
  assert.equal(await loader.load('x'), module);
  assert.equal(imports, 0);
});

test('failed loads are evicted from the cache and reported', async () => {
  const events = [];
  let fail = true;
  const loader = make({
    importModule: async () => { if (fail) throw new Error('boom'); return { ok: 1 }; },
    onEvent: (e) => events.push(e),
  });
  await assert.rejects(loader.load('./x.js'), /boom/);
  await new Promise((r) => setImmediate(r));
  assert.equal(events.at(-1).type, 'error');
  fail = false;
  assert.deepEqual(await loader.load('./x.js'), { ok: 1 });
});

test('HTML fetch errors surface', async () => {
  await assert.rejects(make().load('./missing.html'), /Failed to fetch HTML module .*missing\.html: 404/);
});

test('URL-like specifiers: import-map URL keys apply, and non-fetchable schemes reach the router', async () => {
  const loader = make({
    importMap: { imports: { 'https://esm.sh/react@19': 'https://mirror.example/react.js', './old.js': './new.js' } },
    router: basicRouter({ routes: { 'jsr:': (rest) => `https://jsr.example/${rest}/mod.js` } }),
  });
  assert.deepEqual(await loader.resolve('https://esm.sh/react@19'), { url: 'https://mirror.example/react.js', provider: 'import-map' });
  assert.equal((await loader.resolve('./old.js')).url, new URL('new.js', fixtures).href);
  assert.equal((await loader.resolve('./other.js')).url, new URL('other.js', fixtures).href, 'unmapped relative URLs pass through');
  assert.equal((await loader.resolve('jsr:@std/fs')).url, 'https://jsr.example/@std/fs/mod.js');
  assert.deepEqual(await loader.resolve('npm:nothing-claims-this'), { url: 'npm:nothing-claims-this' }, 'unclaimed schemes are used as-is');
  assert.deepEqual(await make({ router: () => 'https://routed.example/' }).resolve('https://x.example/a.js'), { url: 'https://x.example/a.js' }, 'fetchable URLs never reach the router');
});

test('npm: and jsr: specifiers resolve through mport v2 (mocked registry and probes)', async () => {
  const net = fakeFetch({ ...registry, 'https://esm.sh/jsr/*': 200, 'https://esm.sh/*': 503, 'https://cdn.jsdelivr.net/*': 200 });
  const mport = createRouter({ '*': fallback(esmSh(), jsDelivr({ esm: true })), '@std/*': jsr() }, { fetch: net });
  const imported = [];
  const events = [];
  const loader = make({
    importMap: { imports: { 'npm:lodash-es': 'https://pinned.example/lodash.js' } },
    router: chainRouters(
      basicRouter({ routes: { '@ui': () => new URL('ui.html', fixtures).href } }),
      fromMport(mport),
    ),
    importModule: async (url) => (imported.push(url), { url }),
    onEvent: (e) => events.push(e),
  });

  // The import map still wins over the router.
  assert.deepEqual(await loader.resolve('npm:lodash-es'), { url: 'https://pinned.example/lodash.js', provider: 'import-map' });

  // npm: → esm.sh answers 503, the fallback moves to jsDelivr's +esm build.
  const ns = await loader.load('npm:lodash-es@^4');
  assert.deepEqual(ns, { url: 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/+esm' });
  const resolved = events.find((e) => e.type === 'resolve' && e.specifier === 'npm:lodash-es@^4').resolution;
  assert.equal(resolved.provider, 'jsdelivr-esm');
  assert.equal(resolved.version, '4.17.21');
  assert.deepEqual(resolved.trace.map((e) => `${e.type}:${e.provider}`), [
    'lookup:npm registry', 'resolved:npm registry', 'probe:esm.sh', 'fail:esm.sh', 'probe:jsdelivr-esm', 'ok:jsdelivr-esm',
  ]);
  await new Promise((r) => setImmediate(r));
  assert.equal(events.find((e) => e.type === 'load' && e.specifier === 'npm:lodash-es@^4').provider, 'jsdelivr-esm');

  // jsr: → JSR metadata picks 1.1.0 (1.2.0 is yanked); jsr() serves it through esm.sh.
  assert.equal((await loader.resolve('jsr:@std/path@^1')).url, 'https://esm.sh/jsr/@std/path@1.1.0');

  // Static aliases in front of mport still load HTML modules; unknown schemes skip mport.
  assert.ok((await loader.load('@ui')).Card);
  assert.deepEqual(await loader.resolve('partial:x'), { url: 'partial:x' });
  assert.ok(!net.log.some((r) => r.url.includes('partial') || r.url.includes('@ui')));
  assert.deepEqual(imported.filter((u) => u.startsWith('https:')), ['https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/+esm']);
});

test('mport probe "import": the loader reuses the evaluated module; a signal aborts routing', async () => {
  const net = fakeFetch(registry, { delays: { 'https://registry.npmjs.org/': 1000 } });
  let evaluated = 0;
  const router = fromMport(createRouter({ '*': esmSh() }, {
    fetch: net,
    probe: 'import',
    importer: async (url) => (evaluated++, { from: url }),
  }));
  let imports = 0;
  const loader = make({ router, importModule: async () => (imports++, {}) });
  const ns = await loader.load('npm:react@19.2.0');
  assert.deepEqual(ns, { from: 'https://esm.sh/react@19.2.0' });
  assert.equal(evaluated, 1);
  assert.equal(imports, 0, 'importModule is not called for a module mport already evaluated');

  const ac = new AbortController();
  const pending = loader.load('react@^19', undefined, { signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(pending, /abort/i);
});
