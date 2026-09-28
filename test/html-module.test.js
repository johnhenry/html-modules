import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTMLModule, createNamespace, hasExport, exportNames } from '../src/index.js';
import { fixtures, parseDoc } from './helpers.js';

const uiURL = new URL('ui.html', fixtures).href;
const uiHTML = await readFile(new URL(uiURL), 'utf8');

test('HTML module exports: templates, default, style, json, module script, other elements', async () => {
  const ns = await parseHTMLModule(parseDoc(uiHTML), { url: uiURL });
  assert.deepEqual(exportNames(ns), ['Card', 'config', 'controller', 'default', 'logo', 'theme']);
  assert.equal(ns.Card.localName, 'template');
  assert.match(ns.Card.innerHTML, /class="card"/);
  assert.match(ns.default.innerHTML, /default/);
  assert.deepEqual(ns.theme, { kind: 'stylesheet', cssText: '.card { border: 1px solid; }' });
  assert.deepEqual(ns.config, { size: 3 });
  assert.equal(ns.controller.greet('x'), 'hi x');
  assert.equal(ns.logo.localName, 'svg');
  assert.equal(hasExport(ns, 'helper'), false, 'unexported markup stays private');
});

test('namespace objects look like ES module namespaces', async () => {
  const ns = createNamespace([['b', 2], ['a', 1]]);
  assert.equal(Object.prototype.toString.call(ns), '[object Module]');
  assert.equal(Object.getPrototypeOf(ns), null);
  assert.ok(Object.isFrozen(ns));
  assert.deepEqual(Object.keys(ns), ['a', 'b']);
  assert.throws(() => { 'use strict'; ns.a = 3; }, TypeError);
});

test('CSSStyleSheet is used when the window provides one', async () => {
  class FakeSheet { replaceSync(t) { this.text = t; } }
  const ns = await parseHTMLModule(parseDoc('<style export="s">a{}</style>'), { url: 'https://x.example/m.html', window: { CSSStyleSheet: FakeSheet } });
  assert.ok(ns.s instanceof FakeSheet);
  assert.equal(ns.s.text, 'a{}');
});

test('duplicate and empty export names are errors', async () => {
  await assert.rejects(parseHTMLModule(parseDoc('<template export="A"></template><style export="A"></style>'), { url: 'u:' }), /Duplicate export "A"/);
  await assert.rejects(parseHTMLModule(parseDoc('<template export=" "></template>'), { url: 'u:' }), /Empty export name/);
});

test('custom interpretation hook', async () => {
  const ns = await parseHTMLModule(parseDoc('<template export="T"><b>x</b></template>'), {
    url: 'u:',
    interpret: (el) => ({ factory: () => el.innerHTML }),
  });
  assert.equal(ns.T.factory(), '<b>x</b>');
});

test('unsupported exported script types are rejected', async () => {
  await assert.rejects(parseHTMLModule(parseDoc('<script export="x">1</script>'), { url: 'u:' }), /Unsupported exported <script/);
});

test('re-exports: named, aliased, star (no default), local shadowing, ambiguity', async () => {
  const modules = {
    'a:': createNamespace([['X', 1], ['Y', 2], ['default', 'A']]),
    'b:': createNamespace([['Y', 3], ['Z', 4]]),
  };
  const load = async (from) => modules[from];
  const doc = parseDoc(`
    <module-export from="a:" all></module-export>
    <module-export from="b:" all></module-export>
    <export from="a:"><binding name="X" as="Renamed"></binding></export>
    <module-export from="b:" name="Z" as="Zed"></module-export>
    <template export="X"></template>`);
  const ns = await parseHTMLModule(doc, { url: 'u:', load });
  assert.deepEqual(exportNames(ns), ['Renamed', 'X', 'Z', 'Zed']);
  assert.equal(ns.X.localName, 'template', 'local export shadows star export');
  assert.equal(ns.Renamed, 1);
  assert.equal(ns.Zed, 4);
  assert.equal(hasExport(ns, 'Y'), false, 'conflicting star exports are ambiguous and excluded');
  assert.equal(hasExport(ns, 'default'), false);
});

test('re-export errors', async () => {
  const load = async () => createNamespace([['A', 1]]);
  await assert.rejects(parseHTMLModule(parseDoc('<module-export from="a:"><module-binding name="Nope"></module-binding></module-export>'), { url: 'u:', load }), /does not provide an export named 'Nope'/);
  await assert.rejects(parseHTMLModule(parseDoc('<module-export from="a:"></module-export>'), { url: 'u:', load }), /must have `all`, `namespace`, or at least one binding/);
  await assert.rejects(parseHTMLModule(parseDoc('<module-export from="a:" all></module-export>'), { url: 'u:' }), /requires a loader/);
  await assert.rejects(parseHTMLModule(parseDoc('<template export="A"></template><module-export from="a:" name="A"></module-export>'), { url: 'u:', load }), /Duplicate export "A"/);
});

test('namespace re-exports (export * as ns from) and their errors', async () => {
  const a = createNamespace([['X', 1], ['default', 'A']]);
  const load = async () => a;
  const ns = await parseHTMLModule(parseDoc(`
    <module-export from="a:" namespace="A"></module-export>
    <export from="a:" namespace="Also" name="X"></export>`), { url: 'u:', load });
  assert.deepEqual(exportNames(ns), ['A', 'Also', 'X']);
  assert.equal(ns.A, a, 'the namespace itself, including default');
  assert.equal(ns.Also, a);
  assert.equal(ns.X, 1);
  await assert.rejects(parseHTMLModule(parseDoc('<template export="A"></template><module-export from="a:" namespace="A"></module-export>'), { url: 'u:', load }), /Duplicate export "A"/);
  await assert.rejects(parseHTMLModule(parseDoc('<module-export from="a:" namespace=""></module-export>'), { url: 'u:', load }), /requires a "namespace"/);
});

test('missing re-exported names are a SyntaxError', async () => {
  const load = async () => createNamespace([]);
  await assert.rejects(parseHTMLModule(parseDoc('<export from="a:" name="Nope"></export>'), { url: 'u:', load }), SyntaxError);
});

test('inline module scripts get a sourceURL naming the module and export', async () => {
  const urls = [];
  await parseHTMLModule(parseDoc('<script type="module" export="ctl">export const a = 1;</script>'), {
    url: 'https://x.example/m.html',
    importModule: async (u) => (urls.push(decodeURIComponent(u)), {}),
  });
  assert.match(urls[0], /^data:text\/javascript;charset=utf-8,export const a = 1;\n\/\/# sourceURL=https:\/\/x\.example\/m\.html#ctl$/);
});
