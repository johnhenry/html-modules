import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineModuleElements, createLoader, ModuleScope } from '../src/index.js';
import { fixtures, fileFetch, makeWindow } from './helpers.js';

function setup(opts = {}) {
  const win = makeWindow();
  const loader = createLoader({ baseURL: fixtures, fetch: fileFetch, window: win, ...opts });
  const scope = new ModuleScope();
  const defs = defineModuleElements({ window: win, loader, scope });
  const mount = (html) => {
    win.document.body.innerHTML = html;
    return win.document.body.firstElementChild;
  };
  return { win, loader, scope, mount, ...defs };
}

test('<module-import> loads a JS module, binds, and registers elements', async () => {
  const win = makeWindow();
  const ns = await import('./fixtures/ui.js');
  // Element classes must come from the same window; wrap the fixture exports.
  class Card extends win.HTMLElement {}
  const loader = { load: async () => ({ ...ns, Card }) };
  const scope = new ModuleScope();
  defineModuleElements({ window: win, loader, scope });
  win.document.body.innerHTML = `
    <module-import from="./ui.js" default="App">
      <module-binding name="Card" element="ui-card"></module-binding>
      <module-binding name="config" as="settings"></module-binding>
    </module-import>`;
  const imp = win.document.body.firstElementChild;
  const loaded = new Promise((r) => imp.addEventListener('load', (e) => r(e.detail)));
  const module = await imp.module;
  assert.equal(module.Card, Card);
  assert.equal(win.customElements.get('ui-card'), Card);
  assert.equal(scope.get('settings').theme, 'dark');
  assert.equal(scope.get('App'), ns.default);
  assert.deepEqual(Object.keys((await loaded).bindings), ['App', 'Card', 'settings']);
});

test('<module-import> from an HTML module: template → element, stylesheet adopt, namespace', async () => {
  const { win, scope, mount } = setup();
  const imp = mount(`
    <module-import from="./ui.html" namespace="UI">
      <module-binding name="Card" element="ui-card"></module-binding>
      <module-binding name="theme" adopt></module-binding>
    </module-import>`);
  await imp.module;
  assert.equal(scope.get('UI').config.size, 3);
  assert.match(win.document.head.innerHTML, /\.card \{ border/);
  win.document.body.insertAdjacentHTML('beforeend', '<ui-card>Hello</ui-card>');
  const card = win.document.querySelector('ui-card');
  assert.equal(card.shadowRoot.firstChild.localName, 'article');
});

test('side-effect-only import runs the module', async () => {
  const { mount } = setup();
  const before = globalThis.__setupRuns ?? 0;
  await mount('<module-import from="./setup.js"></module-import>').module;
  assert.equal(globalThis.__setupRuns, before + 1);
});

test('errors reject .module and fire an error event', async () => {
  const { mount } = setup();
  const imp = mount('<module-import from="./ui.js"><module-binding name="Missing"></module-binding></module-import>');
  const errored = new Promise((r) => imp.addEventListener('error', (e) => r(e.detail.error)));
  await assert.rejects(imp.module, /does not provide an export named 'Missing'/);
  assert.match((await errored).message, /Missing/);
});

test('defineModuleElements is idempotent and supports a prefix', () => {
  const win = makeWindow();
  const a = defineModuleElements({ window: win, loader: {} });
  const b = defineModuleElements({ window: win, loader: {} });
  assert.equal(a.ModuleImport, b.ModuleImport);
  const esm = defineModuleElements({ window: win, loader: {}, prefix: 'esm' });
  assert.equal(win.customElements.get('esm-import'), esm.ModuleImport);
  assert.ok(win.customElements.get('esm-binding'));
});
