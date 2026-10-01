// The integrity manifest (createHTMLModules({ integrity, strict })) and JavaScript imports pinned through the page's import map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, makeWindow, ORIGIN } from './helpers.js';

const SRI = (text, alg = 'sha384') => `${alg}-${createHash(alg).update(text).digest('base64')}`;
const at = (path) => new URL(path, ORIGIN).href;

const leaf = '<html-export name="leaf-card"><template>leaf</template></html-export>';
const part = '<html-export name="part-card"><template>part</template></html-export>';
const host = '<html-import src="./leaf.html" as="leaf"></html-import><html-export src="./part.html"></html-export><html-export name="host-card"><template>host</template></html-export>';
const files = { 'host.html': host, 'leaf.html': leaf, 'part.html': part };
const manifestOf = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [at(k), SRI(v)]));

test('a manifest pins a whole graph: the root, its imports and its re-exports are verified without an attribute on any edge', async () => {
  const { modules, fetch } = setup({ files, integrity: manifestOf(files) });
  const ns = await modules.load('./host.html');
  assert.ok(ns.hostCard && ns.partCard);
  assert.equal(fetch.log.length, 3);
});

test('a tampered module anywhere in the pinned graph is refused, and names the manifest', async () => {
  for (const victim of ['host.html', 'leaf.html', 'part.html']) {
    const { modules } = setup({ files: { ...files, [victim]: `${files[victim]}<!-- tampered -->` }, integrity: manifestOf(files) });
    await assert.rejects(modules.load('./host.html'), new RegExp(`Integrity check failed for HTML module ${at(victim).replaceAll('.', '\\.')}: its sha384 digest is sha384-.* matches none of the integrity manifest entry "sha384-`), victim);
    assert.ok(!modules.cache.has(`html:${at(victim)}`) && !modules.cache.has(`html:${at('host.html')}`), 'a refused load is not cached');
  }
});

test('manifest keys resolve against baseURL, a fragment is ignored, several tokens work, and the map is readable back', async () => {
  const { modules } = setup({ files: { 'leaf.html': leaf }, integrity: { './leaf.html#x': `${SRI('nope', 'sha256')} ${SRI(leaf, 'sha512')}` } });
  assert.deepEqual(modules.loader.integrity, { [at('leaf.html')]: `${SRI('nope', 'sha256')} ${SRI(leaf, 'sha512')}` });
  assert.ok((await modules.load('./leaf.html')).leafCard);
});

test('an integrity attribute still works on its own, and when both exist both must match', async () => {
  const alone = setup({ files });
  assert.ok(await alone.modules.load('./leaf.html', { integrity: SRI(leaf) }));
  const both = setup({ files, integrity: { [at('leaf.html')]: SRI(leaf) } });
  assert.ok(await both.modules.load('./leaf.html', { integrity: SRI(leaf, 'sha256') }));
  await assert.rejects(both.modules.load('./leaf.html', { integrity: SRI('other') }), /matches none of integrity="sha384-/);
});

test('an unlisted module with no attribute is fetched when strict is off (the manifest is not an allowlist)', async () => {
  const { modules } = setup({ files, integrity: { [at('leaf.html')]: SRI(leaf) } });
  assert.ok((await modules.load('./part.html')).partCard);
});

test('strict mode refuses an HTML fetch with no integrity metadata, before the network', async () => {
  const { modules, fetch } = setup({ files, strict: true, integrity: { [at('host.html')]: SRI(host), [at('leaf.html')]: SRI(leaf) } });
  // host.html is pinned but re-exports the unpinned part.html.
  await assert.rejects(modules.load('./host.html'), new RegExp(`Refusing to fetch the HTML module ${at('part.html').replaceAll('.', '\\.')}: strict mode is on and it has no integrity metadata`));
  assert.ok(!fetch.log.includes(at('part.html')), 'never fetched');
  await assert.rejects(modules.load('./part.html'), /strict mode is on/);
  assert.equal(modules.loader.strict, true);
});

test('strict mode accepts an integrity attribute as metadata, and a complete manifest loads the graph', async () => {
  const strict = setup({ files, strict: true });
  assert.ok(await strict.modules.load('./leaf.html', { integrity: SRI(leaf) }));
  await assert.rejects(strict.modules.load('./leaf.html'), /strict mode is on/, 'the cached verified copy does not satisfy an unpinned load');
  const full = setup({ files, strict: true, integrity: manifestOf(files) });
  assert.ok((await full.modules.load('./host.html')).partCard);
});

test('strict with no manifest and no attribute refuses everything; an invalid manifest or strict value is a TypeError', async () => {
  await assert.rejects(setup({ files, strict: true }).modules.load('./leaf.html'), /strict mode is on/);
  assert.throws(() => setup({ integrity: ['x'] }), /Invalid integrity manifest/);
  assert.throws(() => setup({ integrity: { [at('a.html')]: 'md5-nope' } }), (e) => e instanceof SyntaxError && /integrity manifest entry for/.test(e.message));
  assert.throws(() => setup({ strict: 'yes' }), /Invalid strict/);
});

test('an import map integrity object (the same shape) works as the manifest', async () => {
  const importMap = { imports: {}, integrity: manifestOf(files) };
  const { modules } = setup({ files, integrity: importMap.integrity });
  assert.ok((await modules.load('./host.html')).hostCard);
});

// ---- JavaScript imports are pinned by the page's import map ---------------------------------------------------

const pageWith = (integrity) => makeWindow(`<!doctype html><html><head><script type="importmap">${JSON.stringify({ imports: {}, integrity })}</script></head><body></body></html>`);
const ns = { value: 1 };

test('a JavaScript import whose integrity matches the page import map entry proceeds', async () => {
  const sri = SRI('export const value = 1');
  const { modules } = setup({ window: pageWith({ [at('x.js')]: sri }), js: { 'x.js': ns } });
  assert.equal(await modules.load('./x.js', { integrity: sri }), ns);
});

test('a relative import map key resolves against the base URL, and the order and spacing of tokens do not matter', async () => {
  const [a, b] = [SRI('a', 'sha256'), SRI('b', 'sha256')];
  const { modules } = setup({ window: pageWith({ './x.js': `${a}  ${b}` }), js: { 'x.js': ns } });
  assert.equal(await modules.load('./x.js', { integrity: `${b} ${a}` }), ns);
});

test('a JavaScript import with integrity but no import map entry fails with the fix in the message', async () => {
  const sri = SRI('export const value = 1');
  const { modules } = setup({ js: { 'x.js': ns } });
  await assert.rejects(modules.load('./x.js', { integrity: sri }), (e) => {
    assert.match(e.message, /the page's import map has no "integrity" entry for it/);
    assert.ok(e.message.includes(`"${at('x.js')}": "${sri}"`), 'shows the entry to add');
    assert.match(e.message, /build\(specifiers, \{ graph: true \}\)/);
    return true;
  });
  assert.equal(modules.cache.size, 0);
});

test('a JavaScript import whose import map entry differs fails and shows both', async () => {
  const sri = SRI('one');
  const { modules } = setup({ window: pageWith({ [at('x.js')]: SRI('two') }), js: { 'x.js': ns } });
  await assert.rejects(modules.load('./x.js', { integrity: sri }), (e) => e.message.includes(`pins it as "${SRI('two')}"`) && e.message.includes(`integrity="${sri}"`));
});

test('a JavaScript import without integrity is unchanged, even in strict mode (strict covers HTML fetches)', async () => {
  const { modules } = setup({ strict: true, js: { 'x.js': ns } });
  assert.equal(await modules.load('./x.js'), ns);
});

test('a manifest entry for a JavaScript module requires the same import map entry', async () => {
  const sri = SRI('code');
  const ok = setup({ integrity: { [at('x.js')]: sri }, window: pageWith({ [at('x.js')]: sri }), js: { 'x.js': ns } });
  assert.equal(await ok.modules.load('./x.js'), ns);
  const missing = setup({ integrity: { [at('x.js')]: sri }, js: { 'x.js': ns } });
  await assert.rejects(missing.modules.load('./x.js'), /Cannot verify the JavaScript module .*x\.js \(the integrity manifest entry="sha384-/);
});

test('<html-import src="x.js" integrity> from an HTML module is checked too', async () => {
  const sri = SRI('code');
  const body = `<html-import src="./x.js" as="x" integrity="${sri}"></html-import><html-export name="m-card"><template>m</template></html-export>`;
  const bad = setup({ files: { 'm.html': body }, js: { 'x.js': ns } });
  await assert.rejects(bad.modules.load('./m.html'), /import map has no "integrity" entry/);
  const good = setup({ files: { 'm.html': body }, window: pageWith({ [at('x.js')]: sri }), js: { 'x.js': ns } });
  assert.ok(await good.modules.load('./m.html'));
});
