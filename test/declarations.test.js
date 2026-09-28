import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readImportDeclaration, applyImport, ModuleScope, createNamespace, defineElement, adoptStyleSheet } from '../src/index.js';
import { makeWindow } from './helpers.js';

const el = (html) => {
  const win = makeWindow();
  win.document.body.innerHTML = html;
  return win.document.body.firstElementChild;
};

test('reads nested bindings, shorthand, default, namespace, type', () => {
  const decl = readImportDeclaration(el(`
    <module-import from="./ui.js" default="App" namespace="UI" type="js" name="theme" adopt>
      <module-binding name="Card" element="ui-card"></module-binding>
      <binding name="Button" as="B"></binding>
    </module-import>`));
  assert.deepEqual(decl, {
    from: './ui.js',
    type: 'js',
    defaultLocal: 'App',
    namespaceLocal: 'UI',
    bindings: [
      { name: 'Card', element: 'ui-card' },
      { name: 'Button', as: 'B' },
      { name: 'theme', adopt: true },
    ],
    sideEffectOnly: false,
  });
});

test('no bindings means side-effect import', () => {
  assert.equal(readImportDeclaration(el('<module-import from="./setup.js"></module-import>')).sideEffectOnly, true);
});

test('custom prefix and declaration errors', () => {
  const decl = readImportDeclaration(el('<esm-import from="x"><esm-binding name="A"></esm-binding></esm-import>'), { prefix: 'esm' });
  assert.deepEqual(decl.bindings, [{ name: 'A' }]);
  assert.throws(() => readImportDeclaration(el('<module-import></module-import>')), /requires a "from"/);
  assert.throws(() => readImportDeclaration(el('<module-import from="x"><module-binding></module-binding></module-import>')), /requires a "name"/);
  assert.throws(() => readImportDeclaration(el('<module-import from="x" element="a-b"></module-import>')), /shorthand requires "name"/);
});

test('applyImport declares local bindings; `as` aliases, does not register', () => {
  const ns = createNamespace([['Card', class Card {}], ['default', 'D'], ['theme', { kind: 'stylesheet', cssText: 'x' }]]);
  const scope = new ModuleScope();
  const out = applyImport({ from: 'm', defaultLocal: 'Main', namespaceLocal: 'M', bindings: [{ name: 'Card', as: 'MyCard' }] }, ns, { scope });
  assert.deepEqual(Object.keys(out), ['Main', 'M', 'MyCard']);
  assert.equal(scope.get('MyCard'), ns.Card);
  assert.equal(scope.get('M'), ns);
  assert.equal(scope.has('Card'), false);
});

test('applyImport errors mirror ESM', () => {
  const ns = createNamespace([['A', 1]]);
  assert.throws(() => applyImport({ from: 'm', bindings: [{ name: 'B' }] }, ns), /does not provide an export named 'B'/);
  assert.throws(() => applyImport({ from: 'm', defaultLocal: 'X', bindings: [] }, ns), /export named 'default'/);
  assert.throws(() => applyImport({ from: 'm', bindings: [{ name: 'default' }] }, createNamespace([['default', 1]])), /requires an "as"/);
  const scope = new ModuleScope();
  applyImport({ from: 'm', bindings: [{ name: 'A' }] }, ns, { scope });
  applyImport({ from: 'm', bindings: [{ name: 'A' }] }, ns, { scope }); // same value: fine
  assert.throws(() => applyImport({ from: 'n', bindings: [{ name: 'A' }] }, createNamespace([['A', 2]]), { scope }), /already been declared/);
  assert.throws(() => applyImport({ from: 'm', bindings: [{ name: 'A', element: 'x-a' }] }, ns), /CustomElementRegistry is required/);
});

test('ModuleScope.whenDeclared', async () => {
  const scope = new ModuleScope();
  const p = scope.whenDeclared('X');
  scope.declare('X', 5);
  assert.equal(await p, 5);
  assert.equal(await scope.whenDeclared('X'), 5);
  assert.deepEqual(scope.names(), ['X']);
});

test('element registration: classes, templates, same export under two names', () => {
  const win = makeWindow();
  class Card extends win.HTMLElement {}
  const r = win.customElements;
  const ns = createNamespace([['Card', Card]]);
  applyImport({ from: 'm', bindings: [{ name: 'Card', element: 'blog-card' }, { name: 'Card', element: 'store-card' }] }, ns, { registry: r, window: win });
  assert.equal(r.get('blog-card'), Card);
  assert.ok(r.get('store-card').prototype instanceof Card, 'second name gets a subclass');
  assert.equal(defineElement(r, 'blog-card', Card, win), Card, 're-registering the same export is a no-op');
  assert.throws(() => defineElement(r, 'blog-card', class extends win.HTMLElement {}, win), /already defined/);
  assert.throws(() => defineElement(r, 'nohyphen', Card, win), /not a valid custom element name/);
  assert.throws(() => defineElement(r, 'x-num', 42, win), /Cannot register/);
  assert.throws(() => defineElement(r, 'x-plain', class Plain {}, win), /Cannot register Plain as a custom element: it does not extend HTMLElement/);

  const tpl = win.document.createElement('template');
  tpl.innerHTML = '<article><slot></slot></article>';
  defineElement(r, 'ui-panel', tpl, win);
  win.document.body.innerHTML = '<ui-panel>hi</ui-panel>';
  const panel = win.document.body.firstElementChild;
  assert.equal(panel.shadowRoot.firstChild.localName, 'article');
});

test('adoptStyleSheet with CSSStyleSheet-like, descriptor, and <style>', () => {
  const win = makeWindow();
  const doc = win.document;
  const sheet = { replaceSync() {} };
  doc.adoptedStyleSheets = [];
  adoptStyleSheet(doc, sheet);
  adoptStyleSheet(doc, sheet);
  assert.deepEqual(doc.adoptedStyleSheets, [sheet]);
  adoptStyleSheet(doc, { kind: 'stylesheet', cssText: '.a{}' });
  const style = doc.createElement('style');
  style.textContent = '.b{}';
  adoptStyleSheet(doc, style);
  assert.deepEqual([...doc.head.querySelectorAll('style')].map((s) => s.textContent), ['.a{}', '.b{}']);
  assert.throws(() => adoptStyleSheet(doc, 42), /requires a stylesheet/);
});
