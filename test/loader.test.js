// Runtime loading, the module cache, dependencies and the programmatic API (PRD §15, §16, §20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHTMLComponent, isHTMLStylesheet } from '../src/index.js';
import { setup, fixtures, tick, ORIGIN, makeWindow } from './helpers.js';

const at = (path) => new URL(path, fixtures).href;

test('HTMLModules.load(): a namespace of definitions shaped like a compiled module', async () => {
  const { modules } = setup();
  const ui = await modules.load(at('ui.html'));
  assert.equal(Object.prototype.toString.call(ui), '[object Module]');
  assert.ok(Object.isFrozen(ui));
  assert.deepEqual(Object.keys(ui), ['components', 'config', 'customCard', 'default', 'fancyButton', 'note', 'theme']);
  const { customCard, fancyButton } = ui; // PRD §20
  assert.ok(isHTMLComponent(customCard) && isHTMLComponent(fancyButton));
  assert.equal(customCard.name, 'custom-card');
  assert.equal(customCard.url, at('ui.html'));
  assert.ok(isHTMLStylesheet(ui.theme));
  assert.deepEqual(ui.config, { size: 3, brand: 'Acme' });
  assert.equal(ui.default, ui.note);
  assert.deepEqual(Object.keys(ui.components), ['custom-card', 'fancy-button', 'note']);
});

test('the cache: one fetch and parse per resolved URL, shared by concurrent loads (§16)', async () => {
  const { modules, fetch } = setup();
  const [a, b] = await Promise.all([modules.load(at('ui.html')), modules.load('./fixtures/ui.html', { base: new URL('../', fixtures).href })]);
  const c = await modules.load(at('ui.html'));
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(fetch.log.filter((u) => u.endsWith('/ui.html')).length, 1);
  assert.ok(modules.cache.has(`html:${at('ui.html')}`));
  assert.ok(modules.cache.get(`html:${at('ui.html')}`) instanceof Promise);
});

test('failed loads are evicted and can be retried; events report fetch, load and error', async () => {
  const files = { 'flaky.html': 503 };
  const { modules, events } = setup({ files });
  await assert.rejects(modules.load('./flaky.html'), /Failed to fetch HTML module http:\/\/modules\.test\/flaky\.html: 503/);
  await tick();
  assert.equal(modules.cache.has(`html:${ORIGIN}flaky.html`), false);
  files['flaky.html'] = '<html-export name="ok"><template>ok</template></html-export>';
  const { modules: again } = setup({ files });
  assert.ok((await again.load('./flaky.html')).ok);
  assert.deepEqual(events.map((e) => e.type), ['fetch', 'error']);
});

test('resolution: relative to the importer; bare specifiers through hostResolve (the page import map)', async () => {
  const { modules } = setup({ hostResolve: (s) => (s === '@acme/ui' ? at('ui.html') : null) });
  assert.equal(modules.resolve('./x.html', 'http://a.test/dir/page.html'), 'http://a.test/dir/x.html');
  assert.equal(modules.resolve('https://cdn.test/ui.html'), 'https://cdn.test/ui.html');
  assert.ok((await modules.load('@acme/ui')).customCard);
  assert.throws(() => modules.resolve('@nope/ui'), /Unable to resolve bare specifier "@nope\/ui"/);
});

test('modules import modules: dependencies resolve relative to the importing module and load first', async () => {
  const { modules, fetch } = setup();
  const profile = await modules.load(at('profile.html'));
  const def = profile.userProfile;
  assert.deepEqual(def.imports.map((i) => [i.from, i.as, i.bindings]), [['./icons.html', 'icon', []], ['./ui.html', undefined, [{ export: 'theme', adopt: true }]]]);
  assert.equal(def.imports[0].module, await modules.load(at('icons.html')));
  assert.deepEqual(fetch.log.map((u) => u.split('/').pop()).sort(), ['icons.html', 'profile.html', 'ui.html']);
});

test('re-exports (barrels): every component, one renamed, from HTML or JS; locals win', async () => {
  const { modules } = setup();
  const [barrel, ui, widgets] = await Promise.all([at('barrel.html'), at('ui.html'), at('widgets.js')].map((u) => modules.load(u)));
  assert.equal(barrel.button, ui.fancyButton, 'identity is preserved: the same definition');
  assert.equal(barrel.fancyButton, ui.fancyButton);
  assert.equal(barrel.counter, widgets.Counter);
  assert.equal(barrel.settings, ui.config);
  assert.notEqual(barrel.customCard, ui.customCard, 'a local export shadows a star export');
  assert.equal(barrel.default, undefined, 'star re-exports never include default');
  assert.deepEqual(Object.keys(barrel.components).sort(), ['button', 'counter', 'custom-card', 'fancy-button', 'note']);
  assert.equal('theme' in barrel.components, false);
});

test('star re-exports: names two sources disagree on are left out, like ESM', async () => {
  const { modules } = setup({
    files: {
      'a.html': '<html-export name="config"><script type="application/json">1</script></html-export>',
      'b.html': '<html-export name="config"><script type="application/json">2</script></html-export>',
      'both.html': '<html-export src="./a.html"></html-export><html-export src="./b.html"></html-export>',
      'c1.html': '<html-export name="x-card"><template>1</template></html-export>',
      'c2.html': '<html-export name="x-card"><template>2</template></html-export>',
      'clash.html': '<html-export src="./c1.html"></html-export><html-export src="./c2.html"></html-export>',
    },
  });
  assert.equal('config' in (await modules.load('./both.html')), false);
  await assert.rejects(modules.load('./clash.html'), /Conflicting star exports for 'x-card'/);
});

test('JS modules load with native import(); definitions in the same module share identity', async () => {
  const { modules } = setup();
  const widgets = await modules.load(at('widgets.js'));
  assert.equal(widgets, await import('./fixtures/widgets.js'));
});

test('dependency errors: missing modules, missing re-exported names, cycles', async () => {
  const { modules } = setup({
    files: {
      'missing-dep.html': '<html-import src="./nowhere.html" as="n"></html-import>',
      'missing-name.html': '<html-export src="./ui.html" name="nope"></html-export>',
      'ui.html': '<html-export name="card"><template>x</template></html-export>',
      'self.html': '<html-export src="./self.html"></html-export>',
    },
  });
  await assert.rejects(modules.load('./missing-dep.html'), /Failed to fetch HTML module .*nowhere\.html: 404/);
  await assert.rejects(modules.load('./missing-name.html'), { name: 'SyntaxError', message: "The requested module './ui.html' does not provide an export named 'nope'" });
  await assert.rejects(modules.load('./self.html'), /Circular HTML module dependency: .*self\.html -> .*self\.html/);
  await assert.rejects(setup().modules.load(at('cycle-a.html')), /Circular HTML module dependency: .*cycle-b\.html -> .*cycle-a\.html -> .*cycle-b\.html/);
});

test('concurrent loads of a cycle reject instead of deadlocking', async () => {
  const { modules } = setup();
  const results = await Promise.allSettled([modules.load(at('cycle-a.html')), modules.load(at('cycle-b.html'))]);
  assert.ok(results.every((r) => r.status === 'rejected'));
  assert.ok(results.some((r) => /Circular/.test(r.reason.message)));
});

test('HTMLModules.import(): load and bind in one step, like <html-import>', async () => {
  const { modules, window } = setup();
  const { module, elements } = await modules.import(at('ui.html'), { as: 'api' });
  assert.deepEqual(Object.keys(elements).sort(), ['api--custom-card', 'api--fancy-button', 'api--note']);
  assert.equal(window.customElements.get('api--custom-card').component, module.customCard);
  const picked = await modules.import(at('ui.html'), { as: 'pick', bindings: [{ export: 'fancy-button', element: 'buy-button' }, { export: 'config' }, { export: 'theme', adopt: true }] });
  assert.deepEqual(Object.keys(picked.elements), ['buy-button']);
  assert.equal(picked.values.config.brand, 'Acme');
  assert.equal(window.document.head.querySelectorAll('style[data-html-module="theme"]').length, 1);
  assert.equal(window.customElements.get('pick--custom-card'), undefined, 'selective bindings register nothing else');
});

test('HTMLModules.bind() and definition.define() on a loaded module', async () => {
  const { modules, window } = setup();
  const ui = await modules.load(at('ui.html'));
  modules.bind(ui, { as: 'late' });
  assert.ok(window.customElements.get('late--note'));
  const Mine = ui.customCard.define('my-custom-card', { window });
  assert.equal(window.customElements.get('my-custom-card'), Mine);
});

// ---- Security: integrity, credentials, mode -------------------------------------------------------------------

import { createHash } from 'node:crypto';
const SRI = (alg, text) => `${alg}-${createHash(alg).update(text).digest('base64')}`;

test('integrity: the fetched bytes are checked with SubtleCrypto; a mismatch rejects and is evicted', async () => {
  const body = '<html-export name="ok"><template>ok</template></html-export>';
  const { modules } = setup({ files: { 'ok.html': body } });
  assert.ok((await modules.load('./ok.html', { integrity: SRI('sha384', body) })).ok);
  await assert.rejects(modules.load('./ok.html', { integrity: SRI('sha384', 'something else') }), /Integrity check failed for HTML module http:\/\/modules\.test\/ok\.html: its sha384 digest is sha384-.* matches none of integrity=/);
  // The strongest algorithm decides, any of its digests may match, and several tokens are space-separated.
  assert.ok((await modules.load('./ok.html', { integrity: `${SRI('sha256', 'nope')} ${SRI('sha512', body)} ${SRI('sha512', 'also nope')}` })).ok);
  await assert.rejects(modules.load('./ok.html', { integrity: `${SRI('sha256', body)} ${SRI('sha512', 'nope')}` }), /Integrity check failed/);
});

test('integrity: an unverified cached copy does not satisfy a load that asks for it', async () => {
  const body = '<html-export name="ok"><template>ok</template></html-export>';
  const { modules, fetch } = setup({ files: { 'ok.html': body } });
  await modules.load('./ok.html');
  await assert.rejects(modules.load('./ok.html', { integrity: SRI('sha256', 'wrong') }), /Integrity check failed/);
  assert.equal(fetch.log.length, 2, 'fetched again to verify');
});

test('integrity: malformed metadata is a SyntaxError, and a JavaScript module cannot be verified', async () => {
  const { modules } = setup({ files: { 'ok.html': '<html-export name="ok"><template>ok</template></html-export>' } });
  await assert.rejects(modules.load('./ok.html', { integrity: 'md5-abc' }), (e) => e instanceof SyntaxError && /Invalid integrity "md5-abc"/.test(e.message));
  await assert.rejects(modules.load('./x.js', { integrity: SRI('sha256', 'x') }), /integrity applies to HTML modules only/);
});

test('integrity: <html-import integrity> and a module import record carry it to the loader', async () => {
  const dep = '<html-export name="b"><template>b</template></html-export>';
  const host = `<html-import src="./dep.html" as="dep" integrity="${SRI('sha256', dep)}"></html-import>`;
  const ok = setup({ files: { 'dep.html': dep, 'host.html': host } });
  assert.ok(await ok.modules.load('./host.html'));
  const bad = setup({ files: { 'dep.html': `${dep} `, 'host.html': host } });
  await assert.rejects(bad.modules.load('./host.html'), /Integrity check failed for HTML module http:\/\/modules\.test\/dep\.html/);
  const page = setup({ elements: true, files: { 'dep.html': `${dep}  ` } });
  page.document.body.innerHTML = `<html-import src="./dep.html" as="d" integrity="${SRI('sha256', dep)}"></html-import>`;
  await assert.rejects(page.document.querySelector('html-import').ready, /Integrity check failed/);
});

test('credentials and mode reach fetch for HTML modules: instance defaults, overridden per load', async () => {
  const { modules, fetch } = setup({ files: { 'a.html': '<html-export name="a"><template>a</template></html-export>', 'b.html': '<html-export name="b"><template>b</template></html-export>' }, credentials: 'include', mode: 'cors' });
  await modules.load('./a.html');
  await modules.load('./b.html', { credentials: 'omit', mode: 'same-origin' });
  assert.deepEqual(fetch.inits, [{ credentials: 'include', mode: 'cors' }, { credentials: 'omit', mode: 'same-origin' }]);
  const plain = setup({ files: { 'a.html': '<html-export name="a"><template>a</template></html-export>' } });
  await plain.modules.load('./a.html');
  assert.deepEqual(plain.fetch.inits, [undefined], 'no options: fetch(url) as before');
  assert.throws(() => setup({ credentials: 'always' }), /Invalid credentials="always" in createLoader\(\): use "omit" or "same-origin" or "include"/);
  await assert.rejects(modules.import('./a.html', { mode: 'navigate' }), /Invalid mode="navigate"/);
});

// ---- Counterparts: unload, a cache keyed by kind, type on re-exports ------------------------------------------

test('unload(): evicts the cache entry so the next load fetches again; nothing else changes', async () => {
  const { modules, fetch, window } = setup({ files: { 'a.html': '<html-export name="a-b"><template>a</template></html-export>' } });
  const first = await modules.load('./a.html');
  first.aB.define('x-a-b', { window });
  assert.equal(modules.unload('./a.html'), true);
  assert.equal(modules.cache.has(`html:${ORIGIN}a.html`), false);
  assert.equal(modules.unload('./a.html'), false, 'nothing left to evict');
  const second = await modules.load('./a.html');
  assert.notEqual(second, first, 'a fresh namespace from a second fetch');
  assert.equal(fetch.log.length, 2);
  assert.ok(window.customElements.get('x-a-b'), 'registered tags stay registered');
  assert.equal(first.aB.name, 'a-b', 'the old namespace still works');
  assert.equal(modules.unload('./a.html', { type: 'js' }), false, 'a type limits it to that kind');
  assert.equal(modules.unload('./a.html', { type: 'html' }), true);
  assert.equal(modules.unload(`${ORIGIN}a.html`), false);
  assert.throws(() => modules.unload('bare-name'), /Unable to resolve bare specifier/);
});

test('the cache is keyed by kind and URL: one URL can be loaded as HTML and as JavaScript', async () => {
  const { modules } = setup({ files: { 'x.html': '<html-export name="a-b"><template>a</template></html-export>' }, js: { 'x.html': { fromJS: true } } });
  const asHTML = await modules.load('./x.html');
  const asJS = await modules.load('./x.html', { type: 'js' });
  assert.ok(asHTML.aB);
  assert.equal(asJS.fromJS, true);
  assert.deepEqual([...modules.cache.keys()], [`html:${ORIGIN}x.html`, `js:${ORIGIN}x.html`]);
  assert.equal(await modules.load('./x.html'), asHTML, 'still one entry per kind');
  assert.equal(modules.unload('./x.html'), true, 'without a type, every kind goes');
  assert.equal(modules.cache.size, 0);
});

test('<html-export src type="html"> re-exports an HTML module whose URL does not end in .html (both readers record the type)', async () => {
  const { scanHTMLModule } = await import('../src/index.js');
  const html = '<html-export src="./part.tpl" type="html"></html-export><html-export src="./other.tpl" type="html" names="x-y as z-w"></html-export><html-export src="./more.tpl" type="html" name="m-n"></html-export>';
  assert.deepEqual(scanHTMLModule(html, 'm.html').exports.map((e) => e.type), ['html', 'html', 'html']);
  const { modules } = setup({ files: {
    'barrel.html': '<html-export src="./part.tpl" type="html"></html-export>',
    'part.tpl': '<html-export name="part-card"><template>p</template></html-export>',
  } });
  const barrel = await modules.load('./barrel.html');
  assert.equal(barrel.partCard.name, 'part-card');
  assert.deepEqual(Object.keys(barrel.components), ['part-card']);
  assert.throws(() => scanHTMLModule('<html-export name="a" type="html"><template>t</template></html-export>', 'm.html'), /<html-export name="a">: "type" only applies to a re-export \(an <html-export> with "src"\) in m\.html/);
  assert.throws(() => scanHTMLModule('<html-export src="./a.html" integrity="nope"></html-export>', 'm.html'), /Invalid integrity "nope" on <html-export src="\.\/a\.html"> in m\.html/);
});

test('integrity on a re-export pins the re-exported module', async () => {
  const part = '<html-export name="part-card"><template>p</template></html-export>';
  const sri = `sha256-${createHash('sha256').update(part).digest('base64')}`;
  const ok = setup({ files: { 'barrel.html': `<html-export src="./part.html" integrity="${sri}"></html-export>`, 'part.html': part } });
  assert.ok((await ok.modules.load('./barrel.html')).partCard);
  const bad = setup({ files: { 'barrel.html': `<html-export src="./part.html" integrity="${sri}"></html-export>`, 'part.html': `${part} ` } });
  await assert.rejects(bad.modules.load('./barrel.html'), /Integrity check failed for HTML module http:\/\/modules\.test\/part\.html/);
});

test('parseModuleSource: a browser\'s DOMParser makes a detached container; any other DOM gets a whole document', async () => {
  const { parseModuleSource } = await import('../src/loader.js');
  const { readHTMLModule } = await import('../src/index.js');
  const win = makeWindow();
  const html = '<!doctype html><html><head><title>t</title></head><body><html-export name="a"><style>b{}</style><template><b>x</b></template></html-export></body></html>';
  // A native-looking DOMParser (a bound function prints "[native code]") whose documents hand out linkedom bodies.
  const made = [];
  const Native = function () { return { parseFromString: (h, type) => (made.push([h, type]), { createElement: (name) => win.document.createElement(name) }) }; }.bind(null);
  const holder = parseModuleSource(html, { DOMParser: Native });
  assert.deepEqual(made, [['', 'text/html']], 'one empty document is made, and reused');
  assert.equal(holder.parentNode, null, 'nothing parsed is attached to a document tree');
  assert.notEqual(holder.nodeType, 9, 'a container element, not a Document');
  assert.deepEqual(readHTMLModule(holder, 'm.html').exports.map((e) => [e.name, e.kind]), [['a', 'component']]);
  // Not native (linkedom here): whole documents, as before.
  const calls = [];
  const Plain = class { parseFromString(h, t) { calls.push([h, t]); return win.document; } };
  parseModuleSource(html, { DOMParser: Plain });
  assert.deepEqual(calls, [[html, 'text/html']]);
  assert.throws(() => parseModuleSource(html, {}), /No DOMParser available/);
});
