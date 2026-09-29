// Re-exports and their ESM counterparts:
//   <html-export src>                          export * from
//   <html-export src name [import]>            export { a as b } from
//   <html-export src names="a, b as c">        export { a, b as c } from
//   <html-export src name="ns" import="*">     export * as ns from
//   <html-export src name="default" [import]>  export { default } from / export { a as default } from
//   <html-export src name="card" default>      export { card, card as default } from
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHTMLModule, scanHTMLModule, compileHTMLModule, isHTMLComponent } from '../src/index.js';
import { setup, makeWindow, shared } from './helpers.js';

const runtime = new URL('../src/runtime.js', import.meta.url).href;
const parse = (html) => new shared.DOMParser().parseFromString(html, 'text/html');
const both = (html) => [readHTMLModule(parse(html), 'm.html'), scanHTMLModule(html, 'm.html')];

const SOURCE = `<html-export name="card"><template>card</template></html-export>
  <html-export name="fancy-button"><template>button</template></html-export>
  <html-export name="config"><script type="application/json">{"n": 1}</script></html-export>
  <html-export name="default"><template>the default</template></html-export>`;
const ICONS = `<html-export name="star"><template>*</template></html-export>
  <html-export name="heart"><template>&lt;3</template></html-export>`;
const LIST = '<html-export src="./source.html" names="card, fancy-button as button, config as settings, default as main,"></html-export>';
const NAMESPACE = '<html-export src="./icons.html" name="icon" import="*"></html-export><html-export name="own"><template>o</template></html-export>';
const PASS_DEFAULT = '<html-export src="./source.html" name="default"></html-export>';
const PICK_DEFAULT = '<html-export src="./source.html" name="default" import="card"></html-export>';
const LIST_DEFAULT = '<html-export src="./source.html" names="card as default, fancy-button"></html-export>';
const NAMED_DEFAULT = '<html-export src="./source.html" name="card" default></html-export>';
const NAMESPACE_DEFAULT = '<html-export src="./icons.html" name="default" import="*"></html-export>';
const OUTER = '<html-export src="./namespace.html"></html-export>';
const files = {
  'source.html': SOURCE, 'icons.html': ICONS, 'list.html': LIST, 'namespace.html': NAMESPACE,
  'pass-default.html': PASS_DEFAULT, 'pick-default.html': PICK_DEFAULT, 'list-default.html': LIST_DEFAULT,
  'named-default.html': NAMED_DEFAULT, 'namespace-default.html': NAMESPACE_DEFAULT, 'outer.html': OUTER,
};

let dir;
before(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-reexport-')));
});

test('records: names="…" expands to one re-export per entry, identically in both readers', () => {
  for (const r of both(LIST)) {
    assert.deepEqual(r.exports, [
      { kind: 'reexport', src: './source.html', name: 'card' },
      { kind: 'reexport', src: './source.html', name: 'button', import: 'fancy-button' },
      { kind: 'reexport', src: './source.html', name: 'settings', import: 'config' },
      { kind: 'reexport', src: './source.html', name: 'main', import: 'default' },
    ]);
  }
  for (const r of both('<html-export src="./w.js" names="Counter as counter,  default"></html-export>')) {
    assert.deepEqual(r.exports, [
      { kind: 'reexport', src: './w.js', name: 'counter', import: 'Counter' },
      { kind: 'reexport', src: './w.js', name: null, default: true },
    ]);
  }
});

test('records: namespace and default re-exports', () => {
  const cases = [
    [NAMESPACE, { kind: 'reexport', src: './icons.html', name: 'icon', import: '*' }],
    [PASS_DEFAULT, { kind: 'reexport', src: './source.html', name: null, default: true }],
    ['<html-export src="./source.html" name></html-export>', { kind: 'reexport', src: './source.html', name: null, default: true }],
    [PICK_DEFAULT, { kind: 'reexport', src: './source.html', name: null, default: true, import: 'card' }],
    [NAMED_DEFAULT, { kind: 'reexport', src: './source.html', name: 'card', default: true }],
    [NAMESPACE_DEFAULT, { kind: 'reexport', src: './icons.html', name: null, default: true, import: '*' }],
  ];
  for (const [html, record] of cases) for (const r of both(html)) assert.deepEqual(r.exports[0], record, html);
  for (const r of both(LIST_DEFAULT)) assert.deepEqual(r.exports.map((e) => [e.name, !!e.default, e.import]), [[null, true, 'card'], ['fancy-button', false, undefined]]);
});

test('re-export errors are SyntaxErrors with the module URL, in both readers', () => {
  const cases = [
    ['<html-export src="./x.html" names=""></html-export>', /names="" lists no exports/],
    ['<html-export src="./x.html" names=" , "></html-export>', /names="" lists no exports/],
    ['<html-export src="./x.html" names="a b"></html-export>', /"a b" in names is not "<export>" or "<export> as <name>"/],
    ['<html-export src="./x.html" names="a as"></html-export>', /"a as" in names is not/],
    ['<html-export src="./x.html" names="* as icon"></html-export>', /"\*" cannot appear in names; write name="icon" import="\*"/],
    ['<html-export src="./x.html" names="Card"></html-export>', /Invalid export name "Card"/],
    ['<html-export src="./x.html" names="a as components"></html-export>', /"components" is reserved/],
    ['<html-export src="./x.html" names="a" name="b"></html-export>', /cannot be combined with "name"/],
    ['<html-export src="./x.html" names="a" import="b" default></html-export>', /cannot be combined with "import" or "default"/],
    ['<html-export src="./x.html" names="a, b as a"></html-export>', /Duplicate export "a"/],
    ['<html-export src="./x.html" names="default, a as default"></html-export>', /More than one default export/],
    ['<html-export name="default"><template>x</template></html-export><html-export src="./x.html" name="default"></html-export>', /More than one default export/],
    ['<html-export src="./x.html" name="default" default></html-export>', /already the default export/],
    ['<html-export name="a" import="b"><template>x</template></html-export>', /"import" only applies to a re-export/],
    ['<html-export name="a" names="b"><template>x</template></html-export>', /"names" only applies to a re-export/],
  ];
  for (const [html, message] of cases) {
    for (const fn of [(h) => readHTMLModule(parse(h), 'm.html'), (h) => scanHTMLModule(h, 'm.html')]) {
      assert.throws(() => fn(html), (e) => e instanceof SyntaxError && message.test(e.message) && /m\.html/.test(e.message), html);
    }
  }
});

test('loaded: a names list re-exports each entry, keeping identity', async () => {
  const { modules } = setup({ files, window: makeWindow() });
  const [list, source] = await Promise.all([modules.load('./list.html'), modules.load('./source.html')]);
  assert.deepEqual(Object.keys(list), ['button', 'card', 'components', 'main', 'settings']);
  assert.equal(list.card, source.card);
  assert.equal(list.button, source.fancyButton);
  assert.equal(list.settings, source.config);
  assert.equal(list.main, source.default, 'default as main');
  assert.deepEqual(Object.keys(list.components), ['card', 'button', 'main']);
  await assert.rejects(setup({ files: { ...files, 'bad.html': '<html-export src="./source.html" names="card, nope"></html-export>' }, window: makeWindow() }).modules.load('./bad.html'),
    { name: 'SyntaxError', message: "The requested module './source.html' does not provide an export named 'nope'" });
});

test('loaded: a namespace re-export is the source namespace, and its components enter the manifest as <name>--<export>', async () => {
  const { modules } = setup({ files, window: makeWindow() });
  const [ns, icons, outer] = await Promise.all(['./namespace.html', './icons.html', './outer.html'].map((u) => modules.load(u)));
  assert.equal(ns.icon, icons, 'export * as icon: the namespace object itself');
  assert.deepEqual(Object.keys(ns.components), ['icon--star', 'icon--heart', 'own'], 'document order');
  assert.equal(ns.components['icon--star'], icons.star);
  assert.equal(outer.icon, icons, 'a star re-export passes the namespace export through, as in ESM');
  assert.deepEqual(Object.keys(outer.components).sort(), ['icon--heart', 'icon--star', 'own']);
  const plain = await setup({ files: { 'js.html': '<html-export src="./nothing.js" name="lib" import="*"></html-export>' }, js: { 'nothing.js': { a: 1 } }, window: makeWindow() }).modules.load('./js.html');
  assert.deepEqual(plain.lib, { a: 1 });
  assert.deepEqual(Object.keys(plain.components), [], 'a source without components adds none');
});

test('loaded: default re-exports', async () => {
  const { modules } = setup({ files, window: makeWindow() });
  const source = await modules.load('./source.html');
  const icons = await modules.load('./icons.html');
  assert.equal((await modules.load('./pass-default.html')).default, source.default, 'export { default } from');
  const pick = await modules.load('./pick-default.html');
  assert.equal(pick.default, source.card, 'export { card as default } from');
  assert.deepEqual(Object.keys(pick), ['components', 'default']);
  assert.deepEqual(Object.keys(pick.components), [], 'a default-only re-export stays out of the manifest');
  const listed = await modules.load('./list-default.html');
  assert.equal(listed.default, source.card);
  assert.equal(listed.fancyButton, source.fancyButton);
  const named = await modules.load('./named-default.html');
  assert.equal(named.card, source.card);
  assert.equal(named.default, source.card, 'export { card, card as default } from');
  assert.deepEqual(Object.keys(named.components), ['card']);
  assert.equal((await modules.load('./namespace-default.html')).default, icons, 'export * as default from');
  await assert.rejects(setup({ files: { 'x.html': '<html-export src="./icons.html" name="default"></html-export>', 'icons.html': ICONS }, window: makeWindow() }).modules.load('./x.html'),
    { name: 'SyntaxError', message: "The requested module './icons.html' does not provide an export named 'default'" });
});

test('<html-import>: namespace re-exports register as <as>--<name>--<export>; a re-exported default binds with element=', async () => {
  const { document, window } = setup({ files, elements: true });
  document.body.innerHTML = `
    <html-import id="ns" src="./namespace.html" as="kit"></html-import>
    <html-import id="d" src="./pick-default.html"><html-binding export="default" element="picked-card"></html-binding></html-import>`;
  const [ns, d] = await Promise.all(['#ns', '#d'].map((id) => document.querySelector(id).ready));
  assert.deepEqual(Object.keys(ns.elements).sort(), ['kit--icon--heart', 'kit--icon--star', 'kit--own']);
  assert.deepEqual(ns.tags['kit--icon--star'], { tag: 'kit--icon--star', namespace: 'kit', export: 'icon--star' });
  assert.ok(isHTMLComponent(window.customElements.get('picked-card').component));
  assert.equal(window.customElements.get('picked-card').component, d.module.default);
});

test('compiler: every re-export form compiles to the matching ESM, equivalent to runtime loading', async () => {
  const { modules } = setup({ files, window: makeWindow() });
  for (const [file, source] of Object.entries(files)) {
    await writeFile(join(dir, file.replace(/\.html$/, '.js')), compileHTMLModule(source, { url: file, runtime }));
  }
  const expect = {
    'list.html': [/const \$x_button = lookupExport\(\$m0, "fancy-button", "\.\/source\.html"\);/, /const \$x_main = lookupExport\(\$m0, "default", "\.\/source\.html"\);/],
    'namespace.html': [/import \* as \$m0 from "\.\/icons\.js";/, /const \$x_icon = \$m0;/, /\.\.\.namespaceComponents\("icon", \$x_icon\),/],
    'pass-default.html': [/const \$default = lookupExport\(\$m0, "default", "\.\/source\.html"\);/, /export default \$default;/],
    'pick-default.html': [/const \$default = lookupExport\(\$m0, "card", "\.\/source\.html"\);/, /export default \$default;/],
    'named-default.html': [/export default \$x_card;/],
    'namespace-default.html': [/const \$default = \$m0;/, /export default \$default;/],
  };
  for (const file of Object.keys(files)) {
    const js = compileHTMLModule(files[file], { url: file, runtime });
    for (const re of expect[file] ?? []) assert.match(js, re, file);
    const compiled = await import(pathToFileURL(join(dir, file.replace(/\.html$/, '.js'))).href);
    const loaded = await modules.load(`./${file}`);
    assert.deepEqual(Object.keys(compiled).sort(), Object.keys(loaded).sort(), file);
    assert.deepEqual(Object.keys(compiled.components).sort(), Object.keys(loaded.components).sort(), file);
  }
  const ns = await import(pathToFileURL(join(dir, 'namespace.js')).href);
  const icons = await import(pathToFileURL(join(dir, 'icons.js')).href);
  assert.equal(ns.icon, icons);
  assert.equal(ns.components['icon--star'], icons.star);
  const pick = await import(pathToFileURL(join(dir, 'pick-default.js')).href);
  assert.equal(pick.default, (await import(pathToFileURL(join(dir, 'source.js')).href)).card);
});
