// Default exports: name="default" (canonical), a bare name, and the `default`
// modifier next to a real name. Mirrors JS `export default` and
// `export { card, card as default }`.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHTMLModule, scanHTMLModule, compileHTMLModule, isHTMLComponent, isHTMLStylesheet } from '../src/index.js';
import { assertExportName } from '../src/names.js';
import { setup, makeWindow, shared } from './helpers.js';

const runtime = new URL('../src/runtime.js', import.meta.url).href;
const parse = (html) => new shared.DOMParser().parseFromString(html, 'text/html');
const both = (html) => [readHTMLModule(parse(html), 'm.html'), scanHTMLModule(html, 'm.html')];
const once = (el, type) => new Promise((resolve) => el.addEventListener(type, (e) => resolve(e), { once: true }));

const CANONICAL = `<html-export name="default"><template><b>d</b></template></html-export>
  <html-export name="card"><template>c</template></html-export>`;
const BARE = '<html-export name><template><i>bare</i></template></html-export><html-export name="card"><template>c</template></html-export>';
const MODIFIER = '<html-export name="card" default><template>c</template></html-export><html-export name="other"><template>o</template></html-export>';
const STYLE = '<html-export name="default"><style>p { color: red }</style></html-export>';
const DATA = '<html-export name><script type="application/json">{"n": 1}</script></html-export>';
const BARREL = '<html-export src="./canonical.html"></html-export><html-export name="own"><template>o</template></html-export>';
const files = { 'canonical.html': CANONICAL, 'bare.html': BARE, 'modifier.html': MODIFIER, 'style.html': STYLE, 'data.html': DATA, 'barrel.html': BARREL };

let dir;
before(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-default-')));
});

test('records: name="default" and a bare name are the default-only export; name="x" default is both', () => {
  for (const r of both(CANONICAL)) assert.deepEqual(r.exports.map((e) => [e.name, !!e.default]), [[null, true], ['card', false]]);
  for (const r of both(BARE)) assert.deepEqual(r.exports.map((e) => [e.name, !!e.default]), [[null, true], ['card', false]]);
  for (const r of both(MODIFIER)) assert.deepEqual(r.exports.map((e) => [e.name, !!e.default]), [['card', true], ['other', false]]);
  for (const r of both('<html-export name="card" default="default"><template>c</template></html-export>')) assert.equal(r.exports[0].default, true);
  for (const r of both(STYLE)) assert.deepEqual([r.exports[0].kind, r.exports[0].name, r.exports[0].default], ['stylesheet', null, true]);
  for (const r of both(DATA)) assert.deepEqual([r.exports[0].kind, r.exports[0].value, r.exports[0].default], ['data', { n: 1 }, true]);
  const [a, b] = both(`${BARE}\n${STYLE.replace('default', 'sheet')}`);
  assert.deepEqual(a, b, 'the DOM reader and the scanner agree');
});

test('default export errors', () => {
  const cases = [
    // A missing name is an error that points at name="default".
    ['<html-export><template>x</template></html-export>', /requires a "name" attribute: name="card", or name="default" for the default export/],
    // `default` alone is no longer a spelling of the default export.
    ['<html-export default><template>x</template></html-export>', /"default" needs a name to go with it; write name="default"/],
    // Two defaults, in every combination.
    ['<html-export name="default"><template>x</template></html-export><html-export name="default"><template>y</template></html-export>', /More than one default export: <html-export name="default"> and <html-export name="default">/],
    ['<html-export name="default"><template>x</template></html-export><html-export name="b" default><template>y</template></html-export>', /More than one default export: <html-export name="default"> and <html-export name="b" default>/],
    ['<html-export name="a" default><template>x</template></html-export><html-export name="b" default><template>y</template></html-export>', /More than one default export/],
    ['<html-export name><template>x</template></html-export><html-export name="default"><template>y</template></html-export>', /More than one default export/],
    // Nonsense around the reserved word.
    ['<html-export name="default" default><template>x</template></html-export>', /already the default export; drop the "default" attribute/],
    ['<html-export name default><template>x</template></html-export>', /already the default export/],
    ['<html-export name="card" default="yes"><template>x</template></html-export>', /"default" is a boolean attribute/],
    ['<html-export name="Default"><template>x</template></html-export>', /Invalid export name "Default"/],
    ['<html-export name=" default"><template>x</template></html-export>', /Invalid export name " default"/],
    ['<html-export name="components"><template>x</template></html-export>', /"components" is reserved/],
    // Re-exports are never the default.
    ['<html-export src="./x.html" default></html-export>', /a re-export cannot be the default export/],
    ['<html-export src="./x.html" name="default" import="card"></html-export>', /a re-export cannot be the default export/],
    ['<html-export src="./x.html" name import="card"></html-export>', /a re-export cannot be the default export/],
    ['<html-export src="./x.html" name="card" import="card" default></html-export>', /a re-export cannot be the default export/],
  ];
  for (const [html, message] of cases) {
    for (const fn of [(h) => readHTMLModule(parse(h), 'm.html'), (h) => scanHTMLModule(h, 'm.html')]) {
      assert.throws(() => fn(html), (e) => e instanceof SyntaxError && message.test(e.message) && /m\.html/.test(e.message), html);
    }
  }
  assert.throws(() => assertExportName('default'), /"default" cannot be a named export: name="default" makes the default export/);
  assert.doesNotThrow(() => assertExportName('default-card'), 'a kebab name that merely starts with "default" is fine');
  for (const r of both('<html-export src="./x.js" name="card" import="default"></html-export>')) {
    assert.deepEqual(r.exports[0], { kind: 'reexport', src: './x.js', name: 'card', import: 'default' }, 'import="default" re-exports a default under a name');
  }
});

test('loaded namespaces: `default` is set, kept out of the manifest (unless named), and never star re-exported', async () => {
  const { modules } = setup({ files, window: makeWindow() });
  const canonical = await modules.load('./canonical.html');
  assert.ok(isHTMLComponent(canonical.default));
  assert.equal(canonical.default.name, null);
  assert.deepEqual(Object.keys(canonical.components), ['card']);
  assert.deepEqual(Object.keys(canonical), ['card', 'components', 'default']);
  const bare = await modules.load('./bare.html');
  assert.match(bare.default.template, /bare/);
  const modifier = await modules.load('./modifier.html');
  assert.equal(modifier.default, modifier.card);
  assert.deepEqual(Object.keys(modifier.components), ['card', 'other']);
  assert.ok(isHTMLStylesheet((await modules.load('./style.html')).default));
  assert.deepEqual((await modules.load('./data.html')).default, { n: 1 });
  const barrel = await modules.load('./barrel.html');
  assert.equal(barrel.default, undefined, 'star re-exports never include default');
  assert.deepEqual(Object.keys(barrel.components).sort(), ['card', 'own']);
});

test('binding: as= registers named components only; export="default" binds components, stylesheets and data', async () => {
  const { document, window } = setup({ files, elements: true });
  document.body.innerHTML = `
    <html-import id="ns" src="./canonical.html" as="ns"></html-import>
    <html-import id="mod" src="./modifier.html" as="mod"></html-import>
    <html-import id="c" src="./canonical.html"><html-binding export="default" element="the-default"></html-binding></html-import>
    <html-import id="b" src="./bare.html" as="b"><html-binding export="default" element="bare-default"></html-binding></html-import>
    <html-import id="s" src="./style.html"><html-binding export="default" adopt></html-binding></html-import>
    <html-import id="d" src="./data.html"><html-binding export="default"></html-binding></html-import>
    <html-import id="bad" src="./canonical.html" as="bad"><html-binding export="default"></html-binding></html-import>`;
  const $ = (s) => document.querySelector(s);
  const badError = once($('#bad html-binding'), 'error');
  const [ns, mod, c, b, s, d] = await Promise.all(['#ns', '#mod', '#c', '#b', '#s', '#d'].map((id) => $(id).ready));
  assert.deepEqual(Object.keys(ns.elements), ['ns--card'], 'a default-only component is not registered by as=');
  assert.deepEqual(Object.keys(mod.elements).sort(), ['mod--card', 'mod--other'], 'a named default is registered under its name');
  assert.equal(window.customElements.get('the-default').component, c.module.default);
  assert.deepEqual(c.tags['the-default'], { tag: 'the-default', namespace: null, export: 'default' });
  assert.equal(window.customElements.get('bare-default').component, b.module.default);
  assert.ok(isHTMLStylesheet(s.bindings.default));
  assert.equal(document.head.querySelectorAll('style').length, 1, 'the default stylesheet was adopted');
  assert.deepEqual(d.bindings.default, { n: 1 });
  await assert.rejects($('#bad').ready, /Binding the default export of '.\/canonical.html' needs element=/);
  assert.match((await badError).detail.error.message, /needs element=/);
});

test('compiler: `export default` for every spelling, equivalent to runtime loading', async () => {
  const { modules } = setup({ files, window: makeWindow() });
  for (const [name, source] of Object.entries({ canonical: CANONICAL, bare: BARE, modifier: MODIFIER, style: STYLE, data: DATA })) {
    const js = compileHTMLModule(source, { url: `${name}.html`, runtime });
    assert.match(js, /\nexport default \$(default|x_card);\n$/, name);
    assert.doesNotMatch(js, / as default,/, name);
    await writeFile(join(dir, `${name}.js`), js);
    const compiled = await import(pathToFileURL(join(dir, `${name}.js`)).href);
    const loaded = await modules.load(`./${name}.html`);
    assert.deepEqual(Object.keys(compiled).sort(), Object.keys(loaded).sort(), name);
    assert.deepEqual(Object.keys(compiled.components), Object.keys(loaded.components), name);
    if (name === 'modifier') assert.equal(compiled.default, compiled.card);
    if (name === 'data') assert.deepEqual(compiled.default, { n: 1 });
  }
  assert.match(compileHTMLModule(MODIFIER, { runtime }), /export default \$x_card;/);
  assert.match(compileHTMLModule(CANONICAL, { runtime }), /const \$default = defineHTMLComponent\(\{\n  name: null,/);
  assert.doesNotMatch(compileHTMLModule('<html-export name="a"><template>x</template></html-export>', { runtime }), /export default/);
  assert.throws(() => compileHTMLModule('<html-export default><template>x</template></html-export>', { url: 'd.html' }), /write name="default".* in d\.html/);
});
