// Runtime loading, the module cache, dependencies and the programmatic API (PRD §15, §16, §20).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHTMLComponent, isHTMLStylesheet } from '../src/index.js';
import { setup, fixtures, tick, ORIGIN } from './helpers.js';

const at = (path) => new URL(path, fixtures).href;

test('HTMLModules.load(): a namespace of definitions shaped like a compiled module', async () => {
  const { modules } = setup();
  const ui = await modules.load(at('ui.html'));
  assert.equal(Object.prototype.toString.call(ui), '[object Module]');
  assert.ok(Object.isFrozen(ui));
  assert.deepEqual(Object.keys(ui), ['components', 'config', 'customCard', 'default', 'fancyButton', 'note', 'theme']);
  const { customCard, fancyButton } = ui; // PRD §20
  assert.ok(isHTMLComponent(customCard) && isHTMLComponent(fancyButton));
  assert.equal(customCard.name, 'custom-card');
  assert.equal(customCard.url, at('ui.html'));
  assert.ok(isHTMLStylesheet(ui.theme));
  assert.deepEqual(ui.config, { size: 3, brand: 'Acme' });
  assert.equal(ui.default, ui.note);
  assert.deepEqual(Object.keys(ui.components), ['custom-card', 'fancy-button', 'note']);
});

test('the cache: one fetch and parse per resolved URL, shared by concurrent loads (§16)', async () => {
  const { modules, fetch } = setup();
  const [a, b] = await Promise.all([modules.load(at('ui.html')), modules.load('./fixtures/ui.html', { base: new URL('../', fixtures).href })]);
  const c = await modules.load(at('ui.html'));
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(fetch.log.filter((u) => u.endsWith('/ui.html')).length, 1);
  assert.ok(modules.cache.has(at('ui.html')));
  assert.ok(modules.cache.get(at('ui.html')) instanceof Promise);
});

test('failed loads are evicted and can be retried; events report fetch, load and error', async () => {
  const files = { 'flaky.html': 503 };
  const { modules, events } = setup({ files });
  await assert.rejects(modules.load('./flaky.html'), /Failed to fetch HTML module http:\/\/modules\.test\/flaky\.html: 503/);
  await tick();
  assert.equal(modules.cache.has(`${ORIGIN}flaky.html`), false);
  files['flaky.html'] = '<html-export name="ok"><template>ok</template></html-export>';
  const { modules: again } = setup({ files });
  assert.ok((await again.load('./flaky.html')).ok);
  assert.deepEqual(events.map((e) => e.type), ['fetch', 'error']);
});

test('resolution: relative to the importer; bare specifiers through hostResolve (the page import map)', async () => {
  const { modules } = setup({ hostResolve: (s) => (s === '@acme/ui' ? at('ui.html') : null) });
  assert.equal(modules.resolve('./x.html', 'http://a.test/dir/page.html'), 'http://a.test/dir/x.html');
  assert.equal(modules.resolve('https://cdn.test/ui.html'), 'https://cdn.test/ui.html');
  assert.ok((await modules.load('@acme/ui')).customCard);
  assert.throws(() => modules.resolve('@nope/ui'), /Unable to resolve bare specifier "@nope\/ui"/);
});

test('modules import modules: dependencies resolve relative to the importing module and load first', async () => {
  const { modules, fetch } = setup();
  const profile = await modules.load(at('profile.html'));
  const def = profile.userProfile;
  assert.deepEqual(def.imports.map((i) => [i.from, i.as, i.bindings]), [['./icons.html', 'icon', []], ['./ui.html', undefined, [{ export: 'theme', adopt: true }]]]);
  assert.equal(def.imports[0].module, await modules.load(at('icons.html')));
  assert.deepEqual(fetch.log.map((u) => u.split('/').pop()).sort(), ['icons.html', 'profile.html', 'ui.html']);
});

test('re-exports (barrels): every component, one renamed, from HTML or JS; locals win', async () => {
  const { modules } = setup();
  const [barrel, ui, widgets] = await Promise.all([at('barrel.html'), at('ui.html'), at('widgets.js')].map((u) => modules.load(u)));
  assert.equal(barrel.button, ui.fancyButton, 'identity is preserved: the same definition');
  assert.equal(barrel.fancyButton, ui.fancyButton);
  assert.equal(barrel.counter, widgets.Counter);
  assert.equal(barrel.settings, ui.config);
  assert.notEqual(barrel.customCard, ui.customCard, 'a local export shadows a star export');
  assert.equal(barrel.default, undefined, 'star re-exports never include default');
  assert.deepEqual(Object.keys(barrel.components).sort(), ['button', 'counter', 'custom-card', 'fancy-button', 'note']);
  assert.equal('theme' in barrel.components, false);
});

test('star re-exports: names two sources disagree on are left out, like ESM', async () => {
  const { modules } = setup({
    files: {
      'a.html': '<html-export name="config"><script type="application/json">1</script></html-export>',
      'b.html': '<html-export name="config"><script type="application/json">2</script></html-export>',
      'both.html': '<html-export src="./a.html"></html-export><html-export src="./b.html"></html-export>',
      'c1.html': '<html-export name="x-card"><template>1</template></html-export>',
      'c2.html': '<html-export name="x-card"><template>2</template></html-export>',
      'clash.html': '<html-export src="./c1.html"></html-export><html-export src="./c2.html"></html-export>',
    },
  });
  assert.equal('config' in (await modules.load('./both.html')), false);
  await assert.rejects(modules.load('./clash.html'), /Conflicting star exports for 'x-card'/);
});

test('JS modules load with native import(); definitions in the same module share identity', async () => {
  const { modules } = setup();
  const widgets = await modules.load(at('widgets.js'));
  assert.equal(widgets, await import('./fixtures/widgets.js'));
});

test('dependency errors: missing modules, missing re-exported names, cycles', async () => {
  const { modules } = setup({
    files: {
      'missing-dep.html': '<html-import src="./nowhere.html" as="n"></html-import>',
      'missing-name.html': '<html-export src="./ui.html" name="nope"></html-export>',
      'ui.html': '<html-export name="card"><template>x</template></html-export>',
      'self.html': '<html-export src="./self.html"></html-export>',
    },
  });
  await assert.rejects(modules.load('./missing-dep.html'), /Failed to fetch HTML module .*nowhere\.html: 404/);
  await assert.rejects(modules.load('./missing-name.html'), { name: 'SyntaxError', message: "The requested module './ui.html' does not provide an export named 'nope'" });
  await assert.rejects(modules.load('./self.html'), /Circular HTML module dependency: .*self\.html -> .*self\.html/);
  await assert.rejects(setup().modules.load(at('cycle-a.html')), /Circular HTML module dependency: .*cycle-b\.html -> .*cycle-a\.html -> .*cycle-b\.html/);
});

test('concurrent loads of a cycle reject instead of deadlocking', async () => {
  const { modules } = setup();
  const results = await Promise.allSettled([modules.load(at('cycle-a.html')), modules.load(at('cycle-b.html'))]);
  assert.ok(results.every((r) => r.status === 'rejected'));
  assert.ok(results.some((r) => /Circular/.test(r.reason.message)));
});

test('HTMLModules.import(): load and bind in one step, like <html-import>', async () => {
  const { modules, window } = setup();
  const { module, elements } = await modules.import(at('ui.html'), { as: 'api' });
  assert.deepEqual(Object.keys(elements).sort(), ['api--custom-card', 'api--fancy-button', 'api--note']);
  assert.equal(window.customElements.get('api--custom-card').component, module.customCard);
  const picked = await modules.import(at('ui.html'), { as: 'pick', bindings: [{ export: 'fancy-button', element: 'buy-button' }, { export: 'config' }, { export: 'theme', adopt: true }] });
  assert.deepEqual(Object.keys(picked.elements), ['buy-button']);
  assert.equal(picked.values.config.brand, 'Acme');
  assert.equal(window.document.head.querySelectorAll('style[data-html-module="theme"]').length, 1);
  assert.equal(window.customElements.get('pick--custom-card'), undefined, 'selective bindings register nothing else');
});

test('HTMLModules.bind() and definition.define() on a loaded module', async () => {
  const { modules, window } = setup();
  const ui = await modules.load(at('ui.html'));
  modules.bind(ui, { as: 'late' });
  assert.ok(window.customElements.get('late--note'));
  const Mine = ui.customCard.define('my-custom-card', { window });
  assert.equal(window.customElements.get('my-custom-card'), Mine);
});
