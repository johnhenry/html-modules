// The common runtime: definitions, registration, identity vs name, styles (PRD §13, §14, §18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineHTMLComponent, defineHTMLStylesheet, isHTMLComponent, defineElement, bindModule, registerComponents,
  applyBinding, lookupExport, componentsOf, manifest, toComponent, adoptStylesheet,
  bindingName, parseBindingName, camelCase, kebabCase, isValidElementName, DELIMITER,
} from '../src/index.js';
import { makeWindow, shared } from './helpers.js';

const card = () => defineHTMLComponent({ name: 'custom-card', template: '<article><slot></slot></article>', styles: [':host{display:block}'] });

test('names: the -- delimiter, kebab/camel conversion, element-name validity', () => {
  assert.equal(DELIMITER, '--');
  assert.equal(bindingName('ui', 'custom-card'), 'ui--custom-card');
  assert.equal(bindingName('gh', 'UserCard'), 'gh--user-card');
  assert.deepEqual(parseBindingName('ui--custom-card'), { namespace: 'ui', name: 'custom-card' });
  assert.equal(parseBindingName('custom-card'), null);
  assert.equal(camelCase('fancy-button'), 'fancyButton');
  assert.equal(kebabCase('FancyButton'), 'fancy-button');
  assert.equal(kebabCase('customCard'), 'custom-card');
  assert.ok(isValidElementName('ui--custom-card'));
  // "." is a legal name character, but a one-word export would give "ui.card",
  // which has no hyphen; "--" always supplies one: "ui--card".
  assert.ok(!isValidElementName('ui.card'));
  assert.ok(isValidElementName('ui--card'));
  assert.ok(!isValidElementName('font-face'));
  assert.throws(() => bindingName('UI', 'card'), /Invalid namespace/);
});

test('a definition is inert data with a module-local identity', () => {
  const def = card();
  assert.ok(isHTMLComponent(def));
  assert.equal(String(def), '[object HTMLComponent]');
  assert.deepEqual({ name: def.name, shadow: def.shadow, delegatesFocus: def.delegatesFocus, styles: def.styles }, {
    name: 'custom-card', shadow: 'open', delegatesFocus: false, styles: [':host{display:block}'],
  });
  assert.ok(Object.isFrozen(def));
  assert.equal(defineHTMLComponent(def), def);
  assert.throws(() => defineHTMLComponent({ name: 'x' }), /pass a `template` string or an `element` class/);
  assert.throws(() => defineHTMLComponent({ template: '', shadow: 'none' }), SyntaxError);
});

test('identity vs registration name: one definition, several tags, each a fresh subclass (§13, §14)', () => {
  const win = makeWindow();
  const def = card();
  const Ui = def.define('ui--custom-card', { window: win });
  const Admin = def.define('admin--custom-card', { window: win });
  assert.notEqual(Ui, Admin);
  assert.equal(Object.getPrototypeOf(Ui), def.elementFor(win));
  assert.equal(Object.getPrototypeOf(Admin), def.elementFor(win));
  assert.equal(Ui.component, def);
  assert.equal(Ui.name, 'CustomCard');
  win.document.body.innerHTML = '<ui--custom-card>a</ui--custom-card><admin--custom-card>b</admin--custom-card>';
  const [a, b] = win.document.body.children;
  assert.equal(a.shadowRoot.querySelector('article').localName, 'article');
  assert.equal(b.shadowRoot.innerHTML, a.shadowRoot.innerHTML);
  assert.equal(def.define('ui--custom-card', { window: win }), Ui, 'same definition + same tag is a no-op');
  assert.throws(() => defineHTMLComponent({ name: 'custom-card', template: 'other' }).define('ui--custom-card', { window: win }),
    /Cannot bind <ui--custom-card>: it is already defined by "custom-card"/);
  assert.throws(() => def.define('ui.card', { window: win }), /not a valid custom element name/);
});

test('shadow modes, delegatesFocus and component styles', () => {
  const win = makeWindow();
  defineHTMLComponent({ name: 'secret', template: '<b>hidden</b>', shadow: 'closed' }).define('x--secret', { window: win });
  const el = win.document.createElement('x--secret');
  assert.equal(el.shadowRoot, null, 'closed shadow roots are not exposed');
  card().define('x--card', { window: win });
  win.document.body.innerHTML = '<x--card></x--card><x--card></x--card>';
  const [one, two] = win.document.body.children;
  // linkedom has no constructable stylesheets, so styles fall back to <style> in each root.
  assert.equal(one.shadowRoot.querySelector('style').textContent, ':host{display:block}');
  assert.equal(two.shadowRoot.querySelectorAll('style').length, 1);
});

test('component styles use one shared constructed sheet where supported', () => {
  class FakeSheet {
    cssRules = [];
    replaceSync(text) {
      this.text = text;
    }
  }
  const win = { CSSStyleSheet: FakeSheet };
  const theme = defineHTMLStylesheet({ name: 'theme', css: 'p{}' });
  const roots = [{ adoptedStyleSheets: [] }, { adoptedStyleSheets: [] }];
  for (const root of roots) {
    adoptStylesheet(root, theme, { window: win });
    adoptStylesheet(root, theme, { window: win });
  }
  assert.equal(roots[0].adoptedStyleSheets.length, 1, 'adopting twice is a no-op');
  assert.equal(roots[0].adoptedStyleSheets[0], roots[1].adoptedStyleSheets[0], 'one sheet per window, shared');
  assert.equal(roots[0].adoptedStyleSheets[0].text, 'p{}');
});

test('a server-rendered shadow root is kept rather than re-stamped', () => {
  const win = makeWindow();
  const el = win.document.createElement('z--card');
  el.attachShadow({ mode: 'open' }).innerHTML = '<p>ssr</p>';
  win.document.body.append(el);
  card().define('z--card', { window: win });
  assert.equal(el.shadowRoot.innerHTML, '<p>ssr</p>');
});

test('stylesheets adopt into documents and shadow roots, once', () => {
  const win = makeWindow();
  const theme = defineHTMLStylesheet({ name: 'theme', css: ':root{--a:1}' });
  adoptStylesheet(win.document, theme, { window: win });
  theme.adopt(win.document, { window: win });
  assert.equal(win.document.head.querySelectorAll('style[data-html-module="theme"]').length, 1);
  assert.throws(() => adoptStylesheet(win.document, { css: 'x' }), /not a stylesheet/);
});

test('JS-authored components: classes, defineHTMLComponent(Class), and extending an HTML definition', () => {
  const win = shared;
  class Plain extends HTMLElement {
    connectedCallback() {
      this.dataset.ready = 'yes';
    }
  }
  const def = defineHTMLComponent(Plain);
  assert.equal(def.name, 'plain');
  assert.ok(def.isClass);
  const A = def.define('js--plain', { window: win });
  const B = defineElement('js--plain-two', Plain, { window: win });
  assert.ok(A.prototype instanceof Plain && B.prototype instanceof Plain);
  assert.equal(toComponent(Plain), toComponent(Plain), 'wrapping a class is stable');
  // HTML template + JS behaviour: extend the definition's base element.
  const view = defineHTMLComponent({ name: 'count-view', template: '<output>0</output>' });
  class Counting extends view.elementFor(win) {
    connectedCallback() {
      this.shadowRoot.querySelector('output').textContent = this.getAttribute('start');
    }
  }
  defineHTMLComponent({ name: 'counting', element: Counting }).define('js--counting', { window: win });
  const el = win.document.createElement('js--counting');
  el.setAttribute('start', '5');
  win.document.body.append(el);
  assert.equal(el.shadowRoot.querySelector('output').textContent, '5');
  assert.throws(() => defineElement('js--bad', class NotAnElement {}, { window: win }), /it is a function that does not extend HTMLElement/);
  assert.throws(() => defineElement('js--data', { a: 1 }, { window: win }), /it is data \(an object\), not a component/);
});

test('lookupExport: manifest, name as written, camelCase; clear SyntaxError otherwise', () => {
  const def = card();
  const ns = { customCard: def, components: { 'fancy-button': def }, default: def, VERSION: '1' };
  assert.equal(lookupExport(ns, 'custom-card'), def);
  assert.equal(lookupExport(ns, 'fancy-button'), def);
  assert.equal(lookupExport(ns, 'VERSION'), '1');
  assert.equal(lookupExport(ns, 'default'), def);
  assert.throws(() => lookupExport(ns, 'missing', './ui.html'), { name: 'SyntaxError', message: "The requested module './ui.html' does not provide an export named 'missing'" });
});

test('componentsOf: the manifest, else defineHTMLComponent exports, never other exports (§21)', () => {
  const def = card();
  class C extends HTMLElement {}
  assert.deepEqual(componentsOf({ components: { 'x-y': C }, other: def }), [['x-y', C]]);
  assert.deepEqual(componentsOf({ VERSION: '2.1', formatDate() {}, CustomCard: def, Loose: C }), [['custom-card', def]]);
  assert.throws(() => componentsOf({ VERSION: '2.1' }, './util.js'), /The module '.\/util.js' does not export any HTML components/);
});

test('bindModule: namespace, selective bindings, element=, adopt, default, data', () => {
  const win = makeWindow();
  const theme = defineHTMLStylesheet({ name: 'theme', css: 'p{}' });
  const ns = { customCard: card(), theme, config: { size: 3 }, default: card(), components: {} };
  Object.assign(ns.components, { 'custom-card': ns.customCard });
  const all = bindModule(ns, { as: 'ns1', window: win });
  assert.deepEqual(Object.keys(all.elements), ['ns1--custom-card']);
  const some = bindModule(ns, {
    as: 'ns2', window: win, root: win.document,
    bindings: [{ export: 'custom-card', element: 'brand-card' }, { export: 'custom-card' }, { export: 'theme', adopt: true }, { export: 'config' }, { export: 'default', element: 'default-card' }],
  });
  assert.deepEqual(Object.keys(some.elements), ['brand-card', 'ns2--custom-card', 'default-card']);
  assert.deepEqual(some.values.config, { size: 3 });
  assert.equal(win.document.head.querySelectorAll('style').length, 1);
  assert.deepEqual(bindModule(ns, { window: win }), { elements: {}, values: {}, tags: {} }, 'no as and no bindings: load only');
  assert.throws(() => applyBinding(ns, { export: 'default' }, { as: 'z', window: win }), /needs element=/);
  assert.throws(() => applyBinding(ns, { export: 'theme', element: 'x-theme' }, { from: './ui.html', window: win }), /Cannot register 'theme' from '.\/ui.html' as <x-theme>: it is a stylesheet, not a component/);
  assert.throws(() => applyBinding(ns, { export: 'config', adopt: true }, { window: win }), /Cannot adopt 'config'.*not a stylesheet/);
  assert.throws(() => applyBinding(ns, { export: 'custom-card', element: 'Bad' }, { window: win }), /not a valid custom element name/);
});

test('registerComponents: under a namespace or under the export names', () => {
  const win = makeWindow();
  const ns = { components: { 'plain-card': card() } };
  assert.deepEqual(Object.keys(registerComponents(ns, { window: win })), ['plain-card']);
  assert.deepEqual(Object.keys(registerComponents(ns, { as: 'kit', window: win })), ['kit--plain-card']);
  assert.throws(() => registerComponents({ components: { card: card() } }, { window: win }), /"card" is not a valid custom element name/);
});

test('manifest: locals first, star components merged, conflicts rejected', () => {
  const a = card();
  const b = card();
  assert.deepEqual(Object.keys(manifest({ 'x-a': a, data: { n: 1 } }, [[{ components: { 'x-b': b, 'x-a': b } }, './s.html']])), ['x-a', 'x-b']);
  assert.throws(() => manifest({}, [[{ components: { 'x-c': a } }, './1.html'], [{ components: { 'x-c': b } }, './2.html']]), /Conflicting star exports for 'x-c'/);
});

test('definitions bind their module imports before registering, adopting imported stylesheets into their shadow roots', () => {
  const win = makeWindow();
  const icons = { components: { star: defineHTMLComponent({ name: 'star', template: '★' }) } };
  const theme = defineHTMLStylesheet({ name: 'theme', css: '.t{}' });
  const def = defineHTMLComponent({
    name: 'rated', template: '<icon--star></icon--star>',
    imports: [{ module: icons, from: './icons.html', as: 'icon', bindings: [] }, { module: { theme }, from: './ui.html', bindings: [{ export: 'theme', adopt: true }] }],
  });
  def.define('p--rated', { window: win });
  assert.ok(win.customElements.get('icon--star'));
  win.document.body.innerHTML = '<p--rated></p--rated>';
  const el = win.document.body.firstElementChild;
  assert.equal(el.shadowRoot.querySelector('icon--star').shadowRoot.innerHTML, '★');
  assert.equal(el.shadowRoot.querySelector('style').textContent, '.t{}');
  assert.equal(win.document.head.querySelectorAll('style').length, 0, 'a module import adopts into the component, not the page');
});

// A bind is all or nothing: every tag is checked before any is registered.
const parts = (names) => Object.fromEntries(names.map((n) => [n, defineHTMLComponent({ name: n, template: `<p>${n}</p>` })]));
const clash = (win, tag) => win.customElements.define(tag, class extends win.HTMLElement {});

test('a namespace bind that conflicts on any tag registers none of them', () => {
  const win = makeWindow();
  const ns = { components: manifest(parts(['a', 'b', 'c'])) };
  clash(win, 'half--c'); // the last one: a half-bound page would have <half--a> and <half--b>
  assert.throws(() => bindModule(ns, { as: 'half', window: win }), /Cannot bind <half--c>: it is already defined/);
  assert.equal(win.customElements.get('half--a'), undefined);
  assert.equal(win.customElements.get('half--b'), undefined);
  assert.throws(() => registerComponents(ns, { as: 'half', window: win }), /already defined/);
  assert.equal(win.customElements.get('half--a'), undefined);
  // conflict: "reuse" keeps the existing one and binds the rest.
  const bound = bindModule(ns, { as: 'half', window: win, conflict: 'reuse' });
  assert.ok(win.customElements.get('half--a') && win.customElements.get('half--b'));
  assert.equal(bound.tags['half--c'].reused, true);
});

test('bindings are all or nothing too: a bad or clashing one binds nothing, adopts nothing', () => {
  const win = makeWindow();
  const theme = defineHTMLStylesheet({ name: 'theme', css: 'p{color:red}' });
  const ns = { components: manifest(parts(['a', 'b'])), theme };
  clash(win, 'x-taken');
  const root = win.document;
  const attempts = [
    [[{ export: 'theme', adopt: true }, { export: 'a', element: 'x-a' }, { export: 'b', element: 'x-taken' }], /Cannot bind <x-taken>/],
    [[{ export: 'a', element: 'x-a' }, { export: 'nope' }], /does not provide an export named 'nope'/],
    [[{ export: 'a', element: 'x-a' }, { export: 'b', element: 'x-a' }], /Cannot bind <x-a>: it is already defined by "a"/],
    [[{ export: 'a', element: 'x-a' }, { export: 'theme', element: 'x-theme' }], /it is a stylesheet, not a component/],
  ];
  for (const [bindings, message] of attempts) {
    assert.throws(() => bindModule(ns, { bindings, window: win, root }), message);
    assert.equal(win.customElements.get('x-a'), undefined, JSON.stringify(bindings));
    assert.equal(root.querySelectorAll('style').length, 0, 'nothing adopted');
  }
  assert.equal(Object.keys(bindModule(ns, { bindings: [{ export: 'a', element: 'x-a' }, { export: 'b', element: 'x-taken' }], window: win, conflict: 'reuse' }).elements).length, 2);
});

test('constructed stylesheets get the module URL as their baseURL (url() resolves against the module, not the page)', () => {
  const win = makeWindow();
  const made = [];
  win.CSSStyleSheet = class {
    constructor(options) {
      if (options?.baseURL) new URL(options.baseURL); // a browser throws on an invalid baseURL
      made.push(options);
      this.cssRules = [];
    }
    replaceSync(css) {
      this.text = css;
    }
  };
  const sheet = defineHTMLStylesheet({ name: 'theme', css: 'p{background:url(bg.png)}', url: 'http://cdn.test/lib/ui.html' });
  assert.ok(sheet.sheetFor(win));
  const def = defineHTMLComponent({ name: 'card', template: 'x', styles: [':host{background:url(a.png)}'], url: 'http://cdn.test/lib/ui.html' });
  def.define('base-card', { window: win });
  win.document.body.append(win.document.createElement('base-card'));
  assert.deepEqual(made, [{ baseURL: 'http://cdn.test/lib/ui.html' }, { baseURL: 'http://cdn.test/lib/ui.html' }]);
  const loose = defineHTMLStylesheet({ name: 'loose', css: 'p{}', url: 'not absolute' });
  assert.ok(loose.sheetFor(win), 'a url that cannot be a base URL falls back to a plain sheet');
  assert.equal(made.at(-1), undefined);
  assert.equal(defineHTMLStylesheet({ css: 'p{}' }).sheetFor(win) !== null, true);
  assert.equal(made.at(-1), undefined, 'no url, no options');
});
