// The namespace delimiter: "--" by default, configurable per import, per API
// call, per instance and in the compiler's register format (an extension of
// PRD §12, which fixes "--").
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DELIMITER, bindingName, parseBindingName, isValidDelimiter, bindModule, registerComponents, applyBinding,
  defineHTMLComponent, defineHTMLStylesheet, createHTMLModules, compileHTMLModule, readHTMLModule, scanHTMLModule,
} from '../src/index.js';
import { main } from '../bin/html-module.js';
import { setup, makeWindow, shared, fixtures } from './helpers.js';
import { specParse } from './spec-dom.js';

const runtime = new URL('../src/runtime.js', import.meta.url).href;
const once = (el, type) => new Promise((resolve) => el.addEventListener(type, (e) => resolve(e), { once: true }));
const module = (...names) => ({ components: Object.fromEntries(names.map((n) => [n, defineHTMLComponent({ name: n, template: n })])) });

const UI = `<html-export name="card"><template>c</template></html-export>
  <html-export name="custom-card"><template>cc</template></html-export>
  <html-export name="theme"><style>p{}</style></html-export>`;
const KIT = '<html-export name="card"><template>k</template></html-export>';

function page(html, options = {}) {
  const env = setup({ elements: true, files: { 'ui.html': UI, 'kit.html': KIT, ...options.files }, ...options });
  env.document.body.innerHTML = html;
  env.$ = (sel) => env.document.querySelector(sel);
  return env;
}

let dir;
before(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-delim-')));
});

test('names: bindingName takes a delimiter; the default is "--"', () => {
  assert.equal(DELIMITER, '--');
  assert.equal(bindingName('ui', 'card'), 'ui--card');
  assert.equal(bindingName('ui', 'custom-card', '-'), 'ui-custom-card');
  assert.equal(bindingName('ui', 'custom-card', '.'), 'ui.custom-card');
  assert.equal(bindingName('ui', 'card', '_x-'), 'ui_x-card');
  assert.equal(bindingName('ui', 'card', '·-'), 'ui·-card', 'PCEN characters are allowed');
});

test('invalid delimiters: empty, upper case, whitespace, characters not allowed in element names', () => {
  for (const d of ['', 'A', '-X', ' ', 'a b', '\t', ':', '/', '>', '"', '--\n']) {
    assert.equal(isValidDelimiter(d), false, JSON.stringify(d));
    assert.throws(() => bindingName('ui', 'card', d), (e) => e instanceof SyntaxError && /Invalid delimiter/.test(e.message), JSON.stringify(d));
  }
  for (const d of ['--', '-', '.', '_', '-_-', 'x', '9', '·']) assert.equal(isValidDelimiter(d), true, d);
  assert.equal(isValidDelimiter(undefined), false);
  assert.throws(() => bindModule(module('card'), { as: 'ui', delimiter: 'A', window: makeWindow() }), /Invalid delimiter "A"/);
});

test('a tag the delimiter makes invalid is an error naming the tag and the reason', () => {
  assert.throws(() => bindingName('ui', 'card', '.'), (e) => e instanceof SyntaxError
    && e.message.includes('<ui.card>') && /no hyphen/.test(e.message) && /delimiter "\."/.test(e.message));
  assert.throws(() => bindingName('ui', 'card', '_'), /<ui_card> is not a valid custom element name \(it has no hyphen\)/);
  assert.throws(() => bindingName('font', 'face', '-'), /<font-face> .*reserved/);
  // Nothing is registered when any tag of a namespace import is invalid.
  const win = makeWindow();
  assert.throws(() => registerComponents(module('custom-card', 'card'), { as: 'dot', delimiter: '.', window: win }), /<dot\.card>/);
  assert.equal(win.customElements.get('dot.custom-card'), undefined, 'checked before registering anything');
});

test('parseBindingName: a display helper that returns null when a tag does not split one way', () => {
  assert.deepEqual(parseBindingName('ui--custom-card'), { namespace: 'ui', name: 'custom-card' });
  assert.deepEqual(parseBindingName('ui-card', '-'), { namespace: 'ui', name: 'card' });
  assert.equal(parseBindingName('ui-custom-card', '-'), null, 'ui + custom-card, or ui-custom + card');
  assert.deepEqual(parseBindingName('ui.custom-card', '.'), { namespace: 'ui', name: 'custom-card' });
  assert.equal(parseBindingName('custom-card'), null);
  assert.equal(parseBindingName('ui--card', 'A'), null);
});

test('<html-import delimiter="-"> registers <ui-custom-card>; the default stays "--"', async () => {
  const { $, window } = page(`<html-import id="a" src="./ui.html" as="ui" delimiter="-"></html-import>
    <html-import id="b" src="./ui.html" as="ui"></html-import>`);
  const [a, b] = await Promise.all([$('#a').ready, $('#b').ready]);
  assert.deepEqual(Object.keys(a.elements).sort(), ['ui-card', 'ui-custom-card']);
  assert.deepEqual(Object.keys(b.elements).sort(), ['ui--card', 'ui--custom-card']);
  assert.equal(window.customElements.get('ui-custom-card').component, a.module.customCard);
  assert.equal($('#a').delimiter, '-');
  assert.equal($('#b').delimiter, '--');
  assert.deepEqual(a.tags['ui-custom-card'], { tag: 'ui-custom-card', namespace: 'ui', export: 'custom-card' });
  assert.deepEqual($('#a').tags, a.tags);
});

test('"-" end to end: tags are recorded, never parsed, so ambiguous tags still map back correctly', async () => {
  const { $ } = page(`<html-import id="a" src="./ui.html" as="ui" delimiter="-"></html-import>
    <html-import id="b" src="./kit.html" as="ui-kit" delimiter="-"></html-import>
    <html-import id="c" src="./ui.html" as="sel" delimiter="-">
      <html-binding export="custom-card"></html-binding>
      <html-binding export="card" element="plain-card"></html-binding>
      <html-binding export="theme" adopt></html-binding>
    </html-import>`);
  const [, b, c] = await Promise.all(['#a', '#b', '#c'].map((s) => $(s).ready));
  // "ui-kit-card" splits as ui + kit-card or ui-kit + card; the record knows which.
  assert.equal(parseBindingName('ui-kit-card', '-'), null);
  assert.deepEqual(b.tags['ui-kit-card'], { tag: 'ui-kit-card', namespace: 'ui-kit', export: 'card' });
  assert.equal($('#a').tags['ui-card'].export, 'card');
  assert.deepEqual(c.tags, {
    'sel-custom-card': { tag: 'sel-custom-card', namespace: 'sel', export: 'custom-card' },
    'plain-card': { tag: 'plain-card', namespace: null, export: 'card' },
  });
  const r = applyBinding(module('custom-card'), { export: 'custom-card' }, { as: 'x-y', delimiter: '-', window: makeWindow() });
  assert.deepEqual([r.tag, r.namespace, r.export], ['x-y-custom-card', 'x-y', 'custom-card']);
});

test('delimiter="." with a one-word export fails through the usual error pathway', async () => {
  const { $, window } = page(`<html-import id="ns" src="./ui.html" as="ui" delimiter="."></html-import>
    <html-import id="sel" src="./ui.html" as="sel" delimiter=".">
      <html-binding export="card"></html-binding>
      <html-binding export="custom-card"></html-binding>
    </html-import>`);
  const nsError = once($('#ns'), 'error');
  const bindingError = once($('#sel html-binding'), 'error');
  await assert.rejects($('#ns').ready, /<ui\.card> is not a valid custom element name \(it has no hyphen\)/);
  assert.match((await nsError).detail.error.message, /<ui\.card>/);
  assert.equal(window.customElements.get('ui.custom-card'), undefined, 'a namespace import registers nothing if any tag is invalid');
  await assert.rejects($('#sel').ready, /<sel\.card>/);
  assert.match((await bindingError).detail.error.message, /<sel\.card>.*no hyphen/);
  assert.ok(window.customElements.get('sel.custom-card'), 'one failing binding does not stop the others');
});

test('invalid delimiter attributes are errors on the import', async () => {
  for (const d of ['', 'A', 'a b', ':']) {
    const { $ } = page(`<html-import src="./ui.html" as="ui" delimiter="${d}"></html-import>`);
    const error = once($('html-import'), 'error');
    await assert.rejects($('html-import').ready, /Invalid delimiter/, JSON.stringify(d));
    assert.match((await error).detail.error.message, /Invalid delimiter/);
  }
});

test('createHTMLModules({ delimiter }) sets the instance default; attributes and options override it', async () => {
  const { $, window, modules } = page(`<html-import id="a" src="./ui.html" as="ui"></html-import>
    <html-import id="b" src="./ui.html" as="ui" delimiter="--"></html-import>`, { delimiter: '-' });
  assert.equal(modules.delimiter, '-');
  const [a, b] = await Promise.all([$('#a').ready, $('#b').ready]);
  assert.deepEqual(Object.keys(a.elements).sort(), ['ui-card', 'ui-custom-card']);
  assert.deepEqual(Object.keys(b.elements).sort(), ['ui--card', 'ui--custom-card']);
  const viaImport = await modules.import('./ui.html', { as: 'api' });
  assert.deepEqual(Object.keys(viaImport.elements).sort(), ['api-card', 'api-custom-card']);
  const override = await modules.import('./ui.html', { as: 'api', delimiter: '-x-' });
  assert.deepEqual(Object.keys(override.tags).sort(), ['api-x-card', 'api-x-custom-card']);
  const bound = modules.bind(override.module, { as: 'bound', delimiter: '--' });
  assert.deepEqual(Object.keys(bound.elements).sort(), ['bound--card', 'bound--custom-card']);
  assert.ok(window.customElements.get('bound--card'));
  await assert.rejects(modules.import('./ui.html', { as: 'api', delimiter: '.' }), /<api\.card>/);
  await assert.rejects(modules.import('./ui.html', { as: 'api', delimiter: '' }), /Invalid delimiter ""/);
  assert.throws(() => createHTMLModules({ window: makeWindow(), delimiter: 'UI' }), /Invalid delimiter "UI"/);
  assert.equal(createHTMLModules({ window: makeWindow() }).delimiter, '--');
});

test('bindModule / registerComponents / applyBinding take a delimiter option', () => {
  const win = makeWindow();
  const ns = { ...module('custom-card'), theme: defineHTMLStylesheet({ css: 'p{}' }) };
  assert.deepEqual(Object.keys(registerComponents(ns, { as: 'r', delimiter: '-', window: win })), ['r-custom-card']);
  const all = bindModule(ns, { as: 'b', delimiter: '_-', window: win });
  assert.deepEqual(all.tags, { 'b_-custom-card': { tag: 'b_-custom-card', namespace: 'b', export: 'custom-card' } });
  const some = bindModule(ns, { as: 's', delimiter: '-', window: win, bindings: [{ export: 'custom-card' }] });
  assert.deepEqual(Object.keys(some.elements), ['s-custom-card']);
});

const COMPACT = `<html-import src="./icons.html" as="ic" delimiter="-"></html-import>
<html-import src="./icons.html" as="icon"></html-import>
<html-export name="stars"><template><ic-star></ic-star><icon--heart></icon--heart></template></html-export>`;

test('module-internal imports carry their delimiter in the record; the DOM reader and scanner agree', async () => {
  const doc = specParse(COMPACT);
  const [a, b] = [readHTMLModule(doc, 'c.html'), scanHTMLModule(COMPACT, 'c.html')];
  assert.deepEqual(a.imports, b.imports);
  assert.deepEqual(a.imports, [
    { src: './icons.html', as: 'ic', delimiter: '-', bindings: [] },
    { src: './icons.html', as: 'icon', bindings: [] },
  ]);
  for (const [html, message] of [
    ['<html-import src="./x.html" as="x" delimiter=""></html-import>', /Invalid delimiter "".* in m\.html/],
    ['<html-import src="./x.html" as="x" delimiter="A"></html-import>', /Invalid delimiter "A".* in m\.html/],
  ]) {
    assert.throws(() => scanHTMLModule(html, 'm.html'), message);
    assert.throws(() => readHTMLModule(specParse(html), 'm.html'), message);
  }
});

test('a module\'s own imports use "--" unless they say otherwise, whatever the instance default', async () => {
  const icons = await readFile(new URL('icons.html', fixtures), 'utf8');
  const { $, window } = page('<html-import src="./compact.html" as="app"></html-import><app-stars></app-stars>', {
    delimiter: '-', files: { 'compact.html': COMPACT, 'icons.html': icons },
  });
  await $('html-import').ready;
  for (const tag of ['app-stars', 'ic-star', 'icon--heart']) assert.ok(window.customElements.get(tag), tag);
  assert.equal(window.customElements.get('icon-heart'), undefined);
  const root = $('app-stars').shadowRoot;
  assert.ok(root.querySelector('ic-star').shadowRoot, 'the dependency upgraded inside the component');
});

test('compiler: delimiter for the register format, dependency delimiters, errors, and the CLI flag', async () => {
  const icons = await readFile(new URL('icons.html', fixtures), 'utf8');
  const js = compileHTMLModule(icons, { url: 'icons.html', runtime, format: 'register', as: 'dash', delimiter: '-' });
  assert.match(js, /registerComponents\(\{ components: \$components \}, \{ as: "dash", delimiter: "-", from: import\.meta\.url \}\);/);
  assert.doesNotMatch(compileHTMLModule(icons, { runtime, format: 'register', as: 'x' }), /delimiter/, 'the default is not written out');
  await writeFile(join(dir, 'dash.register.js'), js);
  await import(pathToFileURL(join(dir, 'dash.register.js')).href);
  assert.ok(shared.customElements.get('dash-star') && shared.customElements.get('dash-heart'));
  assert.throws(() => compileHTMLModule(icons, { format: 'register', as: 'dot', delimiter: '.' }), /<dot\.star> is not a valid custom element name \(it has no hyphen\)/);
  assert.throws(() => compileHTMLModule(icons, { format: 'register', as: 'x', delimiter: 'A' }), /Invalid delimiter "A"/);
  assert.throws(() => compileHTMLModule(icons, { delimiter: '' }), /Invalid delimiter ""/);
  // Dependencies keep their delimiter in compiled output, and render the same as at runtime.
  await writeFile(join(dir, 'icons.js'), compileHTMLModule(icons, { url: 'icons.html', runtime }));
  const compact = compileHTMLModule(COMPACT, { url: 'compact.html', runtime });
  assert.match(compact, /as: "ic", delimiter: "-", bindings: \[\]/);
  await writeFile(join(dir, 'compact.js'), compact);
  const win = makeWindow();
  bindModule(await import(pathToFileURL(join(dir, 'compact.js')).href), { as: 'cp', delimiter: '-', window: win });
  win.document.body.innerHTML = '<cp-stars></cp-stars>';
  assert.ok(win.customElements.get('ic-star') && win.customElements.get('icon--heart'));
  assert.ok(win.document.querySelector('cp-stars').shadowRoot.querySelector('ic-star').shadowRoot);
  // CLI
  const io = () => {
    const out = { text: '', write: (t) => (out.text += t) };
    return out;
  };
  await writeFile(join(dir, 'cli.html'), icons);
  const stdout = io();
  assert.equal(await main([join(dir, 'cli.html'), '--format', 'register', '--as', 'cli', '--delimiter', '-', '--stdout', '--runtime', runtime], { stdout, stderr: io() }), 0);
  assert.match(stdout.text, /as: "cli", delimiter: "-"/);
  const stderr = io();
  assert.equal(await main([join(dir, 'cli.html'), '--format', 'register', '--as', 'cli', '--delimiter', '.', '--stdout'], { stdout: io(), stderr }), 1);
  assert.match(stderr.text, /SyntaxError: .*<cli\.star>.*no hyphen/);
  const help = io();
  await main(['--help'], { stdout: help, stderr: io() });
  assert.match(help.text, /--delimiter <d>/);
});
