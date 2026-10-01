// <html-import-settings> and <html-module-settings>: document-level defaults
// (an extension beyond the PRD, which fixes "--" and has no settings element).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createHTMLModules, defineHTMLComponent, bindModule, registerComponents, readHTMLModule, scanHTMLModule, compileHTMLModule,
  rebaseSpecifier, componentRoot, resolveImportOptions, readImportSettings, readModuleSettings, IMPORT_DEFAULTS,
} from '../src/index.js';
import { main } from '../bin/html-module.js';
import { setup, makeWindow, shared, tick, ORIGIN } from './helpers.js';
import { specParse } from './spec-dom.js';

const runtime = new URL('../src/runtime.js', import.meta.url).href;
const once = (el, type) => new Promise((resolve) => el.addEventListener(type, (e) => resolve(e), { once: true }));
const both = (html, url = 'm.html') => [readHTMLModule(specParse(html), url), scanHTMLModule(html, url)];

const UI = `<html-export name="card"><template>c</template></html-export>
  <html-export name="custom-card"><template>cc</template></html-export>`;
const OTHER = '<html-export name="card"><template>other</template></html-export>';
const ICONS = '<html-export name="star"><template>*</template></html-export>';

/** A page: `head` goes in <head>, `body` in <body> (in that order, as a parser would). */
function page({ head = '', body = '', files = {}, reportError = true, ...options } = {}) {
  const env = setup({ elements: true, files: { 'ui.html': UI, 'other.html': OTHER, 'icons.html': ICONS, ...files }, ...options });
  env.reported = [];
  if (reportError) env.window.reportError = (e) => env.reported.push(e);
  env.document.head.innerHTML = head;
  env.document.body.innerHTML = body;
  env.$ = (sel) => env.document.querySelector(sel);
  return env;
}

let dir;
before(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-settings-')));
});

// ---------------------------------------------------------------------------
// Validation

test('settings vocabulary: defaults, validation with the valid values in the message', () => {
  assert.deepEqual({ ...IMPORT_DEFAULTS }, { delimiter: '--', conflict: 'error', load: 'eager', errors: 'event' });
  assert.deepEqual(readImportSettings({ delimiter: '-', base: './v/', conflict: 'reuse', load: 'lazy', errors: 'throw', id: 's', class: 'x', 'data-note': 'y' }),
    { delimiter: '-', base: './v/', conflict: 'reuse', load: 'lazy', errors: 'throw' });
  assert.throws(() => readImportSettings({ conflict: 'replace' }), /Invalid conflict="replace" on <html-import-settings>: use "error" or "reuse"/);
  assert.throws(() => readImportSettings({ load: 'later' }), /Invalid load="later".*"eager" or "lazy"/);
  assert.throws(() => readImportSettings({ errors: 'log' }), /Invalid errors="log".*"event" or "throw"/);
  assert.throws(() => readImportSettings({ delimiter: 'A' }), /Invalid delimiter "A"/);
  assert.throws(() => readImportSettings({ base: ' ' }), /Invalid base/);
  assert.throws(() => readImportSettings({ shadow: 'open' }), /Unknown attribute "shadow" on <html-import-settings>: use "delimiter", "base", "conflict", "load", "errors"/);
  assert.deepEqual(readModuleSettings({ shadow: 'closed', 'delegates-focus': '' }), { shadow: 'closed', delegatesFocus: true });
  assert.deepEqual(readModuleSettings({ 'delegates-focus': 'false' }), { delegatesFocus: false });
  assert.throws(() => readModuleSettings({ shadow: 'none' }), /Invalid shadow="none" on <html-module-settings>: use "open" or "closed"/);
  assert.throws(() => readModuleSettings({ 'delegates-focus': 'maybe' }), /boolean attribute/);
  assert.throws(() => readModuleSettings({ delimiter: '-' }), /Unknown attribute "delimiter" on <html-module-settings>: use "shadow", "delegates-focus"/);
  assert.deepEqual(resolveImportOptions({ delimiter: '-' }, { delimiter: '_', load: 'lazy' }, { conflict: 'reuse' }),
    { delimiter: '-', conflict: 'reuse', load: 'lazy', errors: 'event' });
  for (const [k, v] of [['delimiter', 'UI'], ['conflict', 'x'], ['load', 'x'], ['errors', 'x'], ['base', '']]) {
    assert.throws(() => createHTMLModules({ window: makeWindow(), [k]: v }), /in createHTMLModules\(\)/, k);
  }
  assert.deepEqual({ ...createHTMLModules({ window: makeWindow() }).options }, { ...IMPORT_DEFAULTS });
});

// ---------------------------------------------------------------------------
// <html-import-settings> in a page

test('<html-import-settings> sets the defaults for the imports in its document', async () => {
  const { $, window } = page({
    head: '<html-import-settings delimiter="-" conflict="reuse"></html-import-settings>',
    body: '<html-import id="a" src="./ui.html" as="ui"></html-import>',
  });
  const a = await $('#a').ready;
  assert.deepEqual(Object.keys(a.elements).sort(), ['ui-card', 'ui-custom-card']);
  assert.equal($('#a').delimiter, '-');
  assert.deepEqual({ ...$('#a').settings, base: undefined }, { delimiter: '-', conflict: 'reuse', load: 'eager', errors: 'event', base: undefined });
  assert.ok($('html-import-settings').active);
  assert.equal($('html-import-settings').error, null);
  assert.ok(window.customElements.get('ui-card'));
});

test('precedence: attribute > document settings > instance options > built-in defaults', async () => {
  const { $ } = page({
    delimiter: '_-', conflict: 'reuse', errors: 'throw',
    head: '<html-import-settings delimiter="-" errors="event"></html-import-settings>',
    body: `<html-import id="attr" src="./ui.html" as="a" delimiter="--" conflict="error" errors="throw" load="eager"></html-import>
      <html-import id="doc" src="./ui.html" as="d"></html-import>`,
  });
  assert.deepEqual({ ...$('#attr').settings, base: 0 }, { delimiter: '--', conflict: 'error', load: 'eager', errors: 'throw', base: 0 });
  assert.deepEqual({ ...$('#doc').settings, base: 0 }, { delimiter: '-', conflict: 'reuse', load: 'eager', errors: 'event', base: 0 }, 'conflict from the instance');
  assert.deepEqual(Object.keys((await $('#attr').ready).elements).sort(), ['a--card', 'a--custom-card']);
  assert.deepEqual(Object.keys((await $('#doc').ready).elements).sort(), ['d-card', 'd-custom-card']);
  // Without document settings, the instance options apply; without those, the defaults.
  const inst = page({ delimiter: '_-', body: '<html-import src="./ui.html" as="i"></html-import>' });
  assert.deepEqual(Object.keys((await inst.$('html-import').ready).elements).sort(), ['i_-card', 'i_-custom-card']);
  const plain = page({ body: '<html-import src="./ui.html" as="p"></html-import>' });
  assert.equal(plain.$('html-import').delimiter, '--');
  assert.deepEqual({ ...plain.$('html-import').settings, base: 0 }, { ...IMPORT_DEFAULTS, base: 0 });
});

test('per-import attributes are validated; base is document-level only', async () => {
  for (const [attrs, message] of [
    ['conflict="replace"', /Invalid conflict="replace" on <html-import>: use "error" or "reuse"/],
    ['load="soon"', /Invalid load="soon" on <html-import>: use "eager" or "lazy"/],
    ['errors="loud"', /Invalid errors="loud" on <html-import>: use "event" or "throw"/],
    ['base="./v/"', /"base" cannot be set on <html-import>.*<html-import-settings base/],
  ]) {
    const { $ } = page({ body: `<html-import src="./ui.html" as="ui" ${attrs}></html-import>` });
    const error = once($('html-import'), 'error');
    await assert.rejects($('html-import').ready, message, attrs);
    assert.match((await error).detail.error.message, message);
    assert.equal($('html-import').state, 'error');
  }
});

test('placement: a settings element after an <html-import> is an error and changes nothing', async () => {
  const { $, window } = page({
    body: `<html-import id="a" src="./ui.html" as="ui"></html-import>
      <html-import-settings delimiter="-"></html-import-settings>
      <html-import id="b" src="./ui.html" as="kit"></html-import>`,
  });
  const settings = $('html-import-settings');
  const error = await once(settings, 'error');
  assert.match(error.detail.error.message, /<html-import-settings> must come before any <html-import> in its document/);
  assert.equal(settings.error, error.detail.error);
  assert.equal(settings.active, false);
  await Promise.all([$('#a').ready, $('#b').ready]);
  assert.ok(window.customElements.get('ui--card') && window.customElements.get('kit--card'), 'both imports use the defaults');
  assert.equal(window.customElements.get('kit-card'), undefined);
});

test('placement: a settings element inserted after imports started is late, wherever it lands', async () => {
  const { $, document, window } = page({ body: '<html-import id="a" src="./ui.html" as="ui"></html-import>' });
  await $('#a').ready;
  const late = document.createElement('html-import-settings');
  late.setAttribute('delimiter', '-');
  document.head.prepend(late);
  assert.match((await once(late, 'error')).detail.error.message, /arrived after imports had started/);
  document.body.insertAdjacentHTML('beforeend', '<html-import id="b" src="./ui.html" as="kit"></html-import>');
  await $('#b').ready;
  assert.ok(window.customElements.get('kit--card'));
});

test('at most one per document: a second is an error and ignored; the first applies', async () => {
  const { $, window } = page({
    head: '<html-import-settings id="one" delimiter="-"></html-import-settings><html-import-settings id="two" delimiter="_-"></html-import-settings>',
    body: '<html-import src="./ui.html" as="ui"></html-import>',
  });
  assert.match((await once($('#two'), 'error')).detail.error.message, /More than one <html-import-settings> in this document/);
  await $('html-import').ready;
  assert.ok(window.customElements.get('ui-card'));
  assert.ok($('#one').active);
  assert.equal($('#two').active, false);
});

test('invalid settings: an error on the element, and every import of the document fails with it', async () => {
  for (const [attrs, message] of [
    ['conflict="merge"', /Invalid conflict="merge" on <html-import-settings>: use "error" or "reuse"/],
    ['load="whenever"', /Invalid load="whenever"/],
    ['delimiter=":"', /Invalid delimiter ":"/],
    ['shadow="closed"', /Unknown attribute "shadow" on <html-import-settings>/],
  ]) {
    const { $, window } = page({ head: `<html-import-settings ${attrs}></html-import-settings>`, body: '<html-import src="./ui.html" as="ui"></html-import>' });
    const onSettings = once($('html-import-settings'), 'error');
    const onImport = once($('html-import'), 'error');
    await assert.rejects($('html-import').ready, message, attrs);
    assert.match((await onSettings).detail.error.message, message);
    assert.match((await onImport).detail.error.message, message);
    assert.equal(window.customElements.get('ui--card'), undefined);
  }
});

test('base: resolved against the document URL (not <base>), for every <html-import src>, and nothing else', async () => {
  const lib = { 'lib/v2/ui.html': UI.replace('>c<', '>v2<') };
  const env = setup({ elements: true, files: lib });
  const { document, modules, fetch } = env;
  Object.defineProperty(document, 'URL', { value: `${ORIGIN}pages/app/index.html` });
  Object.defineProperty(document, 'baseURI', { value: `${ORIGIN}elsewhere/` }); // like a <base href>
  document.head.innerHTML = '<html-import-settings base="../../lib/v2/"></html-import-settings>';
  document.body.innerHTML = `<html-import id="rel" src="./ui.html" as="ui"></html-import>
    <html-import id="abs" src="${ORIGIN}lib/v2/ui.html" as="abs"></html-import>`;
  const $ = (s) => document.querySelector(s);
  const rel = await $('#rel').ready;
  assert.equal($('#rel').settings.base, `${ORIGIN}lib/v2/`);
  assert.ok(fetch.log.includes(`${ORIGIN}lib/v2/ui.html`), fetch.log.join());
  assert.equal((await $('#abs').ready).module, rel.module, 'absolute src is unaffected, and the same URL');
  assert.equal(document.baseURI, `${ORIGIN}elsewhere/`, 'the page base is untouched');
  assert.equal(modules.resolve('./ui.html'), `${ORIGIN}ui.html`, 'the programmatic API is untouched');
  // The instance option is the fallback, below the document's settings.
  const inst = setup({ elements: true, base: './lib/v2/', files: lib });
  inst.document.body.innerHTML = '<html-import src="./ui.html" as="ui"></html-import>';
  await inst.document.querySelector('html-import').ready;
  assert.equal(inst.modules.base, `${ORIGIN}lib/v2/`);
  assert.deepEqual(inst.fetch.log, [`${ORIGIN}lib/v2/ui.html`]);
});

test('conflict: "error" by default; "reuse" keeps the existing definition and records it', async () => {
  const { $, window, modules } = page({
    body: `<html-import id="first" src="./other.html" as="ui"></html-import>`,
  });
  const first = await $('#first').ready;
  const Existing = window.customElements.get('ui--card');
  assert.equal(Existing.component, first.module.card);
  window.document.body.insertAdjacentHTML('beforeend', `<html-import id="err" src="./ui.html" as="ui"></html-import>
    <html-import id="reuse" src="./ui.html" as="ui" conflict="reuse"></html-import>
    <html-import id="same" src="./other.html" as="ui"></html-import>
    <html-import id="sel" src="./ui.html" as="ui" conflict="reuse"><html-binding export="card"></html-binding><html-binding export="custom-card" element="x-custom"></html-binding></html-import>`);
  await assert.rejects($('#err').ready, /Cannot bind <ui--card>: it is already defined by "card" from .*other\.html \(conflict="reuse" keeps the existing definition instead\)/);
  const reuse = await $('#reuse').ready;
  assert.deepEqual(reuse.tags['ui--card'], { tag: 'ui--card', namespace: 'ui', export: 'card', reused: true });
  assert.equal(reuse.elements['ui--card'], Existing, 'the existing class');
  assert.deepEqual(reuse.tags['ui--custom-card'], { tag: 'ui--custom-card', namespace: 'ui', export: 'custom-card' }, 'new tags are registered as usual');
  const same = await $('#same').ready;
  assert.equal(same.tags['ui--card'].reused, undefined, 'the same definition again is a no-op, not a reuse');
  const sel = await $('#sel').ready;
  assert.equal(sel.tags['ui--card'].reused, true);
  assert.equal($('#sel html-binding').isConnected, true);
  // Programmatic and runtime forms.
  const ns = await modules.load('./ui.html');
  assert.throws(() => modules.bind(ns, { as: 'ui' }), /already defined/);
  assert.equal(modules.bind(ns, { as: 'ui', conflict: 'reuse' }).tags['ui--card'].reused, true);
  assert.equal((await modules.import('./ui.html', { as: 'ui', conflict: 'reuse' })).tags['ui--card'].reused, true);
  assert.equal(registerComponents(ns, { as: 'ui', conflict: 'reuse', window })['ui--card'], Existing);
  assert.throws(() => bindModule(ns, { as: 'ui', conflict: 'maybe', window }), /Invalid conflict="maybe"/);
  const reusing = createHTMLModules({ window, conflict: 'reuse', baseURL: ORIGIN });
  assert.equal(reusing.bind(ns, { as: 'ui' }).tags['ui--card'].reused, true, 'the instance option');
  // A tag defined by unrelated code is reused too.
  window.customElements.define('mine--card', class extends window.HTMLElement {});
  assert.equal(bindModule(ns, { as: 'mine', conflict: 'reuse', window }).tags['mine--card'].reused, true);
});

test('errors="throw": failures are also reported with reportError(); the default reports events only', async () => {
  const quiet = page({ body: '<html-import id="q" src="./missing.html" as="ui"></html-import>' });
  const qe = once(quiet.$('#q'), 'error');
  await assert.rejects(quiet.$('#q').ready, /404/);
  await qe;
  await tick();
  assert.deepEqual(quiet.reported, []);

  const loud = page({
    head: '<html-import-settings errors="throw"></html-import-settings>',
    body: `<html-import id="fetch" src="./missing.html" as="ui"></html-import>
      <html-import id="bind" src="./ui.html" as="ui"><html-binding export="nope"></html-binding></html-import>
      <html-import id="quiet" src="./missing.html" errors="event"></html-import>`,
  });
  const { $ } = loud;
  await Promise.allSettled([$('#fetch').ready, $('#bind').ready, $('#quiet').ready]);
  await tick();
  assert.equal(loud.reported.length, 2, loud.reported.map(String).join('\n'));
  assert.match(loud.reported[0].message + loud.reported[1].message, /404/);
  assert.ok(loud.reported.some((e) => /does not provide an export named 'nope'/.test(e.message)), 'binding errors, once');
  // The instance option, and programmatic calls.
  const inst = page({ errors: 'throw', body: '<html-import src="./missing.html"></html-import>' });
  await assert.rejects(inst.$('html-import').ready);
  await assert.rejects(inst.modules.import('./missing.html', { errors: 'event' }));
  await assert.rejects(inst.modules.import('./missing.html'));
  await tick();
  assert.equal(inst.reported.length, 2);
  // Settings errors are reported too when throw applies.
  const bad = page({ head: '<html-import-settings errors="throw" load="x"></html-import-settings>' });
  await once(bad.$('html-import-settings'), 'error');
  await tick();
  assert.match(String(bad.reported[0]), /Invalid load="x"/);
});

test('scope is lexical: page settings never reach a module; a module\'s settings apply only inside it', async () => {
  const MOD = `<html-import-settings delimiter="-"></html-import-settings>
    <html-import src="./icons.html" as="in"></html-import>
    <html-export name="box"><template><in-star></in-star></template></html-export>`;
  const PLAIN = `<html-import src="./icons.html" as="pl"></html-import>
    <html-export name="box"><template><pl--star></pl--star></template></html-export>`;
  const { $, window, document } = page({
    files: { 'mod.html': MOD, 'plain.html': PLAIN },
    head: '<html-import-settings delimiter="_-" conflict="reuse" errors="throw"></html-import-settings>',
    body: '<html-import id="m" src="./mod.html" as="m"></html-import><html-import id="p" src="./plain.html" as="p"></html-import>',
  });
  await Promise.all([$('#m').ready, $('#p').ready]);
  document.body.insertAdjacentHTML('beforeend', '<m_-box></m_-box><p_-box></p_-box>');
  assert.ok(window.customElements.get('in-star'), 'the module\'s own settings');
  assert.ok(window.customElements.get('pl--star'), 'a module without settings uses "--", not the page\'s "_-"');
  assert.equal(window.customElements.get('pl_-star'), undefined);
  assert.ok($('m_-box').shadowRoot.querySelector('in-star').shadowRoot);
  assert.ok($('p_-box').shadowRoot.querySelector('pl--star').shadowRoot);
  // The instance options do not reach modules either.
  const inst = page({ delimiter: '-', files: { 'plain.html': PLAIN }, body: '<html-import src="./plain.html" as="p"></html-import>' });
  await inst.$('html-import').ready;
  assert.ok(inst.window.customElements.get('pl--star'));
  // A module's conflict setting governs its own imports only.
  const reuseMod = `<html-import-settings conflict="reuse"></html-import-settings><html-import src="./other.html" as="ui"></html-import>
    <html-export name="w"><template><ui--card></ui--card></template></html-export>`;
  const errMod = `<html-import src="./other.html" as="ui"></html-import><html-export name="w"><template>x</template></html-export>`;
  const c = page({ files: { 'r.html': reuseMod, 'e.html': errMod }, body: '<html-import id="ui" src="./ui.html" as="ui"></html-import>' });
  await c.$('#ui').ready;
  c.document.body.insertAdjacentHTML('beforeend', '<html-import id="r" src="./r.html" as="r"></html-import><html-import id="e" src="./e.html" as="e"></html-import>');
  await c.$('#r').ready;
  await assert.rejects(c.$('#e').ready, /Cannot bind <ui--card>/);
});

test('module settings: records from the DOM reader and the scanner, placement and duplicates, validation', () => {
  const OK = `<html-import-settings delimiter="-" base="./lib/" conflict="reuse" load="lazy" errors="throw"></html-import-settings>
    <html-module-settings shadow="closed" delegates-focus></html-module-settings>
    <html-import src="./icons.html" as="ic" load="eager" delimiter="--"></html-import>
    <html-import src="./more.html" as="more"></html-import>
    <html-export name="a"><template>a</template></html-export>
    <html-export name="b" shadow="open" delegates-focus="false"><template>b</template></html-export>
    <html-export name="s"><style>p{}</style></html-export>`;
  const [a, b] = both(OK);
  assert.deepEqual(a, b, 'the DOM reader and the scanner agree');
  assert.deepEqual(a.importSettings, { delimiter: '-', base: './lib/', conflict: 'reuse', load: 'lazy', errors: 'throw' });
  assert.deepEqual(a.moduleSettings, { shadow: 'closed', delegatesFocus: true });
  assert.deepEqual(a.imports[0], { src: './icons.html', as: 'ic', delimiter: '--', load: 'eager', bindings: [] });
  assert.deepEqual(a.exports.map((e) => [e.name, e.shadow, e.delegatesFocus]), [['a', 'closed', true], ['b', 'open', false], ['s', undefined, undefined]]);
  const none = both('<html-export name="a"><template>a</template></html-export>');
  for (const r of none) assert.deepEqual([r.importSettings, r.moduleSettings, r.exports[0].shadow, r.exports[0].delegatesFocus], [undefined, undefined, 'open', false]);
  for (const [html, message] of [
    ['<html-import src="./a.html"></html-import><html-import-settings delimiter="-"></html-import-settings>', /<html-import-settings> must come before any <html-import> in m\.html/],
    ['<html-export name="a"><template>a</template></html-export><html-module-settings shadow="closed"></html-module-settings>', /<html-module-settings> must come before any <html-export> in m\.html/],
    ['<html-import-settings></html-import-settings><html-import-settings></html-import-settings>', /More than one <html-import-settings> in m\.html: a module has at most one/],
    ['<html-module-settings></html-module-settings><html-module-settings></html-module-settings>', /More than one <html-module-settings> in m\.html/],
    ['<html-import-settings load="soon"></html-import-settings>', /Invalid load="soon" on <html-import-settings> in m\.html: use "eager" or "lazy"/],
    ['<html-import-settings color="red"></html-import-settings>', /Unknown attribute "color" on <html-import-settings> in m\.html/],
    ['<html-module-settings shadow="half"></html-module-settings>', /Invalid shadow="half" on <html-module-settings> in m\.html: use "open" or "closed"/],
    ['<html-module-settings mode="x"></html-module-settings>', /Unknown attribute "mode" on <html-module-settings>/],
    ['<html-import src="./a.html" base="./x/"></html-import>', /"base" cannot be set on <html-import> in m\.html/],
    ['<html-import src="./a.html" conflict="x"></html-import>', /Invalid conflict="x" on <html-import> in m\.html/],
    ['<html-export name="a" delegates-focus="sometimes"><template>a</template></html-export>', /Invalid delegates-focus="sometimes"/],
    ['<html-import-settings load="lazy"></html-import-settings><html-import src="./t.html"><html-binding export="gold" adopt></html-binding></html-import>', /is lazy but adopts a stylesheet in m\.html/],
  ]) {
    assert.throws(() => scanHTMLModule(html, 'm.html'), message, `scan: ${html}`);
    assert.throws(() => readHTMLModule(specParse(html), 'm.html'), message, `dom: ${html}`);
  }
  // An eager override makes adopt fine again; settings may be unclosed or nested and still read the same.
  both('<html-import-settings load="lazy"></html-import-settings><html-import src="./t.html" load="eager"><html-binding export="gold" adopt></html-binding></html-import>');
  const [u1, u2] = both('<html-import-settings delimiter="-"><html-import src="./a.html" as="a"></html-import>');
  assert.deepEqual(u1, u2);
  assert.equal(u1.importSettings.delimiter, '-');
});

test('<html-module-settings>: default shadow mode and delegatesFocus for a module\'s components, overridden per export', async () => {
  const MOD = `<html-module-settings shadow="closed" delegates-focus></html-module-settings>
    <html-export name="shut"><template><button>s</button></template></html-export>
    <html-export name="open" shadow="open" delegates-focus="false"><template><button>o</button></template></html-export>`;
  const { $, window, document } = page({ files: { 'mod.html': MOD }, body: '<html-import src="./mod.html" as="m"></html-import>' });
  const { module } = await $('html-import').ready;
  assert.deepEqual([module.shut.shadow, module.shut.delegatesFocus], ['closed', true]);
  assert.deepEqual([module.open.shadow, module.open.delegatesFocus], ['open', false]);
  document.body.insertAdjacentHTML('beforeend', '<m--shut></m--shut><m--open></m--open>');
  assert.equal($('m--shut').shadowRoot, null, 'closed: not reachable from outside');
  assert.equal(componentRoot($('m--shut')).querySelector('button').textContent, 's', 'but rendered');
  assert.equal($('m--open').shadowRoot.querySelector('button').textContent, 'o');
  assert.ok(window.customElements.get('m--shut'));
});

test('<html-module-settings> in a page is an error (it has nothing to configure there)', async () => {
  const { $, reported } = page({ errors: 'throw', head: '<html-module-settings shadow="closed"></html-module-settings>', body: '<html-import src="./ui.html" as="ui"></html-import>' });
  const error = await once($('html-module-settings'), 'error');
  assert.match(error.detail.error.message, /only applies inside an HTML module/);
  assert.equal($('html-module-settings').error, error.detail.error);
  await $('html-import').ready; // and it changes nothing else
  await tick();
  assert.equal(reported.length, 1, 'reported loudly under errors="throw"');
});

test('base inside a module: its imports and re-exports resolve against it, relative to the module', async () => {
  const MOD = `<html-import-settings base="./vendor/v1/"></html-import-settings>
    <html-import src="./icons.html" as="ic"></html-import>
    <html-export src="./extra.html"></html-export>
    <html-export name="box"><template><ic--star></ic--star></template></html-export>`;
  const { $, window, fetch } = page({
    files: {
      'pkg/mod.html': MOD,
      'pkg/vendor/v1/icons.html': '<html-export name="star"><template>v1*</template></html-export>',
      'pkg/vendor/v1/extra.html': '<html-export name="extra"><template>e</template></html-export>',
    },
    head: '<html-import-settings base="./pkg/"></html-import-settings>',
    body: '<html-import src="./mod.html" as="m"></html-import>',
  });
  const { module } = await $('html-import').ready;
  assert.deepEqual(Object.keys(module.components).sort(), ['box', 'extra']);
  assert.deepEqual(fetch.log.sort(), [`${ORIGIN}pkg/mod.html`, `${ORIGIN}pkg/vendor/v1/extra.html`, `${ORIGIN}pkg/vendor/v1/icons.html`]);
  window.document.body.insertAdjacentHTML('beforeend', '<m--box></m--box>');
  assert.equal($('m--box').shadowRoot.querySelector('ic--star').shadowRoot.innerHTML, 'v1*');
});

// ---------------------------------------------------------------------------
// Compiler

test('compiler: settings in modules, base-rewritten specifiers, baked export defaults, register conflict, CLI', async () => {
  const MOD = `<html-import-settings delimiter="-" base="./vendor/ui@1/" conflict="reuse" errors="throw" load="lazy"></html-import-settings>
    <html-module-settings shadow="closed"></html-module-settings>
    <html-import src="./icons.html" as="ic"></html-import>
    <html-import src="pkg/x.html" as="px" load="eager" delimiter="--"></html-import>
    <html-export src="../shared/extra.html"></html-export>
    <html-export name="box"><template><ic-star></ic-star></template></html-export>
    <html-export name="lid" shadow="open"><template>l</template></html-export>`;
  const js = compileHTMLModule(MOD, { url: 'mod.html', runtime });
  assert.match(js, /import \* as \$m0 from "\.\/vendor\/ui@1\/icons\.js";/);
  assert.match(js, /import \* as \$m1 from "pkg\/x\.js";/, 'bare specifiers are not rebased');
  assert.match(js, /export \* from "\.\/vendor\/shared\/extra\.js";/);
  assert.match(js, /from: "\.\/icons\.html", as: "ic", delimiter: "-", conflict: "reuse", load: "lazy", errors: "throw", bindings: \[\]/);
  assert.match(js, /from: "pkg\/x\.html", as: "px", delimiter: "--", conflict: "reuse", load: "eager", errors: "throw"/);
  assert.match(js, /name: "box",[\s\S]*?shadow: "closed"/);
  assert.match(js, /name: "lid",[\s\S]*?shadow: "open"/);
  assert.equal(rebaseSpecifier('./a.html', 'https://cdn.test/ui/'), 'https://cdn.test/ui/a.html');
  assert.equal(rebaseSpecifier('./a.html', '/lib/'), '/lib/a.html');
  assert.equal(rebaseSpecifier('./a.html', '../lib/'), '../lib/a.html');
  assert.equal(rebaseSpecifier('./a.html', undefined), './a.html');

  // Compiled lazy imports register eagerly, and render the same.
  await mkdir(join(dir, 'vendor/ui@1'), { recursive: true });
  await writeFile(join(dir, 'vendor/ui@1/icons.js'), compileHTMLModule('<html-export name="star"><template>*</template></html-export>', { url: 'icons.html', runtime }));
  await writeFile(join(dir, 'mod.js'), compileHTMLModule(MOD.replace(/<html-import src="pkg[^\n]*\n/, '').replace(/<html-export src[^\n]*\n/, ''), { url: 'mod.html', runtime }));
  const win = makeWindow();
  bindModule(await import(pathToFileURL(join(dir, 'mod.js')).href), { as: 'cm', window: win });
  assert.ok(win.customElements.get('ic-star'), 'registered with the component, not lazily');
  win.document.body.innerHTML = '<cm--box></cm--box>';
  assert.equal(win.document.querySelector('cm--box').shadowRoot, null, 'closed');
  assert.ok(componentRoot(win.document.querySelector('cm--box')).querySelector('ic-star').shadowRoot);

  // Register format: conflict.
  const icons = '<html-export name="star"><template>*</template></html-export>';
  const reg = compileHTMLModule(icons, { url: 'icons.html', runtime, format: 'register', as: 'rg', conflict: 'reuse' });
  assert.match(reg, /registerComponents\(\{ components: \$components \}, \{ as: "rg", conflict: "reuse", from: import\.meta\.url \}\);/);
  assert.doesNotMatch(compileHTMLModule(icons, { runtime, format: 'register', as: 'rg' }), /conflict/);
  assert.throws(() => compileHTMLModule(icons, { format: 'register', as: 'rg', conflict: 'maybe' }), /Invalid conflict="maybe"/);
  shared.customElements.define('rg--star', class extends shared.HTMLElement {});
  await writeFile(join(dir, 'rg.register.js'), reg);
  await import(pathToFileURL(join(dir, 'rg.register.js')).href); // does not throw: reused
  const io = () => {
    const out = { text: '', write: (t) => (out.text += t) };
    return out;
  };
  await writeFile(join(dir, 'cli.html'), icons);
  const stdout = io();
  assert.equal(await main([join(dir, 'cli.html'), '--format', 'register', '--as', 'cli', '--conflict', 'reuse', '--stdout', '--runtime', runtime], { stdout, stderr: io() }), 0);
  assert.match(stdout.text, /as: "cli", conflict: "reuse"/);
  const help = io();
  await main(['--help'], { stdout: help, stderr: io() });
  assert.match(help.text, /--conflict <mode>/);
  // A module file with settings compiles through the CLI too.
  await writeFile(join(dir, 'set.html'), '<html-module-settings shadow="closed"></html-module-settings><html-export name="z"><template>z</template></html-export>');
  const out = io();
  assert.equal(await main([join(dir, 'set.html'), '--stdout', '--runtime', runtime], { stdout: out, stderr: io() }), 0);
  assert.match(out.text, /shadow: "closed"/);
  const err = io();
  await writeFile(join(dir, 'bad.html'), '<html-export name="z"><template>z</template></html-export><html-module-settings></html-module-settings>');
  assert.equal(await main([join(dir, 'bad.html'), '--stdout'], { stdout: io(), stderr: err }), 1);
  assert.match(err.text, /must come before any <html-export>/);
});

test('the same component definitions from settings, whether loaded at runtime or compiled', async () => {
  const MOD = `<html-module-settings shadow="closed" delegates-focus></html-module-settings>
    <html-export name="a"><template>a</template></html-export>`;
  const { modules } = setup({ files: { 'm.html': MOD } });
  const rt = await modules.load('./m.html');
  await writeFile(join(dir, 'same.js'), compileHTMLModule(MOD, { url: 'm.html', runtime }));
  const cp = await import(pathToFileURL(join(dir, 'same.js')).href);
  for (const k of ['name', 'template', 'shadow', 'delegatesFocus']) assert.deepEqual(cp.a[k], rt.a[k], k);
  assert.ok(defineHTMLComponent(cp.a) === cp.a);
});

test('settings.base: a document with no base URL (about:blank) falls back to the loader\'s, so relative imports still resolve', async () => {
  const env = setup({ elements: true, files: { 'ui.html': UI } });
  const { document, fetch } = env;
  Object.defineProperty(document, 'baseURI', { value: 'about:blank' });
  document.body.innerHTML = '<html-import id="i" src="./ui.html" as="ui"></html-import>';
  await document.querySelector('#i').ready;
  assert.equal(document.querySelector('#i').settings.base, undefined);
  assert.deepEqual(fetch.log, [`${ORIGIN}ui.html`]);
});
