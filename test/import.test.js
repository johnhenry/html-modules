// <html-import>, <html-binding>: namespaced registration (§11, §12), async upgrade (§17),
// selective bindings, JS interop (§21), late insertion and error events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, fixtures, tick, shared, ORIGIN } from './helpers.js';

const at = (path) => new URL(path, fixtures).href;

/** A page with the elements defined; `html` is placed in <body>. */
function page(html = '', options = {}) {
  const env = setup({ elements: true, ...options });
  env.document.body.innerHTML = html;
  env.$ = (sel) => env.document.querySelector(sel);
  return env;
}

const once = (el, type) => new Promise((resolve) => el.addEventListener(type, (e) => resolve(e), { once: true }));

test('<html-import src as> registers every component as <as>--<export> (§11)', async () => {
  const { $, window } = page(`<html-import src="${at('ui.html')}" as="ui"></html-import>`);
  const imp = $('html-import');
  const loaded = once(imp, 'load');
  const { module, elements } = await imp.ready;
  assert.deepEqual(Object.keys(elements).sort(), ['ui--custom-card', 'ui--fancy-button', 'ui--note']);
  assert.equal((await loaded).detail.module, module);
  assert.equal(window.customElements.get('ui--custom-card').component, module.customCard);
  assert.equal(await imp.module, module);
  assert.equal(window.customElements.get('ui--theme'), undefined, 'stylesheets and data are not elements');
});

test('elements written before their import upgrade natively when it finishes (§17)', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const source = '<html-export name="custom-card"><template><article><slot name="title"></slot><slot></slot></article></template></html-export>';
  const env = page(`<ui--custom-card><h2 slot="title">Hi</h2>Body</ui--custom-card>
    <html-import src="./slow.html" as="ui"></html-import>
    <ui--custom-card>second</ui--custom-card>`, {
    fetch: async () => (await gate, { ok: true, status: 200, text: async () => source }),
  });
  const cards = [...env.document.querySelectorAll('ui--custom-card')];
  await tick();
  assert.ok(cards.every((c) => !c.shadowRoot), 'unresolved while the module is loading');
  assert.equal(env.window.customElements.get('ui--custom-card'), undefined);
  const defined = env.window.customElements.whenDefined('ui--custom-card');
  release();
  await env.$('html-import').ready;
  await defined;
  for (const c of cards) assert.equal(c.shadowRoot.querySelector('article').localName, 'article');
  assert.equal(cards[0].querySelector('h2').slot, 'title', 'light DOM children stay put and are slotted');
});

test('the same module under two namespaces: one definition, two tags (§13, §14)', async () => {
  const { $, document, window } = page(`
    <html-import id="a" src="${at('ui.html')}" as="shop"></html-import>
    <html-import id="b" src="${at('ui.html')}" as="admin"></html-import>`);
  const [a, b] = await Promise.all([$('#a').ready, $('#b').ready]);
  assert.equal(a.module, b.module, 'one fetch, one namespace');
  const Shop = window.customElements.get('shop--custom-card');
  const Admin = window.customElements.get('admin--custom-card');
  assert.notEqual(Shop, Admin);
  assert.equal(Shop.component, Admin.component);
  document.body.insertAdjacentHTML('beforeend', '<shop--custom-card></shop--custom-card><admin--custom-card></admin--custom-card>');
  assert.equal($('shop--custom-card').shadowRoot.innerHTML, $('admin--custom-card').shadowRoot.innerHTML);
});

test('<html-binding> children: only those exports, element= tags, adopt, data', async () => {
  const { $, window, document } = page(`
    <html-import src="${at('ui.html')}" as="sel">
      <html-binding export="custom-card"></html-binding>
      <html-binding export="fancy-button" element="brand-button"></html-binding>
      <html-binding export="fancy-button" element="other-button"></html-binding>
      <html-binding export="theme" adopt></html-binding>
      <html-binding export="config"></html-binding>
    </html-import>`);
  const imp = $('html-import');
  const { elements, bindings } = await imp.ready;
  assert.deepEqual(Object.keys(elements), ['sel--custom-card', 'brand-button', 'other-button']);
  assert.equal(window.customElements.get('sel--fancy-button'), undefined, 'selective: nothing else is registered');
  assert.equal(window.customElements.get('sel--note'), undefined);
  const [brand, other] = [window.customElements.get('brand-button'), window.customElements.get('other-button')];
  assert.notEqual(brand, other);
  assert.equal(brand.component, other.component);
  assert.deepEqual(bindings.config, { size: 3, brand: 'Acme' });
  assert.deepEqual(imp.bindings.config, bindings.config);
  assert.equal(document.head.querySelectorAll('style[data-html-module="theme"]').length, 1);
});

test('export="default" binds a default export with element=', async () => {
  const { $, window } = page(`<html-import src="${at('ui.html')}"><html-binding export="default" element="side-note"></html-binding></html-import>`);
  await $('html-import').ready;
  assert.equal(window.customElements.get('side-note').component.name, 'note');
});

test('an import with no as and no bindings only loads the module (side effects, warm cache)', async () => {
  const { $, modules, window, fetch } = page(`<html-import src="${at('icons.html')}"></html-import>`);
  const { elements, module } = await $('html-import').ready;
  assert.deepEqual(elements, {});
  assert.ok(module.star);
  assert.equal(window.customElements.get('icon--star'), undefined);
  await modules.load(at('icons.html'));
  assert.equal(fetch.log.length, 1);
});

test('JS-authored components: a components manifest, defineHTMLComponent exports, or explicit bindings (§21)', async () => {
  const { $, window } = page(`
    <html-import id="m" src="${at('widgets.js')}" as="w"></html-import>
    <html-import id="p" src="${at('plain.js')}" as="p"></html-import>
    <html-import id="c" src="${at('widgets.js')}"><html-binding export="Counter" element="x-counter"></html-binding></html-import>
    <html-import id="d" src="${at('plain.js')}"><html-binding export="default" element="plain-default"></html-binding></html-import>`, { window: shared });
  await Promise.all(['#m', '#p', '#c', '#d'].map((s) => $(s).ready));
  const widgets = await import('./fixtures/widgets.js');
  assert.ok(window.customElements.get('w--tally-counter').prototype instanceof widgets.Counter);
  assert.ok(window.customElements.get('w--wall-clock'));
  for (const tag of ['w--version', 'w--format-date', 'w--counter', 'p--version', 'p--loose']) {
    assert.equal(window.customElements.get(tag), undefined, `${tag} must not exist`);
  }
  assert.ok(window.customElements.get('p--shout-box'));
  assert.ok(window.customElements.get('x-counter').prototype instanceof widgets.Counter);
  const el = window.document.createElement('x-counter');
  el.setAttribute('start', '4');
  window.document.body.append(el);
  assert.equal(el.textContent, 'count: 4');
  assert.equal(window.customElements.get('plain-default').component.name, 'plain-default');
});

test('modules that import modules register their dependencies when used', async () => {
  const { $, window, document } = page(`<html-import src="${at('profile.html')}" as="app"></html-import><app--user-profile>John</app--user-profile>`);
  await $('html-import').ready;
  assert.ok(window.customElements.get('icon--star'), "the module's own import is bound");
  const root = $('app--user-profile').shadowRoot;
  assert.ok(root.querySelector('icon--star').shadowRoot.querySelector('.star'));
  assert.match(root.querySelector('style').textContent, /--accent: rebeccapurple/, "the module's adopted stylesheet is scoped to its components");
  assert.equal(document.head.querySelectorAll('style').length, 0);
});

test('late: imports inserted after load, and bindings added before or after the module loads', async () => {
  const { document, window, $ } = page('', { files: { 'late.html': '<html-export name="late-card"><template>late</template></html-export><html-export name="other"><template>o</template></html-export>' } });
  document.body.insertAdjacentHTML('beforeend', '<html-import src="./late.html" as="z"><html-binding export="late-card"></html-binding></html-import>');
  const imp = $('html-import');
  imp.insertAdjacentHTML('beforeend', '<html-binding export="other" element="z-other"></html-binding>'); // before it loads
  await imp.ready;
  assert.ok(window.customElements.get('z--late-card'));
  assert.ok(window.customElements.get('z-other'));
  const later = document.createElement('html-binding');
  later.setAttribute('export', 'late-card');
  later.setAttribute('element', 'z-late-again');
  const loaded = once(later, 'load');
  imp.append(later); // after it loaded
  assert.equal((await loaded).detail.tag, 'z-late-again');
  assert.ok(window.customElements.get('z-late-again'));
  assert.ok(imp.elements['z-late-again']);
});

test('errors: binding errors fire on the <html-binding> and bubble through the import', async () => {
  const { $, document } = page(`
    <html-import src="${at('ui.html')}" as="err">
      <html-binding id="missing" export="nope"></html-binding>
      <html-binding id="badtag" export="custom-card" element="NotValid"></html-binding>
      <html-binding id="notel" export="config" element="x-config"></html-binding>
      <html-binding id="ok" export="custom-card"></html-binding>
    </html-import>`);
  const seen = [];
  document.addEventListener('error', (e) => seen.push([e.target.id, e.detail.error.name, e.detail.error.message]));
  const imp = $('html-import');
  await assert.rejects(imp.ready, /does not provide an export named 'nope'/);
  await tick();
  assert.deepEqual(seen.map(([id, name]) => [id, name]), [['missing', 'SyntaxError'], ['badtag', 'SyntaxError'], ['notel', 'TypeError']]);
  assert.match(seen[1][2], /"NotValid" is not a valid custom element name/);
  assert.match(seen[2][2], /Cannot register 'config' .* as <x-config>: it is data \(an object\), not a component/);
  assert.ok(imp.elements['err--custom-card'], 'the good binding still applied');
});

test('errors: failed module loads and bad attributes fire error on <html-import>', async () => {
  const cases = [
    ['<html-import src="./missing.html" as="m"></html-import>', /Failed to fetch HTML module .*missing\.html: 404/],
    ['<html-import as="m"></html-import>', /requires a "src" attribute/],
    [`<html-import src="${at('ui.html')}" as="Bad--NS"></html-import>`, /Invalid namespace "Bad--NS"/],
    [`<html-import src="${at('nothing.js')}" as="n"></html-import>`, /does not export any HTML components/],
  ];
  for (const [html, message] of cases) {
    const { $ } = page(html, { window: shared });
    const imp = $('html-import');
    const errored = once(imp, 'error');
    await assert.rejects(imp.ready, message);
    assert.match((await errored).detail.error.message, message);
    shared.document.body.innerHTML = '';
  }
});

test('errors: a tag already bound to a different component', async () => {
  const { $ } = page(`<html-import id="a" src="./one.html" as="dup"></html-import>`, {
    files: {
      'one.html': '<html-export name="card"><template>1</template></html-export>',
      'two.html': '<html-export name="card"><template>2</template></html-export>',
    },
  });
  await $('#a').ready;
  $('#a').insertAdjacentHTML('afterend', '<html-import id="b" src="./two.html" as="dup"></html-import>');
  await assert.rejects($('#b').ready, new RegExp(`Cannot bind <dup--card>: it is already defined by "card" from ${ORIGIN}one\\.html`));
});

test('a scripted <html-import>: createElement, append, then setAttribute("src") loads it (it starts after the script)', async () => {
  const { document, window, fetch } = page('', { files: { 'ui.html': '<html-export name="card"><template>c</template></html-export>' } });
  const imp = document.createElement('html-import');
  document.body.append(imp);
  imp.setAttribute('as', 'ui');
  imp.src = './ui.html';
  assert.equal(imp.src, './ui.html');
  assert.equal(imp.as, 'ui');
  const { elements } = await imp.ready;
  assert.deepEqual(Object.keys(elements), ['ui--card']);
  assert.ok(window.customElements.get('ui--card'));
  assert.deepEqual(fetch.log, [`${ORIGIN}ui.html`]);
});

test('an <html-import> that had no src when it started errors, and starts over when one is set', async () => {
  const { document, window } = page('', { files: { 'ui.html': '<html-export name="card"><template>c</template></html-export>' } });
  const imp = document.createElement('html-import');
  imp.as = 'late';
  document.body.append(imp);
  const heard = once(imp, 'error');
  await assert.rejects(imp.ready, /<html-import> requires a "src" attribute/);
  assert.match((await heard).detail.error.message, /requires a "src"/);
  assert.equal(imp.state, 'error');
  imp.src = './ui.html';
  const { elements } = await imp.ready;
  assert.deepEqual(Object.keys(elements), ['late--card']);
  assert.ok(window.customElements.get('late--card'));
});

test('reflected properties: src, as, type, integrity write attributes; delimiter, conflict, loadMode, errors read what is in effect', async () => {
  const { document } = page('', { delimiter: '-', conflict: 'reuse' });
  const imp = document.createElement('html-import');
  assert.deepEqual([imp.src, imp.as, imp.type, imp.integrity], ['', '', '', '']);
  assert.deepEqual([imp.delimiter, imp.conflict, imp.loadMode, imp.errors], ['-', 'reuse', 'eager', 'event'], 'instance defaults');
  Object.assign(imp, { src: './x.html', as: 'x', type: 'html', integrity: 'sha256-AAAA', delimiter: '--', conflict: 'error', loadMode: 'lazy', errors: 'throw' });
  assert.equal(imp.getAttribute('src'), './x.html');
  assert.equal(imp.getAttribute('integrity'), 'sha256-AAAA');
  assert.deepEqual([imp.delimiter, imp.conflict, imp.loadMode, imp.errors], ['--', 'error', 'lazy', 'throw']);
  assert.equal(imp.getAttribute('load'), 'lazy');
  imp.loadMode = null;
  assert.equal(imp.hasAttribute('load'), false);
  assert.equal(imp.loadMode, 'eager');
  assert.equal(typeof imp.load, 'function', 'load() is still the method');
});

test('changing src after loading has started fires an error event and changes nothing', async () => {
  const { document, fetch } = page('', { files: { 'a.html': '<html-export name="a-b"><template>a</template></html-export>', 'b.html': '<html-export name="b-b"><template>b</template></html-export>' } });
  const imp = document.createElement('html-import');
  imp.src = './a.html';
  imp.as = 'p';
  document.body.append(imp);
  await tick();
  const heard = once(imp, 'error');
  imp.src = './b.html';
  assert.match((await heard).detail.error.message, /<html-import src> was changed from "\.\/a\.html" to "\.\/b\.html" after loading started: an import's src is read once/);
  assert.deepEqual(fetch.log, [`${ORIGIN}a.html`]);
  assert.equal(imp.state, 'loaded');
});

test('a page <html-binding> that is not a direct child of <html-import> fires an error event (a self-closed one nests the next)', async () => {
  const { document, window, fetch } = page('', { files: { 'ui.html': '<html-export name="card"><template>c</template></html-export>' } });
  const imp = document.createElement('html-import');
  imp.setAttribute('src', './ui.html');
  const outer = document.createElement('html-binding');
  outer.setAttribute('export', 'card');
  const inner = document.createElement('html-binding');
  inner.setAttribute('export', 'card');
  inner.setAttribute('element', 'x-inner');
  outer.append(inner); // what `<html-binding export="card"/><html-binding …/>` parses to
  const heard = once(inner, 'error');
  imp.append(outer);
  document.body.append(imp);
  assert.match((await heard).detail.error.message, /^<html-binding export="card"> is nested inside <html-binding export="card">: an <html-binding> must be a direct child of <html-import>\. .*"\/>" does not close/);
  await imp.ready;
  assert.equal(window.customElements.get('x-inner'), undefined, 'the swallowed binding was not applied');
  const stray = document.createElement('html-binding');
  stray.setAttribute('export', 'card');
  const strayHeard = once(stray, 'error');
  document.body.append(stray);
  assert.match((await strayHeard).detail.error.message, /<html-binding export="card"> is not a direct child of <html-import>: it is outside any <html-import>/);
  assert.deepEqual(fetch.log, [`${ORIGIN}ui.html`]);
});
