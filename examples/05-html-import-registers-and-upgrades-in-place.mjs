// The runtime end to end, in a DOM: <html-import src as> loads an HTML module
// and registers every component as <as>--<export>; elements written before
// the module arrives upgrade in place; the same definition can live under
// several tags; a tag taken by a different definition is an error unless
// conflict="reuse". linkedom stands in for the browser, and a small fetch
// reads the example modules from disk, so this runs offline in plain Node.
//
//   node examples/05-html-import-registers-and-upgrades-in-place.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { createHTMLModules, defineHTMLModuleElements } from '@johnhenry/html-modules';

const here = new URL('./', import.meta.url).href;
const fetched = [];
const fetch = async (url) => {
  fetched.push(String(url).replace(here, './'));
  try {
    const text = await readFile(fileURLToPath(url), 'utf8');
    return { ok: true, status: 200, text: async () => text };
  } catch {
    return { ok: false, status: 404, text: async () => '' };
  }
};

const { window } = parseHTML('<!doctype html><html><head></head><body></body></html>');
// What src/browser.js does in a page, pointed at this window, this folder and this fetch.
const HTMLModules = createHTMLModules({ window, baseURL: here, fetch });
defineHTMLModuleElements({ modules: HTMLModules, window });
const { document, customElements } = window;

// 1. The element is written BEFORE the import that defines it.
document.body.innerHTML = `
  <ui--card id="early"><b slot="title">Hello</b>An ordinary HTML file defined this element.</ui--card>
  <html-import id="ui" src="./components/ui.html" as="ui"></html-import>`;
const early = document.getElementById('early');
assert.equal(early.shadowRoot, null, 'unknown until the module arrives');

const imp = document.getElementById('ui');
const loaded = new Promise((resolve) => imp.addEventListener('load', (e) => resolve(e.detail), { once: true }));
const { module, elements, tags } = await imp.ready;

assert.deepEqual(Object.keys(elements).sort(), ['ui--badge', 'ui--button', 'ui--callout', 'ui--card'], 'components only: the data export "meta" is not an element');
assert.deepEqual(tags['ui--card'], { tag: 'ui--card', namespace: 'ui', export: 'card' }, 'what each tag was made from is recorded, never parsed');
assert.equal((await loaded).module, module, 'the load event carries the same detail');
assert.equal(imp.state, 'loaded');
// The options in use (base is the document's base URL in a browser; linkedom has none).
const { base, ...options } = imp.settings;
assert.deepEqual(options, { delimiter: '--', conflict: 'error', load: 'eager', errors: 'event' });

// It upgraded in place: a shadow root stamped from the template, light DOM slotted.
assert.equal(early.shadowRoot.querySelector('article').getAttribute('part'), 'card');
assert.equal(early.querySelector('b').slot, 'title');

// 2. The namespace, as JavaScript sees it: frozen, camelCase names, a manifest, a default.
assert.deepEqual(Object.keys(module), ['badge', 'button', 'callout', 'card', 'components', 'default', 'meta']);
assert.equal(module.default, module.callout, 'name="callout" default');
assert.deepEqual(module.meta, { library: 'ui', version: '1.2.0', components: 4 });
assert.ok(Object.isFrozen(module));

// 3. Identity is not the tag: one definition, many tags, each a fresh subclass.
const Card = customElements.get('ui--card');
assert.equal(Card.component, module.card);
const Profile = module.card.define('profile-card', { window });
assert.notEqual(Profile, Card);
assert.equal(Profile.component, Card.component);

// A second namespace for the same module: no second fetch, new tags, same definitions.
await HTMLModules.import('./components/ui.html', { as: 'admin' });
assert.equal(customElements.get('admin--card').component, module.card);
assert.deepEqual(fetched, ['./components/ui.html'], 'one fetch per resolved URL');

// 4. A different module wants the same tag: an error by default, kept with conflict: 'reuse'.
const other = await HTMLModules.load('./components/icons.html');
assert.throws(() => HTMLModules.bind({ components: { card: other.star } }, { as: 'ui' }),
  /Cannot bind <ui--card>: it is already defined by "card" from .*ui\.html \(conflict="reuse" keeps the existing definition instead\)/);
const reused = HTMLModules.bind({ components: { card: other.star } }, { as: 'ui', conflict: 'reuse' });
assert.deepEqual(reused.tags['ui--card'], { tag: 'ui--card', namespace: 'ui', export: 'card', reused: true });
assert.equal(customElements.get('ui--card').component, module.card, 'the first definition stays');

// 5. Selective imports: <html-binding> children bind only what they name, under tags you choose.
document.body.insertAdjacentHTML('beforeend', `
  <html-import id="picked" src="./components/ui.html" as="pick">
    <html-binding export="button" element="brand-button"></html-binding>
    <html-binding export="meta"></html-binding>
  </html-import>`);
const picked = await document.getElementById('picked').ready;
assert.deepEqual(Object.keys(picked.elements), ['brand-button']);
assert.equal(customElements.get('pick--card'), undefined, 'nothing else from the module is registered');
assert.equal(picked.bindings.meta.version, '1.2.0', 'a data binding lands on el.bindings');

console.log(`ok: <html-import as="ui"> registered ${Object.keys(elements).length} tags, upgraded an element written before it, and shared one fetch`);
