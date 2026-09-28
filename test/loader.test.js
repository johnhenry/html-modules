import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, basicRouter, exportNames } from '../src/index.js';
import { fixtures, fileFetch, makeWindow } from './helpers.js';

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
  await assert.rejects(make().load('./cycle-a.html'), /Circular HTML module re-export/);
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
