// load="lazy": nothing is fetched until one of an import's tags is actually
// used. A namespace import waits for any tag starting with <as><delimiter>;
// an import with <html-binding> children waits for exactly the tags they bind;
// an import with nothing to wait for (no `as`, no tag-producing binding) is an
// error, since nothing could ever load it. el.load() loads any other now. The JavaScript
// form returns a handle instead of a promise. linkedom stands in for the
// browser (it has MutationObserver), and fetch reads from disk.
//
//   node examples/06-lazy-import-fetches-on-first-use.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { createHTMLModules, defineHTMLModuleElements, lazyTargets } from '@johnhenry/html-modules';

const here = new URL('./', import.meta.url).href;
const fetched = [];
const fetch = async (url) => {
  fetched.push(String(url).replace(here, './'));
  const text = await readFile(fileURLToPath(url), 'utf8');
  return { ok: true, status: 200, text: async () => text };
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

const { window } = parseHTML('<!doctype html><html><head></head><body></body></html>');
const HTMLModules = createHTMLModules({ window, baseURL: here, fetch });
defineHTMLModuleElements({ modules: HTMLModules, window });
const { document, customElements } = window;

// What each kind of import waits for.
assert.deepEqual(lazyTargets({ as: 'ui' }), { tags: [], prefixes: ['ui--'] });
assert.deepEqual(lazyTargets({ as: 'ui', delimiter: '-' }), { tags: [], prefixes: ['ui-'] });
assert.deepEqual(lazyTargets({ bindings: [{ export: 'default', element: 'my-tip' }] }), { tags: ['my-tip'], prefixes: [] });
assert.deepEqual(lazyTargets({}), { tags: [], prefixes: [] }, 'nothing to wait for: a lazy import like that is an error');

document.body.innerHTML = `
  <html-import-settings load="lazy"></html-import-settings>
  <html-import id="ui" src="./components/ui.html" as="ui"></html-import>
  <html-import id="tip" src="./components/tip.html"><html-binding export="default" element="my-tip"></html-binding></html-import>
  <html-import id="icons" src="./components/icons.html" as="icon" load="eager"></html-import>`;
const [ui, tip, icons] = ['ui', 'tip', 'icons'].map((id) => document.getElementById(id));

await icons.ready;
await settle();
assert.deepEqual(fetched, ['./components/icons.html'], 'load="eager" on one import overrides the document setting; the lazy ones fetch nothing');
assert.equal(ui.state, 'waiting');
assert.equal(tip.state, 'waiting');

// Another namespace's tags do not count.
document.body.insertAdjacentHTML('beforeend', '<icon--star></icon--star><other--card></other--card>');
await settle();
assert.equal(ui.state, 'waiting');

// The first <ui--…> element loads ui.html, registers its tags and upgrades the element in place.
document.body.insertAdjacentHTML('beforeend', '<ui--badge id="b">new</ui--badge>');
await ui.ready;
assert.equal(ui.state, 'loaded');
assert.ok(customElements.get('ui--badge'));
assert.ok(document.getElementById('b').shadowRoot, 'upgraded in place');
assert.deepEqual(fetched, ['./components/icons.html', './components/ui.html']);

// el.load() forces loading, even though no <my-tip> exists yet.
assert.equal(tip.state, 'waiting');
await tip.load();
assert.ok(customElements.get('my-tip'));

// The JavaScript form: a handle, returned synchronously; nothing is fetched until use or load().
const handle = HTMLModules.import('./components/themes.html', { as: 'th', load: 'lazy' });
assert.equal(typeof handle.then, 'undefined', 'a handle, not a promise: `await` would not wait for use');
assert.equal(handle.state, 'waiting');
await settle();
assert.ok(!fetched.includes('./components/themes.html'));
const result = await handle.load();
assert.equal(handle.state, 'loaded');
assert.deepEqual(Object.keys(result.elements), [], 'themes.html exports stylesheets only: nothing to register');

// cancel() before loading stops the watching; ready stays pending until load().
const cancelled = HTMLModules.import('./components/kit.html', { as: 'kit', load: 'lazy' });
cancelled.cancel();
assert.equal(cancelled.state, 'cancelled');

console.log(`ok: lazy imports fetched only on first use or load(): ${fetched.join(', ')}`);
