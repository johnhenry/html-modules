import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, exportNames } from '../src/index.js';
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

test('bare specifiers resolve through hostResolve', async () => {
  const loader = make({ hostResolve: (s) => (s === 'ui' ? new URL('ui.html', fixtures).href : null) });
  assert.equal((await loader.resolve('ui')).url, new URL('ui.html', fixtures).href);
  await assert.rejects(loader.resolve('nope'), /Unable to resolve bare specifier/);
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
