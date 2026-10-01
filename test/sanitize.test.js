// The `sanitize` option: a function applied to component templates (never module source) before they are stamped,
// at load time, so an async sanitizer works and `viewOf()` stays synchronous. linkedom is the DOM here; the real
// engines run it against @johnhenry/safe-fragment in test/browser/sanitize.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHTMLModules, defineHTMLComponent, renderDeclarative, hotReplaceComponent } from '../src/index.js';
import { setup, makeWindow, tick } from './helpers.js';

const MODULE = `<html-export name="card" props="label">
  <template><h2>{{label}}</h2><img src="x" onerror="boom()"><a href="javascript:boom()">go</a><slot></slot></template>
  <style>:host { display: block }</style>
</html-export>
<html-export name="plain"><template><p>plain</p></template></html-export>
<html-export name="meta"><script type="application/json">{"k": 1}</script></html-export>`;

/** A toy sanitizer: no on* attributes, no javascript: URLs. Returns a string. */
const strip = (html) => html.replace(/\son\w+="[^"]*"/g, '').replace(/href="javascript:[^"]*"/g, '');

const fragmentOf = (win, html) => {
  const t = win.document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const shadowHTML = (el) => el.shadowRoot.innerHTML;

async function mount(win, tag, attrs = {}) {
  const el = win.document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  win.document.body.append(el);
  await tick();
  return el;
}

test('the sanitizer gets each component template and a context; the module source is never sanitized', async () => {
  const calls = [];
  const { modules, window } = setup({ files: { 'ui.html': MODULE }, sanitize: (html, ctx) => { calls.push({ html, ctx, ...ctx }); return strip(html); } });
  const ns = await modules.load('./ui.html');
  assert.deepEqual(calls.map((c) => c.def.name).sort(), ['card', 'plain'], 'components only: no data export, no stylesheet, not the <html-export> source');
  const card = calls.find((c) => c.def.name === 'card');
  assert.match(card.html, /^<h2>\{\{label\}\}<\/h2><img src="x" onerror="boom\(\)">/, 'the raw template, binding included');
  assert.equal(card.url, 'http://modules.test/ui.html');
  assert.equal(card.window, window);
  assert.equal(card.def.shadow, 'open');
  assert.ok(Object.isFrozen(card.ctx) && Object.isFrozen(card.def));
  assert.equal(typeof card.report, 'function');
  assert.ok(ns.card && ns.plain && ns.meta, 'the module still has every export: html-export was not stripped');
  assert.equal(ns.card.template.includes('onerror'), false);
  assert.equal(ns.plain.template, '<p>plain</p>');
  assert.deepEqual(ns.meta, { k: 1 });
  assert.equal(ns.card.styles.length, 1, 'stylesheets are not touched (and not sanitized)');
});

test('a sanitized template is what gets stamped, and {{attr}} bindings survive a string result', async () => {
  const { modules, window } = setup({ files: { 'ui.html': MODULE }, sanitize: strip });
  await modules.import('./ui.html', { as: 'ui' });
  const el = await mount(window, 'ui--card', { label: 'Ada' });
  assert.match(shadowHTML(el), /<h2>Ada<\/h2>/);
  assert.doesNotMatch(shadowHTML(el), /onerror|javascript:/);
  el.setAttribute('label', 'Grace');
  assert.match(shadowHTML(el), /<h2>Grace<\/h2>/, 'the binding still patches');
});

test('a DocumentFragment result is stamped without being parsed again, and bindings survive it', async () => {
  const win = makeWindow();
  const parsed = [];
  const policy = { createHTML: (s) => { parsed.push(s); return s; } };
  const sanitize = (html, { window }) => {
    const fragment = fragmentOf(window, html);
    for (const el of fragment.querySelectorAll('*')) for (const a of [...el.attributes]) if (/^on/.test(a.name)) el.removeAttribute(a.name);
    return fragment;
  };
  const { modules } = setup({ window: win, files: { 'ui.html': MODULE }, sanitize, trustedTypes: policy });
  const ns = await modules.load('./ui.html');
  assert.equal(ns.card.template.nodeType, 11, 'the definition holds the fragment');
  const before = parsed.length; // (the module source was parsed once)
  assert.equal(before, 1);
  await modules.import('./ui.html', { as: 'ui' });
  const el = await mount(win, 'ui--card', { label: 'Ada' });
  assert.equal(parsed.length, before, 'no HTML sink was used to stamp it');
  assert.match(shadowHTML(el), /<h2>Ada<\/h2>/);
  assert.doesNotMatch(shadowHTML(el), /onerror/);
  el.setAttribute('label', 'Grace');
  assert.match(shadowHTML(el), /<h2>Grace<\/h2>/);
  const other = await mount(win, 'ui--card', { label: 'Lin' });
  assert.match(shadowHTML(other), /<h2>Lin<\/h2>/, 'a second element stamps a fresh copy');
  assert.match(shadowHTML(el), /<h2>Grace<\/h2>/);
});

test('a sanitizer that returns a fragment hands over ownership: later changes to it do not reach the component', async () => {
  const win = makeWindow();
  let kept;
  const { modules } = setup({ window: win, files: { 'ui.html': MODULE }, sanitize: (html, { window }) => (kept = fragmentOf(window, html)) });
  const ns = await modules.load('./ui.html');
  kept.firstChild.textContent = 'tampered'; // (`kept` is the last component's fragment: "plain" is sanitized after "card")
  const html = (f) => [...f.childNodes].map((n) => n.outerHTML ?? n.textContent).join('');
  assert.equal(html(ns.plain.template), '<p>plain</p>');
  assert.equal(html(ns.card.template).includes('tampered'), false);
});

test('an async sanitizer works: templates are sanitized at load time, before anything is registered', async () => {
  const order = [];
  const win = makeWindow();
  const { modules } = setup({
    window: win,
    files: { 'ui.html': MODULE },
    sanitize: async (html) => { order.push('start'); await tick(3); order.push('end'); return strip(html); },
  });
  const loading = modules.import('./ui.html', { as: 'ui' });
  assert.equal(win.customElements.get('ui--card'), undefined, 'nothing registered while sanitizing');
  await loading;
  assert.ok(win.customElements.get('ui--card'));
  assert.deepEqual(order.slice(0, 2), ['start', 'start'], 'components are sanitized concurrently');
  const el = await mount(win, 'ui--card', { label: 'x' });
  assert.doesNotMatch(shadowHTML(el), /onerror/);
});

test('TrustedHTML (anything with toString) is accepted; a string result still goes through the Trusted Types policy', async () => {
  const win = makeWindow();
  const seen = [];
  const policy = { createHTML: (s) => { seen.push(s); return s; } };
  class TrustedHTML { constructor(s) { this.s = s; } toString() { return this.s; } }
  const { modules } = setup({ window: win, files: { 'ui.html': MODULE }, sanitize: (html) => new TrustedHTML(strip(html)), trustedTypes: policy });
  const ns = await modules.load('./ui.html');
  assert.equal(typeof ns.card.template, 'string');
  await modules.import('./ui.html', { as: 'ui' });
  const el = await mount(win, 'ui--plain');
  assert.ok(seen.includes('<p>plain</p>'), 'the template is wrapped by the page policy when it is parsed');
  assert.equal(shadowHTML(el), '<p>plain</p>');
});

test('a sanitizer that throws, or returns something else, fails the load and registers nothing; the failure is not cached', async () => {
  let mode = 'throw';
  const { modules, window, events } = setup({
    files: { 'ui.html': MODULE },
    sanitize: (html) => { if (mode === 'throw') throw new Error('policy says no'); if (mode === 'null') return null; if (mode === 'number') return 42; return html; },
  });
  await assert.rejects(modules.import('./ui.html', { as: 'ui' }), /policy says no/);
  assert.equal(window.customElements.get('ui--card'), undefined);
  mode = 'null';
  await assert.rejects(modules.load('./ui.html'), /sanitize returned null for component "(?:card|plain)" of http:\/\/modules\.test\/ui\.html: return a string, a TrustedHTML or a DocumentFragment/);
  mode = 'number';
  await assert.rejects(modules.load('./ui.html'), /sanitize returned number/);
  assert.equal(events.filter((e) => e.type === 'error').length, 3, 'each failure is an error event');
  mode = 'ok';
  assert.ok((await modules.load('./ui.html')).card, 'a later load, with a working sanitizer, succeeds');
});

test('sanitize is validated', async () => {
  assert.throws(() => createHTMLModules({ sanitize: 'strip' }), /Invalid sanitize in createLoader\(\): pass a function/);
  const { modules } = setup({ files: { 'ui.html': MODULE } });
  await assert.rejects(modules.load('./ui.html', { sanitize: {} }), /Invalid sanitize in load\(\)/);
  await assert.rejects(modules.import('./ui.html', { as: 'ui', sanitize: 1 }), /Invalid sanitize in load\(\)/);
  assert.throws(() => { modules.sanitize = 'x'; }, /Invalid sanitize \(sanitize\)/);
  assert.throws(() => defineHTMLComponent({ name: 'x-y', template: 7 }), /pass a `template` string \(or a DocumentFragment\)/);
});

test('per-import sanitize overrides the instance default; false opts out; an unsanitized load is cached apart', async () => {
  const mine = (html) => html.replace(/<p>plain<\/p>/, '<p>mine</p>');
  const theirs = (html) => html.replace(/<p>plain<\/p>/, '<p>theirs</p>');
  const { modules, fetch } = setup({ files: { 'ui.html': MODULE }, sanitize: mine });
  const a = await modules.load('./ui.html');
  const b = await modules.load('./ui.html');
  assert.equal(a, b, 'the same sanitizer shares a cache entry');
  assert.equal(a.plain.template, '<p>mine</p>');
  const c = await modules.load('./ui.html', { sanitize: theirs });
  assert.equal(c.plain.template, '<p>theirs</p>');
  const d = await modules.load('./ui.html', { sanitize: false });
  assert.equal(d.plain.template, '<p>plain</p>', 'false: not even the instance default');
  assert.notEqual(a, d);
  assert.equal(fetch.log.length, 3, 'three variants, three fetches; the repeat was cached');
  assert.equal(modules.unload('./ui.html'), true);
  assert.equal([...modules.cache.keys()].length, 0, 'unload evicts every variant of the URL');
});

test('assigning HTMLModules.sanitize affects the loads that start afterwards', async () => {
  const { modules } = setup({ files: { 'ui.html': MODULE } });
  assert.equal(modules.sanitize, undefined);
  const raw = await modules.load('./ui.html');
  assert.match(raw.card.template, /onerror/);
  modules.sanitize = strip;
  assert.equal(modules.sanitize, strip);
  assert.equal(modules.loader.sanitize, strip);
  const clean = await modules.load('./ui.html');
  assert.doesNotMatch(clean.card.template, /onerror/);
  assert.match(raw.card.template, /onerror/, 'an earlier namespace is unchanged');
  modules.sanitize = false;
  assert.equal(modules.sanitize, undefined);
  assert.equal(await modules.load('./ui.html'), raw, 'back to the unsanitized cache entry');
});

test('the HTML modules a sanitized module imports are sanitized by the same function (also lazily)', async () => {
  const seen = [];
  const files = {
    'top.html': `<html-import src="./dep.html" as="dep"></html-import><html-export name="top"><template><dep--leaf></dep--leaf><i>top</i></template></html-export>`,
    'dep.html': `<html-export name="leaf"><template><b onclick="x()">leaf</b></template></html-export>`,
    'lazy-top.html': `<html-import src="./dep.html" as="dep" load="lazy"></html-import><html-export name="top"><template><i>t</i></template></html-export>`,
  };
  const { modules } = setup({ files, sanitize: (html, { url }) => { seen.push(url.split('/').pop()); return strip(html); } });
  await modules.load('./top.html');
  assert.deepEqual(seen.sort(), ['dep.html', 'top.html']);
  const dep = await modules.load('./dep.html');
  assert.doesNotMatch(dep.leaf.template, /onclick/, 'the dependency was cached sanitized');
  seen.length = 0;
  const lazy = await modules.load('./lazy-top.html', { sanitize: (html, { url }) => { seen.push(`other:${url.split('/').pop()}`); return strip(html); } });
  assert.deepEqual(seen, ['other:lazy-top.html'], 'a lazy dependency is not loaded yet');
  const [entry] = lazy.components.top.imports;
  const loaded = await entry.lazy();
  assert.doesNotMatch(loaded.leaf.template, /onclick/);
  assert.ok(seen.includes('other:dep.html'), 'and is sanitized by its importer\'s sanitizer when it is');
});

test('a sanitized module cannot pull in JavaScript: its <html-import src="*.js"> is refused', async () => {
  const files = {
    'top.html': `<html-import src="./x.js"><html-binding export="X" element="x-x"></html-binding></html-import><html-export name="top"><template>t</template></html-export>`,
    'reexport.html': `<html-export src="./x.js" name="x" import="X"></html-export>`,
  };
  const js = { 'x.js': { X: class extends globalThis.HTMLElement {} } };
  const { modules } = setup({ files, js });
  assert.ok((await modules.load('./top.html')).top, 'unsanitized, it loads');
  assert.ok(await modules.load('./x.js', { sanitize: strip }), 'a JavaScript module imported by the page itself is the page\'s business');
  await assert.rejects(modules.load('./top.html', { sanitize: strip }), /Refusing to import the JavaScript module http:\/\/modules\.test\/x\.js from a sanitized HTML module/);
  await assert.rejects(modules.load('./reexport.html', { sanitize: strip }), /Refusing to import the JavaScript module/);
});

test('the sanitizer reports through the event channel: onEvent, and html-modules:sanitize on the document', async () => {
  const { modules, events, window } = setup({
    files: { 'ui.html': MODULE },
    sanitize: (html, { report, def }) => { report({ removed: [`on* in ${def.name}`] }); return strip(html); },
  });
  const heard = [];
  window.document.addEventListener('html-modules:sanitize', (e) => heard.push(e.detail));
  await modules.load('./ui.html');
  const reports = events.filter((e) => e.type === 'sanitize');
  assert.equal(reports.length, 2);
  assert.deepEqual(reports.map((e) => e.name).sort(), ['card', 'plain']);
  assert.deepEqual(reports.find((e) => e.name === 'card'), { type: 'sanitize', url: 'http://modules.test/ui.html', name: 'card', details: { removed: ['on* in card'] } });
  assert.equal(heard.length, 2, 'the document hears it too, for pages that have no onEvent');
  assert.equal(events.findIndex((e) => e.type === 'sanitize') < events.findIndex((e) => e.type === 'load'), true, 'reports come before the load event');
});

test('<html-import>: the sanitize property applies to its module; setting it after loading started is an error event', async () => {
  const { window, modules } = setup({ files: { 'ui.html': MODULE }, elements: true });
  const el = window.document.createElement('html-import');
  el.setAttribute('src', './ui.html');
  el.setAttribute('as', 'ui');
  el.sanitize = strip;
  assert.equal(el.sanitize, strip);
  window.document.body.append(el);
  await el.ready;
  assert.doesNotMatch((await el.module).card.template, /onerror/);
  assert.ok(modules.cache.size === 1);
  const errors = [];
  el.addEventListener('error', (e) => errors.push(e.detail.error.message));
  el.sanitize = (h) => h;
  await tick();
  assert.match(errors[0], /<html-import sanitize> was set after loading started/);
  assert.equal(el.sanitize, strip, 'unchanged');
  assert.throws(() => { el.sanitize = 'no'; }, /Invalid sanitize on <html-import>/);
  const plain = window.document.createElement('html-import');
  plain.setAttribute('src', './ui.html');
  window.document.body.append(plain);
  await plain.ready;
  assert.match((await plain.module).card.template, /onerror/, 'another import of the same URL is not sanitized');
});

test('a sanitized and an unsanitized import of one module register different components (to different tags)', async () => {
  const { modules, window } = setup({ files: { 'ui.html': MODULE } });
  await modules.import('./ui.html', { as: 'raw' });
  await modules.import('./ui.html', { as: 'safe', sanitize: strip });
  const raw = await mount(window, 'raw--card', { label: 'a' });
  const safe = await mount(window, 'safe--card', { label: 'a' });
  assert.match(shadowHTML(raw), /onerror/);
  assert.doesNotMatch(shadowHTML(safe), /onerror/);
});

test('definitions can be made from a DocumentFragment; hot replacement compares fragments as trees', () => {
  const win = makeWindow();
  const make = (html) => defineHTMLComponent({ name: 'frag-card', template: fragmentOf(win, html) });
  const a = make('<p>one</p>');
  a.define('frag-card', { window: win });
  const el = win.document.createElement('frag-card');
  win.document.body.append(el);
  assert.equal(el.shadowRoot.innerHTML, '<p>one</p>');
  assert.equal(hotReplaceComponent(a, make('<p>one</p>')).ok, true);
  assert.equal(el.shadowRoot.innerHTML, '<p>one</p>', 'equal trees: nothing was re-stamped');
  assert.equal(hotReplaceComponent(a, make('<p>two</p>')).ok, true);
  assert.equal(el.shadowRoot.innerHTML, '<p>two</p>', 'different trees: re-stamped');
});

test('renderDeclarative serializes a fragment-backed template, and still refuses bindings', () => {
  const win = makeWindow();
  const def = defineHTMLComponent({ name: 'ssr-card', template: fragmentOf(win, '<p>hi</p>') });
  assert.equal(renderDeclarative(def, '<b>x</b>'), '<template shadowrootmode="open"><p>hi</p></template><b>x</b>');
  const bound = defineHTMLComponent({ name: 'ssr-bound', template: fragmentOf(win, '<p>{{n}}</p>') });
  assert.throws(() => renderDeclarative(bound), /has data bindings/);
});

test('the compiler is unchanged: a module compiles to its own, unsanitized, templates', async () => {
  const { compileHTMLModule } = await import('../src/index.js');
  assert.match(compileHTMLModule(MODULE, 'ui.html'), /onerror/);
});
