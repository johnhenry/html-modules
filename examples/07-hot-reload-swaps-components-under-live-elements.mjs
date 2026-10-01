// Hot reload: custom element definitions cannot be replaced, so registered classes delegate to a swappable
// definition. Re-fetching an edited module re-stamps live elements in place and swaps their styles; a change that
// cannot be applied under live elements (here: a new shadow mode) is reported as `reload: true` and changes nothing.
//
//   node examples/07-hot-reload-swaps-components-under-live-elements.mjs
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createHTMLModules } from '@johnhenry/html-modules';

const files = { '/card.html': '<html-export name="card" props="who"><template><p>v1 {{who}}</p></template></html-export>' };
const win = parseHTML('<!doctype html><html><body></body></html>').window;
const modules = createHTMLModules({
  window: win,
  baseURL: 'http://example.test/',
  fetch: async (url) => ({ ok: true, status: 200, text: async () => files[new URL(url).pathname] }),
});

await modules.import('./card.html', { as: 'ui' });
win.document.body.insertAdjacentHTML('beforeend', '<ui--card who="Ada"><i>light DOM</i></ui--card>');
const card = win.document.body.firstElementChild;
const root = card.shadowRoot;
assert.equal(root.querySelector('p').textContent, 'v1 Ada');

// Edit the module: the same element gets the new template, bound to its attributes.
files['/card.html'] = '<html-export name="card" props="who"><template><section>v2 {{who}}</section></template></html-export>';
const result = await modules.hotReload('./card.html');
assert.deepEqual({ reload: result.reload, updated: result.updated, elements: result.elements }, { reload: false, updated: ['card'], elements: 1 });
assert.equal(card.shadowRoot, root, 'same shadow root');
assert.equal(root.querySelector('section').textContent, 'v2 Ada');
assert.equal(card.firstElementChild.textContent, 'light DOM', 'light DOM untouched');
card.who = 'Grace';
assert.equal(root.querySelector('section').textContent, 'v2 Grace');

// A shadow mode cannot change under a live element: nothing is swapped, and the caller is told to reload.
files['/card.html'] = '<html-export name="card" props="who" shadow="closed"><template>closed</template></html-export>';
const closed = await modules.hotReload('./card.html');
assert.equal(closed.reload, true);
assert.match(closed.reasons[0], /shadow changed \("open" → "closed"\)/);
assert.equal(root.querySelector('section').textContent, 'v2 Grace');

console.log('ok: a template edit re-stamped a live element in place; a shadow-mode change asked for a reload');
