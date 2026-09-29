// load="lazy": nothing is fetched until one of an import's tags is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazyTargets, componentRoot } from '../src/index.js';
import { setup, tick, ORIGIN } from './helpers.js';

const once = (el, type) => new Promise((resolve) => el.addEventListener(type, (e) => resolve(e), { once: true }));

const UI = `<html-export name="card"><template><article>card</article></template></html-export>
  <html-export name="button"><template><button>b</button></template></html-export>`;
const ICONS = '<html-export name="star"><template>*</template></html-export>';
// A component whose template uses a tag that the page imports lazily.
const FRAME = '<html-export name="frame"><template><icon--star></icon--star></template></html-export>';
const CLOSED = '<html-export name="frame" shadow="closed"><template><icon--star></icon--star></template></html-export>';
// A module whose own import is lazy.
const GALLERY = `<html-import-settings load="lazy"></html-import-settings>
  <html-import src="./icons.html" as="ic"></html-import>
  <html-import src="./ui.html" as="kit"><html-binding export="button" element="kit-button"></html-binding></html-import>
  <html-export name="plain"><template>no icons here</template></html-export>
  <html-export name="rated"><template><ic--star></ic--star></template></html-export>`;

function page({ head = '', body = '', files = {}, ...options } = {}) {
  const env = setup({ elements: true, files: { 'ui.html': UI, 'icons.html': ICONS, 'frame.html': FRAME, 'closed.html': CLOSED, 'gallery.html': GALLERY, ...files }, ...options });
  env.reported = [];
  env.window.reportError = (e) => env.reported.push(e);
  env.document.head.innerHTML = head;
  env.document.body.innerHTML = body;
  env.$ = (sel) => env.document.querySelector(sel);
  return env;
}
// linkedom upgrades only elements that document.querySelectorAll() finds, not
// those inside shadow roots (browsers upgrade the shadow-including tree), so
// the tests upgrade shadow contents by hand after a definition arrives.
const upgradeIn = (win, root) => {
  for (const el of root.querySelectorAll('*')) win.customElements.upgrade(el);
  return root;
};
const fetched = (fetch) => fetch.log.map((u) => u.replace(ORIGIN, ''));

test('lazyTargets: a prefix for a namespace import, exact tags for bindings', () => {
  assert.deepEqual(lazyTargets({ as: 'ui' }), { tags: [], prefixes: ['ui--'] });
  assert.deepEqual(lazyTargets({ as: 'ui', delimiter: '-' }), { tags: [], prefixes: ['ui-'] });
  assert.deepEqual(lazyTargets({ as: 'ui', bindings: [{ export: 'card' }, { export: 'x', element: 'my-x' }, { export: 'theme', adopt: true }, { export: 'default', element: 'd-d' }] }),
    { tags: ['ui--card', 'my-x', 'd-d'], prefixes: [] });
  assert.deepEqual(lazyTargets({ bindings: [{ export: 'Counter', element: 'x-counter' }] }), { tags: ['x-counter'], prefixes: [] });
  assert.deepEqual(lazyTargets({}), { tags: [], prefixes: [] }, 'nothing to watch: only load() loads it');
  assert.deepEqual(lazyTargets({ as: 'ui', delimiter: '.', bindings: [{ export: 'card' }] }), { tags: [], prefixes: [] }, 'an invalid tag is skipped here and reported when bound');
});

test('nothing is fetched until a tag is used; the first use loads, registers and upgrades', async () => {
  const { $, document, window, fetch } = page({ body: '<html-import src="./ui.html" as="ui" load="lazy"></html-import><p>no ui elements yet</p>' });
  const imp = $('html-import');
  await tick();
  assert.deepEqual(fetched(fetch), [], 'not fetched');
  assert.equal(imp.state, 'waiting');
  assert.equal(window.customElements.get('ui--card'), undefined);
  const loaded = once(imp, 'load');
  document.body.insertAdjacentHTML('beforeend', '<section><ui--card id="c"></ui--card></section>');
  const { elements } = await imp.ready;
  assert.deepEqual(fetched(fetch), ['ui.html']);
  assert.deepEqual(Object.keys(elements).sort(), ['ui--button', 'ui--card']);
  assert.equal(imp.state, 'loaded');
  assert.ok((await loaded).detail.module);
  assert.equal($('#c').shadowRoot.querySelector('article').textContent, 'card', 'upgraded in place');
  document.body.insertAdjacentHTML('beforeend', '<ui--button></ui--button>');
  await tick();
  assert.deepEqual(fetched(fetch), ['ui.html'], 'once');
});

test('elements already present when the import connects load it straight away', async () => {
  const { $, fetch } = page({ body: '<ui--card></ui--card><html-import src="./ui.html" as="ui" load="lazy"></html-import>' });
  await $('html-import').ready;
  assert.deepEqual(fetched(fetch), ['ui.html']);
  assert.ok($('ui--card').shadowRoot);
});

test('only matching tags count: other namespaces do not trigger a load', async () => {
  const { $, document, fetch } = page({ body: '<html-import src="./ui.html" as="ui" load="lazy"></html-import>' });
  document.body.insertAdjacentHTML('beforeend', '<uix--card></uix--card><ui-card></ui-card><x-ui--card></x-ui--card><template><ui--card></ui--card></template>');
  await tick();
  assert.deepEqual(fetched(fetch), []);
  assert.equal($('html-import').state, 'waiting');
});

test('lazy through <html-import-settings load="lazy">, and load="eager" on one import overrides it', async () => {
  const { $, fetch } = page({
    head: '<html-import-settings load="lazy"></html-import-settings>',
    body: '<html-import id="lazy" src="./ui.html" as="ui"></html-import><html-import id="eager" src="./icons.html" as="icon" load="eager"></html-import>',
  });
  await $('#eager').ready;
  await tick();
  assert.deepEqual(fetched(fetch), ['icons.html']);
  assert.equal($('#lazy').state, 'waiting');
  assert.equal($('#lazy').settings.load, 'lazy');
  // The instance option is the lowest layer.
  const inst = page({ load: 'lazy', body: '<html-import src="./ui.html" as="ui"></html-import>' });
  await tick();
  assert.deepEqual(fetched(inst.fetch), []);
});

test('tags used inside component shadow roots are seen (open and closed)', async () => {
  for (const file of ['frame.html', 'closed.html']) {
    const { $, document, fetch, window } = page({
      body: `<html-import id="icons" src="./icons.html" as="icon" load="lazy"></html-import>
        <html-import id="frame" src="./${file}" as="ui"></html-import>`,
    });
    await $('#frame').ready;
    await tick();
    assert.deepEqual(fetched(fetch), [file], `${file}: icons not fetched yet`);
    document.body.insertAdjacentHTML('beforeend', '<ui--frame></ui--frame>');
    await $('#icons').ready;
    assert.deepEqual(fetched(fetch), [file, 'icons.html']);
    const root = upgradeIn(window, componentRoot($('ui--frame')));
    assert.equal(root === $('ui--frame').shadowRoot, file === 'frame.html');
    assert.ok(root.querySelector('icon--star').shadowRoot, `${file}: upgraded inside the shadow root`);
    assert.ok(window.customElements.get('icon--star'));
  }
});

test('a tag added to a component shadow root later is seen too', async () => {
  const { $, document, fetch, window } = page({
    body: `<html-import id="frame" src="./ui.html" as="ui"></html-import><ui--card></ui--card>
      <html-import id="icons" src="./icons.html" as="icon" load="lazy"></html-import>`,
  });
  await $('#frame').ready;
  await tick();
  assert.deepEqual(fetched(fetch), ['ui.html']);
  const root = $('ui--card').shadowRoot;
  root.querySelector('article').append(document.createElement('icon--star'));
  await $('#icons').ready;
  assert.ok(upgradeIn(window, root).querySelector('icon--star').shadowRoot);
});

test('a module\'s own lazy imports load when one of its components uses their tags', async () => {
  const { $, document, fetch, window } = page({ body: '<html-import src="./gallery.html" as="g"></html-import>' });
  await $('html-import').ready;
  await tick();
  assert.deepEqual(fetched(fetch), ['gallery.html'], 'the module loads without its lazy imports');
  document.body.insertAdjacentHTML('beforeend', '<g--plain></g--plain>');
  await tick();
  assert.deepEqual(fetched(fetch), ['gallery.html']);
  document.body.insertAdjacentHTML('beforeend', '<g--rated></g--rated>');
  await tick(10);
  assert.deepEqual(fetched(fetch), ['gallery.html', 'icons.html']);
  assert.ok(window.customElements.get('ic--star'));
  assert.ok(upgradeIn(window, componentRoot($('g--rated'))).querySelector('ic--star').shadowRoot);
  // The binding's exact tag, anywhere.
  document.body.insertAdjacentHTML('beforeend', '<kit-button></kit-button>');
  await tick(10);
  assert.deepEqual(fetched(fetch), ['gallery.html', 'icons.html', 'ui.html']);
  assert.ok(window.customElements.get('kit-button'));
  assert.equal(window.customElements.get('kit--card'), undefined, 'only the binding');
});

test('a failing module-level lazy import fires error on the element that used it (and reports under errors="throw")', async () => {
  const MOD = `<html-import-settings load="lazy" errors="throw"></html-import-settings><html-import src="./gone.html" as="gone"></html-import>
    <html-export name="w"><template><gone--x></gone--x></template></html-export>`;
  const { $, document, reported } = page({ files: { 'm.html': MOD }, body: '<html-import src="./m.html" as="m"></html-import>' });
  await $('html-import').ready;
  document.body.insertAdjacentHTML('beforeend', '<m--w></m--w>');
  // The error bubbles (composed) from the element that used the tag; linkedom
  // does not carry events out of shadow roots, so listen on the element itself.
  const e = await once(componentRoot($('m--w')).querySelector('gone--x'), 'error');
  assert.match(e.detail.error.message, /404/);
  assert.equal(e.detail.lazy, true);
  await tick();
  assert.equal(reported.length, 1);
});

test('<html-binding element=…> children: the lazy import waits for exactly those tags', async () => {
  const { $, document, fetch, window } = page({
    body: `<html-import src="./ui.html" as="ui" load="lazy">
      <html-binding export="card" element="my-card"></html-binding>
      <html-binding export="button"></html-binding>
    </html-import>`,
  });
  document.body.insertAdjacentHTML('beforeend', '<ui--card></ui--card>');
  await tick();
  assert.deepEqual(fetched(fetch), [], '<ui--card> is not one of its tags');
  document.body.insertAdjacentHTML('beforeend', '<my-card></my-card>');
  const { elements } = await $('html-import').ready;
  assert.deepEqual(Object.keys(elements), ['my-card', 'ui--button']);
  assert.ok($('my-card').shadowRoot);
  assert.equal(window.customElements.get('ui--card'), undefined);
  // A binding added while waiting is watched too.
  const late = page({ body: '<html-import src="./ui.html" as="ui" load="lazy"><html-binding export="card" element="a-card"></html-binding></html-import>' });
  await tick();
  late.$('html-import').insertAdjacentHTML('beforeend', '<html-binding export="button" element="b-button"></html-binding>');
  late.document.body.insertAdjacentHTML('beforeend', '<b-button></b-button>');
  const r = await late.$('html-import').ready;
  assert.deepEqual(Object.keys(r.elements).sort(), ['a-card', 'b-button']);
});

test('el.load() forces loading; el.module waits for a lazy import instead of loading it', async () => {
  const { $, fetch } = page({ body: '<html-import src="./ui.html" as="ui" load="lazy"></html-import><html-import id="none" src="./icons.html" load="lazy"></html-import>' });
  const imp = $('html-import');
  let resolved = false;
  imp.module.then(() => (resolved = true));
  await tick();
  assert.equal(resolved, false);
  assert.deepEqual(fetched(fetch), []);
  const detail = await imp.load();
  await tick();
  assert.ok(resolved);
  assert.equal(detail, await imp.ready);
  assert.ok(detail.elements['ui--card']);
  // Nothing to watch (no as, no bindings): only load() loads it.
  assert.equal($('#none').state, 'waiting');
  await $('#none').load();
  assert.deepEqual(fetched(fetch).sort(), ['icons.html', 'ui.html']);
  // load() on an eager import is just ready.
  const eager = page({ body: '<html-import src="./ui.html" as="ui"></html-import>' });
  assert.equal(await eager.$('html-import').load(), await eager.$('html-import').ready);
});

test('disconnecting a lazy import before it loads cancels the watching; reconnecting resumes it', async () => {
  const { $, document, fetch } = page({ body: '<html-import src="./ui.html" as="ui" load="lazy"></html-import>' });
  const imp = $('html-import');
  await tick();
  assert.equal(imp.state, 'waiting');
  imp.remove();
  assert.equal(imp.state, 'idle');
  document.body.insertAdjacentHTML('beforeend', '<ui--card></ui--card>');
  await tick();
  assert.deepEqual(fetched(fetch), [], 'nothing fetched after disconnecting');
  document.body.append(imp);
  await imp.ready; // the <ui--card> already in the page triggers it
  assert.deepEqual(fetched(fetch), ['ui.html']);
  assert.ok($('ui--card').shadowRoot);
});

test('programmatic: HTMLModules.import(src, { as, load: "lazy" }) returns a handle with ready, load(), cancel()', async () => {
  const { modules, document, fetch, window } = page();
  const h = modules.import('./ui.html', { as: 'ui', load: 'lazy' });
  assert.equal(typeof h.then, 'undefined', 'a handle, not a promise');
  assert.equal(h.state, 'waiting');
  await tick();
  assert.deepEqual(fetched(fetch), []);
  document.body.insertAdjacentHTML('beforeend', '<div><ui--button></ui--button></div>');
  const result = await h.ready;
  assert.equal(h.state, 'loaded');
  assert.deepEqual(Object.keys(result.tags).sort(), ['ui--button', 'ui--card']);
  assert.ok(document.querySelector('ui--button').shadowRoot);
  // load() forces it; cancel() stops watching.
  const forced = modules.import('./icons.html', { as: 'icon', load: 'lazy' });
  assert.ok((await forced.load()).elements['icon--star']);
  const cancelled = modules.import('./frame.html', { as: 'fr', load: 'lazy' });
  cancelled.cancel();
  assert.equal(cancelled.state, 'cancelled');
  document.body.insertAdjacentHTML('beforeend', '<fr--frame></fr--frame>');
  await tick();
  assert.equal(fetched(fetch).includes('frame.html'), false);
  await cancelled.load();
  assert.ok(window.customElements.get('fr--frame'));
  // Bindings, errors, and invalid options.
  const bound = modules.import('./ui.html', { load: 'lazy', bindings: [{ export: 'card', element: 'z-card' }] });
  document.body.insertAdjacentHTML('beforeend', '<z-card></z-card>');
  assert.ok((await bound.ready).elements['z-card']);
  const missing = modules.import('./missing.html', { as: 'mi', load: 'lazy', errors: 'throw' });
  document.body.insertAdjacentHTML('beforeend', '<mi--x></mi--x>');
  await assert.rejects(missing.ready, /404/);
  assert.equal(missing.state, 'error');
  await assert.rejects(modules.import('./ui.html', { load: 'later' }), /Invalid load="later" in HTMLModules\.import\(\): use "eager" or "lazy"/);
  // The instance's load option is for <html-import> elements; import() stays eager unless asked.
  const inst = page({ load: 'lazy' });
  const eager = inst.modules.import('./ui.html', { as: 'ui' });
  assert.equal(typeof eager.then, 'function');
  await eager;
});
