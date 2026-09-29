// An HTML module is ordinary HTML. Reading it produces a plain JSON "module
// record": what it imports, what it exports, and its settings. The compiler
// scans source text (no DOM); the browser loader reads a parsed DOM. Both
// must produce the same record, or runtime-loaded and compiled modules would
// disagree. This example reads examples/components/ui.html both ways.
//
//   node examples/01-a-module-reads-into-a-json-record.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { scanHTMLModule, readHTMLModule } from '@johnhenry/html-modules';

const source = await readFile(new URL('./components/ui.html', import.meta.url), 'utf8');

// 1. The scanner: source text in, record out. No DOM involved.
const record = scanHTMLModule(source, 'ui.html');

assert.equal(record.url, 'ui.html');
assert.deepEqual(record.imports, [], 'ui.html imports nothing');
assert.deepEqual(
  record.exports.map((e) => [e.kind, e.name, e.default ?? false]),
  [
    ['component', 'card', false],
    ['component', 'button', false],
    ['component', 'badge', false],
    ['component', 'callout', true], // name="callout" default: named, and also the default export
    ['data', 'meta', false],
  ],
);

const button = record.exports.find((e) => e.name === 'button');
assert.equal(button.shadow, 'open', 'the built-in default shadow mode');
assert.equal(button.delegatesFocus, true, 'from the delegates-focus attribute');
assert.equal(button.styles.length, 1, '<style> beside the <template> becomes the component styles');
assert.match(button.template, /<button part="button"/);

const meta = record.exports.find((e) => e.name === 'meta');
assert.deepEqual(meta.value, { library: 'ui', version: '1.2.0', components: 4 }, 'a data export holds parsed JSON');

// Everything that is not an <html-export> is private: the trailing <p> is not in the record.
assert.ok(!JSON.stringify(record).includes('This paragraph is not exported'));

// Records are plain JSON: they survive a round trip unchanged.
assert.deepEqual(JSON.parse(JSON.stringify(record)), record);

// 2. The DOM reader: the same source parsed by a DOM (here linkedom; DOMParser in a browser).
const { document } = parseHTML(source);
const fromDOM = readHTMLModule(document, 'ui.html');

// Template HTML is compared after one parse/serialize pass, since a DOM normalizes whitespace in markup.
const normalize = (html) => {
  const t = parseHTML('<template></template>').document.createElement('template');
  t.innerHTML = html;
  return t.innerHTML.replace(/\s+/g, ' ').trim();
};
const comparable = (r) => ({
  ...r,
  exports: r.exports.map((e) => (e.kind === 'component' ? { ...e, template: normalize(e.template) } : e)),
});
assert.deepEqual(comparable(fromDOM), comparable(record), 'the DOM reader and the scanner agree');

console.log(`ok: ui.html → ${record.exports.length} exports (${record.exports.map((e) => `${e.kind} ${e.name}`).join(', ')}); DOM reader and scanner agree`);
