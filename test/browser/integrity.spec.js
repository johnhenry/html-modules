// The integrity manifest and JavaScript pinning in real engines. Each test serves a generated page (page.route) whose
// inline script creates the instance with a manifest computed here from the fixture bytes, so the hashes are the real
// ones the engine fetches. Tampering is done by the route, never by editing a fixture.
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const DIR = '/test/browser/fixtures/integrity/';
const read = (name) => readFile(new URL(`./fixtures/integrity/${name}`, import.meta.url));
const SRI = (bytes, alg = 'sha384') => `${alg}-${createHash(alg).update(bytes).digest('base64')}`;
const abs = (baseURL, name) => new URL(DIR + name, baseURL).href;

/** Serve a generated page and wait for the instance. `importmap.integrity` and `config` are plain objects. */
async function open(page, baseURL, { importmap, config = {}, tamper = {} }) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>integrity</title>
${importmap ? `<script type="importmap">${JSON.stringify(importmap)}</script>` : ''}
<script type="module">
  import { createHTMLModules } from '/src/index.js';
  window.__modules = createHTMLModules(${JSON.stringify(config)});
  window.__ready = true;
</script></head><body></body></html>`;
  await page.route('**/integrity-page.html', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  for (const [name, suffix] of Object.entries(tamper)) {
    await page.route(`**${DIR}${name}`, async (route) => route.fulfill({ contentType: name.endsWith('.js') ? 'text/javascript' : 'text/html', body: Buffer.concat([await read(name), Buffer.from(suffix)]) }));
  }
  const requested = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.goto('/integrity-page.html');
  await page.waitForFunction(() => window.__ready === true);
  return requested;
}

const load = (page, url, options) => page.evaluate(async ([u, o]) => {
  try { await window.__modules.load(u, o); return { ok: true }; } catch (e) { return { ok: false, name: e.name, message: e.message }; }
}, [url, options]);

async function graphManifest(baseURL, names = ['host.html', 'leaf.html', 'part.html']) {
  return Object.fromEntries(await Promise.all(names.map(async (n) => [abs(baseURL, n), SRI(await read(n))])));
}

test('a manifest pins a whole HTML graph (root, import and re-export) and the graph loads', async ({ page, baseURL }) => {
  await open(page, baseURL, { config: { integrity: await graphManifest(baseURL) } });
  const r = await load(page, abs(baseURL, 'host.html'));
  expect(r, JSON.stringify(r)).toEqual({ ok: true });
});

test('a tampered module in a pinned graph is refused (every position in the graph)', async ({ page, baseURL }) => {
  for (const victim of ['host.html', 'leaf.html', 'part.html']) {
    const p = await page.context().newPage();
    await open(p, baseURL, { config: { integrity: await graphManifest(baseURL) }, tamper: { [victim]: '<!-- tampered -->' } });
    const r = await load(p, abs(baseURL, 'host.html'));
    expect(r.ok, victim).toBe(false);
    expect(r.message, victim).toContain(`Integrity check failed for HTML module ${abs(baseURL, victim)}`);
    expect(r.message, victim).toContain('the integrity manifest entry');
    await p.close();
  }
});

test('strict mode refuses a fetch with no integrity metadata, and never requests it', async ({ page, baseURL }) => {
  const manifest = await graphManifest(baseURL, ['host.html', 'leaf.html']); // part.html is not pinned
  const requested = await open(page, baseURL, { config: { integrity: manifest, strict: true } });
  const r = await load(page, abs(baseURL, 'host.html'));
  expect(r.ok).toBe(false);
  expect(r.message).toContain(`Refusing to fetch the HTML module ${abs(baseURL, 'part.html')}: strict mode is on`);
  expect(requested).not.toContain(`${DIR}part.html`);
  // An attribute is metadata too: the same module loads strict once it carries one.
  const ok = await load(page, abs(baseURL, 'part.html'), { integrity: SRI(await read('part.html')) });
  expect(ok).toEqual({ ok: true });
});

test('without strict, an unlisted module is fetched (the manifest is not an allowlist), and a listed one is still verified', async ({ page, baseURL }) => {
  await open(page, baseURL, { config: { integrity: await graphManifest(baseURL, ['host.html', 'leaf.html']) } });
  expect(await load(page, abs(baseURL, 'host.html'))).toEqual({ ok: true });
});

test('JavaScript: an integrity attribute is accepted when the page import map pins the same digest, and the engine runs it', async ({ page, baseURL }) => {
  const sri = SRI(await read('ok.js'));
  await open(page, baseURL, { importmap: { imports: {}, integrity: { [abs(baseURL, 'ok.js')]: sri } } });
  expect(await load(page, abs(baseURL, 'ok.js'), { integrity: sri })).toEqual({ ok: true });
  expect(await page.evaluate(() => globalThis.__okRan)).toBe(1);
});

test('JavaScript: no import map entry, or a different one, is refused with the fix, and the module does not run', async ({ page, baseURL }) => {
  const sri = SRI(await read('ok.js'));
  await open(page, baseURL, {});
  const missing = await load(page, abs(baseURL, 'ok.js'), { integrity: sri });
  expect(missing.ok).toBe(false);
  expect(missing.message).toContain("the page's import map has no \"integrity\" entry for it");
  expect(missing.message).toContain(`"${abs(baseURL, 'ok.js')}": "${sri}"`);
  const other = await page.context().newPage();
  await open(other, baseURL, { importmap: { imports: {}, integrity: { [abs(baseURL, 'ok.js')]: SRI('something else') } } });
  const differs = await load(other, abs(baseURL, 'ok.js'), { integrity: sri });
  expect(differs.ok).toBe(false);
  expect(differs.message).toContain('the page\'s import map pins it as');
  expect(await page.evaluate(() => globalThis.__okRan)).toBeUndefined();
  expect(await other.evaluate(() => globalThis.__okRan)).toBeUndefined();
});

test('JavaScript: a module imported from an HTML module is checked the same way', async ({ page, baseURL }) => {
  const sri = SRI(await read('ok.js'));
  const body = (await read('js-host.html')).toString().replace('__SRI__', sri);
  await page.route(`**${DIR}js-host.html`, (route) => route.fulfill({ contentType: 'text/html', body }));
  await open(page, baseURL, { importmap: { imports: {}, integrity: { [abs(baseURL, 'ok.js')]: sri } } });
  expect(await load(page, abs(baseURL, 'js-host.html'))).toEqual({ ok: true });
  const bare = await page.context().newPage();
  await bare.route(`**${DIR}js-host.html`, (route) => route.fulfill({ contentType: 'text/html', body }));
  await open(bare, baseURL, {});
  const r = await load(bare, abs(baseURL, 'js-host.html'));
  expect(r.ok).toBe(false);
  expect(r.message).toContain('import map has no "integrity" entry');
});

test('JavaScript: the browser enforces the import map digest, so tampered bytes do not run (where the engine implements it)', async ({ page, baseURL }, info) => {
  const sri = SRI(await read('ok.js'));
  await open(page, baseURL, { importmap: { imports: {}, integrity: { [abs(baseURL, 'ok.js')]: sri } }, tamper: { 'ok.js': '\n// tampered' } });
  const r = await load(page, abs(baseURL, 'ok.js'), { integrity: sri });
  const ran = await page.evaluate(() => globalThis.__okRan);
  if (r.ok) {
    // This engine ignores import map "integrity": html-modules' own check passed (the entry matches), the engine did the rest.
    info.annotations.push({ type: 'import-map-integrity', description: 'unsupported in this engine (tampered module ran)' });
    expect(ran).toBe(1);
  } else {
    info.annotations.push({ type: 'import-map-integrity', description: 'enforced' });
    expect(ran).toBeUndefined();
    expect(r.name).toMatch(/TypeError|Error/);
  }
});
