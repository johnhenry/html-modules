// Hot reload: registered classes delegate to a swappable definition, so live elements get a new template and
// styles in place. (linkedom has no constructable stylesheets, so styles are the <style> fallback here; the
// adopted-sheet swap, listeners and focus surviving a re-stamp are proven in test/browser/hot.spec.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHTMLModules, defineHTMLComponent, defineHTMLStylesheet, hotReplaceComponent, hotReplaceStylesheet, hotReplaceModule, adoptStylesheet } from '../src/index.js';
import { makeWindow, tick } from './helpers.js';

const ORIGIN = 'http://hot.test/';
function rig(files) {
  const win = makeWindow();
  const fetches = [];
  const modules = createHTMLModules({
    window: win, baseURL: ORIGIN,
    fetch: async (url, init) => {
      fetches.push([String(url), init]);
      const body = files[new URL(url).pathname];
      return body === undefined ? { ok: false, status: 404, text: async () => '' } : { ok: true, status: 200, text: async () => body };
    },
  });
  return { win, modules, files, fetches };
}
const card = (body, { head = '', extra = '' } = {}) => `<html-export name="hot-card" props="who" ${extra}>${head}<template>${body}</template></html-export>`;

test('hotReload: a template change re-stamps live elements in place and leaves their light DOM and classes alone', async () => {
  const r = rig({ '/c.html': card('<p>one: {{who}}</p>') });
  await r.modules.import('./c.html', { as: 'h' });
  const { document } = r.win;
  document.body.insertAdjacentHTML('beforeend', '<h--hot-card who="Ada"><i>light</i></h--hot-card>');
  const el = document.body.lastElementChild;
  const Class = r.win.customElements.get('h--hot-card');
  assert.equal(el.shadowRoot.querySelector('p').textContent, 'one: Ada');
  const root = el.shadowRoot;
  r.files['/c.html'] = card('<section>two: {{who}}</section>');
  const result = await r.modules.hotReload('./c.html');
  assert.deepEqual({ reload: result.reload, updated: result.updated, elements: result.elements }, { reload: false, updated: ['hotCard'], elements: 1 });
  assert.equal(el.shadowRoot, root, 'the same shadow root');
  assert.equal(root.querySelector('section').textContent, 'two: Ada', 'the new template, bound');
  assert.equal(root.querySelector('p'), null);
  assert.equal(el.firstElementChild.localName, 'i', 'light DOM untouched');
  assert.equal(r.win.customElements.get('h--hot-card'), Class, 'the registered class is the same');
  el.setAttribute('who', 'Grace');
  assert.equal(root.querySelector('section').textContent, 'two: Grace', 'bindings follow attributes after the swap');
  // New elements get the new definition too.
  document.body.insertAdjacentHTML('beforeend', '<h--hot-card who="Zed"></h--hot-card>');
  assert.equal(document.body.lastElementChild.shadowRoot.querySelector('section').textContent, 'two: Zed');
  assert.deepEqual(r.fetches.map(([u]) => u), [`${ORIGIN}c.html`, `${ORIGIN}c.html`]);
  assert.equal(r.fetches[1][1].cache, 'no-cache', 'a hot reload bypasses the HTTP cache');
  // And again: the slot keeps following the newest definition.
  r.files['/c.html'] = card('<em>three</em>');
  assert.equal((await r.modules.hotReload('./c.html')).reload, false);
  assert.equal(root.querySelector('em').textContent, 'three');
  // The replacement is the same component: registering it under the same tag again is not a conflict.
  const ns = await r.modules.load('./c.html');
  assert.doesNotThrow(() => ns.hotCard.define('h--hot-card', { window: r.win }));
});

test('hotReload: a style change swaps the styles without re-stamping', async () => {
  const r = rig({ '/s.html': card('<p>x</p>', { head: '<style>p{color:red}</style>' }) });
  await r.modules.import('./s.html', { as: 'h' });
  r.win.document.body.insertAdjacentHTML('beforeend', '<h--hot-card></h--hot-card>');
  const root = r.win.document.body.lastElementChild.shadowRoot;
  const p = root.querySelector('p');
  assert.match(root.querySelector('style').textContent, /color:red/);
  r.files['/s.html'] = card('<p>x</p>', { head: '<style>p{color:blue}</style>' });
  const result = await r.modules.hotReload('./s.html');
  assert.equal(result.reload, false);
  assert.equal(root.querySelector('p'), p, 'the template was not re-stamped');
  assert.equal(root.querySelectorAll('style').length, 1, 'the old styles are gone');
  assert.match(root.querySelector('style').textContent, /color:blue/);
});

test('hotReload: a stylesheet export is swapped wherever it was adopted, and later adoptions of the old sheet get the new one', async () => {
  const r = rig({ '/t.html': '<html-export name="theme"><style>a{color:red}</style></html-export>' });
  const first = await r.modules.load('./t.html');
  const root = r.win.document.body.attachShadow({ mode: 'open' });
  adoptStylesheet(root, first.theme, { window: r.win });
  assert.match(root.querySelector('style').textContent, /red/);
  r.files['/t.html'] = '<html-export name="theme"><style>a{color:green}</style></html-export>';
  const result = await r.modules.hotReload('./t.html');
  assert.deepEqual({ reload: result.reload, updated: result.updated, elements: result.elements }, { reload: false, updated: ['theme'], elements: 1 });
  assert.equal(root.querySelectorAll('style').length, 1);
  assert.match(root.querySelector('style').textContent, /green/);
  const other = r.win.document.createElement('div').attachShadow({ mode: 'open' });
  adoptStylesheet(other, first.theme, { window: r.win }); // the page still holds the old namespace
  assert.match(other.querySelector('style').textContent, /green/);
});

test('hotReload: what cannot be swapped under live elements asks for a reload, changing nothing', async () => {
  const cases = [
    [card('<p>x</p>', { extra: 'shadow="closed"' }), /shadow changed \("open" → "closed"\)/],
    [card('<p>{{newone}}</p>'), /new attribute "newone" cannot be observed on elements that are already defined/],
    [`${card('<p>x</p>')}<html-export name="added"><template>a</template></html-export>`, /exports changed \(\+added\)/],
    [card('<p>x</p>').replace('props="who"', 'props="who count:number"'), /new attribute "count" cannot be observed/],
    [card('<p>x</p>').replace('props="who"', 'props="who:number"'), /props "who" changed or are new: a property accessor is defined once per class/],
    [`<html-import src="./other.html" as="o"></html-import>${card('<p>x</p>')}`, /own imports changed/],
  ];
  for (const [source, reason] of cases) {
    const r = rig({ '/c.html': card('<p>x</p>'), '/other.html': '<html-export name="o"><template>o</template></html-export>' });
    await r.modules.import('./c.html', { as: 'h' });
    r.win.document.body.insertAdjacentHTML('beforeend', '<h--hot-card></h--hot-card>');
    const root = r.win.document.body.lastElementChild.shadowRoot;
    r.files['/c.html'] = source;
    const result = await r.modules.hotReload('./c.html');
    assert.equal(result.reload, true, source);
    assert.match(result.reasons.join('; '), reason, source);
    assert.equal(root.querySelector('p').textContent, 'x', 'nothing was swapped');
  }
  // Changed data is a reload too; unchanged data is not.
  const r = rig({ '/d.html': '<html-export name="cfg"><script type="application/json">{"a":1}</script></html-export>' });
  await r.modules.load('./d.html');
  assert.equal((await r.modules.hotReload('./d.html')).reload, false);
  r.files['/d.html'] = '<html-export name="cfg"><script type="application/json">{"a":2}</script></html-export>';
  assert.match((await r.modules.hotReload('./d.html')).reasons[0], /export "cfg" changed and is not a component or stylesheet/);
});

test('hotReload: a module that was never loaded is skipped; a broken edit rejects and keeps the old module live', async () => {
  const r = rig({ '/c.html': card('<p>x</p>') });
  assert.deepEqual(await r.modules.hotReload('./c.html'), { reload: false, reasons: [], updated: [], elements: 0, skipped: true });
  await r.modules.import('./c.html', { as: 'h' });
  r.win.document.body.insertAdjacentHTML('beforeend', '<h--hot-card></h--hot-card>');
  r.files['/c.html'] = '<html-export name="hot-card"></html-export>';
  await assert.rejects(r.modules.hotReload('./c.html'), /needs a <template>/);
  assert.equal(r.win.document.body.lastElementChild.shadowRoot.querySelector('p').textContent, 'x');
  assert.equal(r.modules.cache.size, 1, 'the old module is back in the cache');
  r.files['/c.html'] = card('<b>{{ a + b }}</b>');
  const bad = await r.modules.hotReload('./c.html');
  assert.equal(bad.reload, true, 'a binding error in the new template is a reason, not a half-applied swap');
  assert.match(bad.reasons[0], /Invalid binding/);
  await tick();
});

test('hotReplaceComponent / hotReplaceStylesheet / hotReplaceModule on definitions directly (what compiled modules use)', () => {
  const win = makeWindow();
  const a = defineHTMLComponent({ name: 'hr-a', template: '<p>a</p>' });
  a.define('hr-a', { window: win });
  win.document.body.insertAdjacentHTML('beforeend', '<hr-a></hr-a>');
  const el = win.document.body.lastElementChild;
  const b = defineHTMLComponent({ name: 'hr-a', template: '<p>b</p>' });
  assert.deepEqual(hotReplaceComponent(a, b), { ok: true, elements: 1 });
  assert.equal(el.shadowRoot.querySelector('p').textContent, 'b');
  assert.equal(win.customElements.get('hr-a').component, b);
  assert.deepEqual(hotReplaceComponent(b, defineHTMLComponent({ name: 'hr-a', template: 'x', shadow: 'closed' })), { ok: false, reason: 'shadow changed ("open" → "closed"): it is fixed when an element is created' });
  assert.equal(hotReplaceComponent(b, defineHTMLComponent(class extends win.HTMLElement {})).ok, false);
  assert.throws(() => hotReplaceStylesheet(1, 2), /both must be HTMLStylesheets/);
  assert.equal(hotReplaceStylesheet(defineHTMLStylesheet({ css: 'a{}' }), defineHTMLStylesheet({ css: 'b{}' })), 0, 'nothing adopted it');
  const same = defineHTMLComponent({ name: 'hr-b', template: 'b' });
  assert.deepEqual(hotReplaceModule({ b: same, components: { b: same } }, { b: same, components: { b: same } }), { reload: false, reasons: [], updated: [], elements: 0 });
});
