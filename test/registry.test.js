// Scoped custom element registries: records and settings (both readers), the runtime against a window that
// implements the scoped shape, and the warned fallback. Real engines are in test/browser/registry.spec.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineHTMLComponent, scanHTMLModule, readHTMLModule, compileHTMLModule, supportsScopedRegistries, readImportOptions, readImportSettings, createHTMLModules } from '../src/index.js';
import { makeWindow } from './helpers.js';
import { specParse } from './spec-dom.js';

/** A linkedom window with just enough of the scoped-registry shape: a constructable registry, attachShadow's option, importNode's option. */
function scopedWindow(t) {
  const win = makeWindow();
  win.CustomElementRegistry = class {
    #elements = new Map();
    define(name, ctor) { this.#elements.set(name, ctor); }
    get(name) { return this.#elements.get(name); }
  };
  const attach = win.HTMLElement.prototype.attachShadow;
  t.after(() => { win.HTMLElement.prototype.attachShadow = attach; }); // linkedom's classes are shared by every window
  win.shadowCalls = [];
  win.HTMLElement.prototype.attachShadow = function attachShadow(init) {
    win.shadowCalls.push(init);
    const root = attach.call(this, init);
    Object.defineProperty(root, 'customElementRegistry', { value: init.customElementRegistry ?? null });
    return root;
  };
  win.importCalls = [];
  const importNode = win.document.importNode.bind(win.document);
  win.document.importNode = (node, options) => {
    win.importCalls.push(options);
    return importNode(node, typeof options === 'object' ? options.deep : options);
  };
  return win;
}

const imports = (extra = {}) => [{ module: { components: { star: defineHTMLComponent({ name: 'star', template: '<b>*</b>' }) } }, from: './icons.html', as: 'icon', bindings: [], ...extra }];

test('records: registry on a module import and on its settings, identical in both readers; a page rejects it', () => {
  const html = '<html-import-settings registry="scoped"></html-import-settings><html-import src="./a.html" as="a"></html-import><html-import src="./b.html" as="b" registry="global"></html-import><html-export name="x-c"><template>x</template></html-export>';
  const a = scanHTMLModule(html, 'm.html');
  assert.equal(a.importSettings.registry, 'scoped');
  assert.equal(a.imports[1].registry, 'global');
  assert.equal('registry' in a.imports[0], false, 'written only when written');
  assert.deepEqual(readHTMLModule(specParse(html), 'm.html'), a);
  for (const [source, message] of [
    ['<html-import src="./a.html" as="a" registry="isolated"></html-import>', /Invalid registry="isolated" on <html-import> in m\.html: use "global" or "scoped"/],
    ['<html-import-settings registry="shadow"></html-import-settings>', /Invalid registry="shadow" on <html-import-settings> in m\.html: use "global" or "scoped"/],
  ]) {
    for (const read of [(h) => scanHTMLModule(h, 'm.html'), (h) => readHTMLModule(specParse(h), 'm.html')]) {
      assert.throws(() => read(source), (e) => e instanceof SyntaxError && message.test(e.message), source);
    }
  }
  // On a page (not inModule) it is an explicit error, not an ignored attribute.
  assert.throws(() => readImportOptions({ registry: 'scoped' }, ' in page'), /"registry" cannot be set on <html-import> in page: it applies to the imports of an HTML module's own components/);
  assert.throws(() => readImportSettings({ registry: 'scoped' }), /"registry" cannot be set on <html-import-settings>: it applies to the imports of an HTML module/);
  assert.deepEqual(readImportOptions({ registry: 'scoped' }, '', { inModule: true }), { registry: 'scoped' });
  const code = compileHTMLModule(html, { url: 'm.html' });
  assert.match(code, /from: "\.\/a\.html", as: "a", registry: "scoped", bindings/);
  assert.match(code, /from: "\.\/b\.html", as: "b", registry: "global", bindings/);
});

test('supportsScopedRegistries: tried, not assumed (linkedom has none; a registry that ignores the shadow option does not count)', (t) => {
  assert.equal(supportsScopedRegistries(makeWindow()), false);
  const ignoring = makeWindow();
  ignoring.CustomElementRegistry = class {};
  assert.equal(supportsScopedRegistries(ignoring), false, 'the constructor alone is not support');
  assert.equal(supportsScopedRegistries(scopedWindow(t)), true);
});

test('scoped imports are bound into a registry of their own, and shadow roots are created and stamped with it', (t) => {
  const win = scopedWindow(t);
  const card = defineHTMLComponent({ name: 'card', template: '<icon--star></icon--star>', imports: imports({ registry: 'scoped' }) });
  card.define('x-card', { window: win });
  assert.equal(win.customElements.get('icon--star'), undefined, 'not in the global registry');
  win.document.body.insertAdjacentHTML('beforeend', '<x-card></x-card><x-card></x-card>');
  const [a, b] = win.document.body.children;
  const registry = a.shadowRoot.customElementRegistry;
  assert.ok(registry && registry !== win.customElements);
  assert.equal(b.shadowRoot.customElementRegistry, registry, 'one registry per definition');
  assert.ok(registry.get('icon--star'), 'the module\'s own import lives in it');
  assert.equal(win.shadowCalls.at(-1).customElementRegistry, registry);
  assert.deepEqual(win.importCalls.at(-1), { deep: true, customElementRegistry: registry }, 'the template is imported for that registry');
  // The same definition under a second tag reuses the registry and does not bind the import again.
  assert.doesNotThrow(() => card.define('y-card', { window: win }));
  win.document.body.insertAdjacentHTML('beforeend', '<y-card></y-card>');
  assert.equal(win.document.body.lastElementChild.shadowRoot.customElementRegistry, registry);
});

test('an import without registry="scoped" in the same module stays in the registry the component is registered in', (t) => {
  const win = scopedWindow(t);
  const own = [
    { module: { components: { star: defineHTMLComponent({ name: 'star', template: '*' }) } }, from: './a.html', as: 'sc', registry: 'scoped', bindings: [] },
    { module: { components: { dot: defineHTMLComponent({ name: 'dot', template: '.' }) } }, from: './b.html', as: 'gl', bindings: [] },
  ];
  defineHTMLComponent({ name: 'mixed', template: 'x', imports: own }).define('x-mixed', { window: win });
  assert.equal(win.customElements.get('gl--dot') !== undefined, true);
  assert.equal(win.customElements.get('sc--star'), undefined);
  win.document.body.insertAdjacentHTML('beforeend', '<x-mixed></x-mixed>');
  assert.ok(win.document.body.lastElementChild.shadowRoot.customElementRegistry.get('sc--star'));
});

test('two definitions with the same scoped inner tag coexist; unscoped, the second conflicts', (t) => {
  const win = scopedWindow(t);
  const lib = (glyph, scoped) => defineHTMLComponent({
    name: 'rating', template: '<icon--star></icon--star>',
    imports: [{ module: { components: { star: defineHTMLComponent({ name: 'star', template: glyph }) } }, from: './icons.html', as: 'icon', ...(scoped && { registry: 'scoped' }), bindings: [] }],
  });
  lib('v1', true).define('one--rating', { window: win });
  assert.doesNotThrow(() => lib('v2', true).define('two--rating', { window: win }));
  win.document.body.insertAdjacentHTML('beforeend', '<one--rating></one--rating><two--rating></two--rating>');
  const [one, two] = win.document.body.children;
  assert.notEqual(one.shadowRoot.customElementRegistry.get('icon--star'), two.shadowRoot.customElementRegistry.get('icon--star'));
  const plain = makeWindow();
  lib('v1', false).define('one--rating', { window: plain });
  assert.throws(() => lib('v2', false).define('two--rating', { window: plain }), /Cannot bind <icon--star>: it is already defined/);
});

test('where scoped registries are unsupported: a warning (once), and the imports use the registry the component is registered in', () => {
  const win = makeWindow();
  const warnings = [];
  win.console = { warn: (m) => warnings.push(m) };
  const make = (name) => defineHTMLComponent({ name, template: 'x', imports: imports({ registry: 'scoped', as: name }) });
  make('fa').define('fa-card', { window: win });
  make('fb').define('fb-card', { window: win });
  assert.equal(warnings.length, 1, 'one warning per window');
  assert.match(warnings[0], /has an import with registry="scoped", but this browser does not support scoped custom element registries.*registered in the global registry instead/);
  assert.ok(win.customElements.get('fa--star'), 'fell back to the global registry');
  win.document.body.insertAdjacentHTML('beforeend', '<fa-card></fa-card>');
  assert.equal(win.document.body.lastElementChild.shadowRoot.customElementRegistry, undefined);
});

test('createHTMLModules().import() on a page cannot take registry="scoped" (it is a module setting)', async () => {
  const win = makeWindow();
  const modules = createHTMLModules({ window: win, baseURL: 'http://m.test/', fetch: async () => ({ ok: true, status: 200, text: async () => '<html-export name="a"><template>a</template></html-export>' }) });
  await assert.rejects(modules.import('./a.html', { as: 'a', registry: 'scoped' }), /"registry" cannot be set in HTMLModules\.import\(\): it applies to the imports of an HTML module's own components/);
});
