// The HTML module format (PRD §8–§10) and the module record both readers produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readHTMLModule, scanHTMLModule } from '../src/index.js';
import { makeWindow, normalizeHTML } from './helpers.js';

const parse = (html) => new (makeWindow().DOMParser)().parseFromString(html, 'text/html');
const read = (html) => readHTMLModule(parse(html), 'm.html');
const scan = (html) => scanHTMLModule(html, 'm.html');
const both = (html) => [read(html), scan(html)];

/** Records from the DOM reader and the scanner, with template HTML normalized. */
function normalized(record) {
  return {
    ...record,
    exports: record.exports.map((e) => (e.kind === 'component' ? { ...e, template: normalizeHTML(e.template) } : e)),
  };
}

test('<html-export name><template> is a component export with its identity and template', async () => {
  const source = await readFile(new URL('./fixtures/ui.html', import.meta.url), 'utf8');
  for (const record of both(source)) {
    const card = record.exports.find((e) => e.name === 'custom-card');
    assert.equal(card.kind, 'component');
    assert.equal(card.shadow, 'open');
    assert.equal(card.delegatesFocus, false);
    assert.deepEqual(card.styles, [':host { display: block; border: 1px solid; }']);
    assert.match(normalizeHTML(card.template), /^<article class="card"> <header><slot name="title"><\/slot><\/header> <slot><\/slot> <\/article>$/);
    assert.equal(record.exports.find((e) => e.name === 'fancy-button').delegatesFocus, true);
    assert.deepEqual(record.exports.map((e) => [e.name, e.kind, !!e.default]), [
      ['custom-card', 'component', false],
      ['fancy-button', 'component', false],
      ['theme', 'stylesheet', false],
      ['config', 'data', false],
      ['note', 'component', true],
    ]);
    assert.deepEqual(record.exports.find((e) => e.name === 'config').value, { size: 3, brand: 'Acme' });
  }
});

test('unexported markup stays private, and exports inside templates are not exports', () => {
  const html = `<p>private</p><template><html-export name="hidden"><template>x</template></html-export></template>
    <html-export name="shown"><template><template><html-export name="nested"></html-export></template></template></html-export>`;
  for (const record of both(html)) assert.deepEqual(record.exports.map((e) => e.name), ['shown']);
});

test('shadow="closed", default-only exports and data with +json types', () => {
  const html = `<html-export name="secret" shadow="closed"><template>s</template></html-export>
    <html-export default><template>d</template></html-export>
    <html-export name="feed"><script type="application/ld+json">[1,2]</script></html-export>`;
  for (const r of both(html)) {
    assert.equal(r.exports[0].shadow, 'closed');
    assert.deepEqual([r.exports[1].name, r.exports[1].default], [null, true]);
    assert.deepEqual(r.exports[2].value, [1, 2]);
  }
});

test('<html-import> records: src, as, type and <html-binding> children', () => {
  const html = `<html-import src="./icons.html" as="icon"></html-import>
    <html-import src="./ui.js" type="js">
      <html-binding export="Counter" element="x-counter"></html-binding>
      <html-binding export="theme" adopt></html-binding>
    </html-import>
    <html-import src="./setup.html"></html-import>`;
  for (const r of both(html)) {
    assert.deepEqual(r.imports, [
      { src: './icons.html', as: 'icon', bindings: [] },
      { src: './ui.js', type: 'js', bindings: [{ export: 'Counter', element: 'x-counter' }, { export: 'theme', adopt: true }] },
      { src: './setup.html', bindings: [] },
    ]);
  }
});

test('re-export records: every component, or one renamed', () => {
  const html = `<html-export src="./ui.html"></html-export>
    <html-export src="./ui.html" name="button" import="fancy-button"></html-export>
    <html-export src="./x.js" name="counter"></html-export>`;
  for (const r of both(html)) {
    assert.deepEqual(r.exports, [
      { kind: 'reexport', src: './ui.html' },
      { kind: 'reexport', src: './ui.html', name: 'button', import: 'fancy-button' },
      { kind: 'reexport', src: './x.js', name: 'counter' },
    ]);
  }
});

test('the scanner and the DOM reader agree on tricky source', () => {
  const html = `<!doctype html><!-- <html-export name="commented"> -->
    <html-export name='a-b' data-x=unquoted>
      <script type="application/json">{"s": "</template> <html-export name=\\"no\\">"}</script>
    </html-export>
    <html-export name="t-one">
      <style>p::after { content: "</html-export>"; }</style>
      <template><p title="a &amp; b">x<br/>y<template><i>n</i></template><script>"</template>"</script></p></template>
    </html-export>
    <html-import src="./a.html" as="a"><html-binding export="x" element="q-x"></html-binding></html-import>
    <html-export name="with-entities" default><template>&lt;&copy;</template></html-export>`;
  const [a, b] = both(html);
  assert.deepEqual(normalized(a), normalized(b));
  assert.equal(a.exports.length, 3);
  assert.equal(a.exports[0].value.s, '</template> <html-export name="no">');
});

test('format errors are SyntaxErrors with the module URL', () => {
  const cases = [
    ['<html-export><template>x</template></html-export>', /requires a "name" attribute/],
    ['<html-export name="Card"><template>x</template></html-export>', /Invalid export name "Card"/],
    ['<html-export name="ui--card"><template>x</template></html-export>', /Invalid export name "ui--card"/],
    ['<html-export name="components"><template>x</template></html-export>', /reserved/],
    ['<html-export name="a"><template>x</template></html-export><html-export name="a"><template>y</template></html-export>', /Duplicate export "a"/],
    ['<html-export name="a"><template>x</template><template>y</template></html-export>', /has 2 <template> elements/],
    ['<html-export name="a" shadow="none"><template>x</template></html-export>', /shadow="none" must be "open" or "closed"/],
    ['<html-export name="a"></html-export>', /needs a <template>/],
    ['<html-export name="a" shadow="open"><style>p{}</style></html-export>', /"shadow" only applies/],
    ['<html-export name="a"><script type="application/json">{nope</script></html-export>', /invalid JSON/],
    ['<html-export name="a"><script type="module">1</script></html-export>', /exactly one <script type="application\/json">/],
    ['<html-export default><template>x</template></html-export><html-export name="b" default><template>y</template></html-export>', /More than one default/],
    ['<html-export src="./x.html" default></html-export>', /cannot be the default/],
    ['<html-export src="./x.html" import="a"></html-export>', /needs a name/],
    ['<html-import as="ui"></html-import>', /requires a "src" attribute/],
    ['<html-import src="./x.html" as="UI"></html-import>', /Invalid namespace "UI"/],
    ['<html-import src="./x.html" as="a--b"></html-import>', /Invalid namespace "a--b"/],
    ['<html-import src="./x.html"><html-binding element="x-y"></html-binding></html-import>', /requires an "export" attribute/],
  ];
  for (const [html, message] of cases) {
    for (const fn of [read, scan]) {
      assert.throws(() => fn(html), (e) => e instanceof SyntaxError && message.test(e.message) && /m\.html/.test(e.message), `${fn.name}: ${html}`);
    }
  }
});
