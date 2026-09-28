// The examples are part of the contract: every HTML module they use must parse
// and load, the intentional error modules must fail the way the error page says,
// the catalog must cover the whole checklist, and the CLI outputs must be current.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLoader, exportNames } from '../src/index.js';
import { main } from '../bin/web-module-graph.js';
import { makeWindow } from './helpers.js';
import { checklist, pages, uncovered, allItems } from '../examples/shared/catalog.js';

const root = new URL('../', import.meta.url);
const examplesDir = fileURLToPath(new URL('examples/', root));
// Serve the package root at a fake origin, so root-relative URLs ("/examples/…") work.
const ORIGIN = 'http://wmg.test/';
const toFile = (url) => new URL(url.slice(ORIGIN.length), root);

async function serveFetch(url) {
  if (!url.startsWith(ORIGIN)) return { ok: false, status: 404, text: async () => '' };
  try {
    const text = await readFile(toFile(url), 'utf8');
    return { ok: true, status: 200, text: async () => text };
  } catch {
    return { ok: false, status: 404, text: async () => '' };
  }
}

// DOM globals that example JS modules touch at import time.
const win = makeWindow();
globalThis.HTMLElement ??= win.HTMLElement;
globalThis.document ??= win.document;
globalThis.customElements ??= win.customElements;
globalThis.CustomEvent ??= win.CustomEvent;
globalThis.CSSStyleSheet ??= class CSSStyleSheet {
  replaceSync(text) {
    this.text = text;
  }
};

// The import maps the example pages give their loaders, merged.
const importMap = {
  imports: {
    '@lib': '/examples/library/all.html',
    '@lib/': '/examples/library/',
    '@demo/ui': '/examples/components/barrel.html',
    '@board/ui': '/examples/app/ui.html',
    '@board/': '/examples/app/',
    '@acme/tokens': '/examples/import-maps/tokens-v2.html',
    '@acme/icons/': '/examples/import-maps/icons/',
    '@tokens': '/examples/import-maps/tokens-v2.html',
  },
  scopes: {
    '/examples/import-maps/legacy/': { '@acme/tokens': '/examples/import-maps/tokens-v1.html' },
    '/examples/cli/legacy/': { '@tokens': '/examples/import-maps/tokens-v1.html' },
  },
};

const makeLoader = () => createLoader({
  baseURL: `${ORIGIN}examples/`,
  importMap,
  fetch: serveFetch,
  window: win,
  importModule: (url) => import(url.startsWith(ORIGIN) ? toFile(url).href : url),
});

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

const all = (await walk(examplesDir)).map((p) => relative(examplesDir, p).split(sep).join('/'));
const pageFiles = all.filter((p) => !p.includes('/') && p.endsWith('.html'));
const NOT_MODULES = new Set(['cli/importmap.html']); // a generated snippet, not a module
const extraModules = ['library/snippets.part', 'routers/partials/card']; // HTML modules without .html
const moduleFiles = [
  ...all.filter((p) => p.includes('/') && p.endsWith('.html') && !p.startsWith('errors/') && !NOT_MODULES.has(p)),
  ...extraModules,
  'errors/ok.html',
];

test('every example HTML module parses and loads', async () => {
  assert.ok(moduleFiles.length > 40, `found ${moduleFiles.length} modules`);
  const loader = makeLoader();
  for (const file of moduleFiles) {
    const type = extraModules.includes(file) ? 'html' : undefined;
    const ns = await loader.load(`${ORIGIN}examples/${file}`, undefined, { type }).catch((error) => {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    });
    assert.ok(exportNames(ns).length > 0, `${file} exports something`);
  }
});

test('example modules export what the pages rely on', async () => {
  const loader = makeLoader();
  const load = (f) => loader.load(`${ORIGIN}examples/${f}`);
  assert.deepEqual(exportNames(await load('library/all.html')), ['Badge', 'Callout', 'Card', 'Stat', 'Tabs', 'config', 'format', 'icons', 'meta', 'tabsModule', 'tokens']);
  const top = await load('barrels/top.html');
  assert.deepEqual(exportNames(top), ['aDefault', 'alpha', 'b', 'beta', 'default', 'gamma', 'greet', 'hello', 'mid1', 'rawAlpha', 'shared']);
  assert.equal(top.shared, (await load('barrels/common.html')).shared, 'diamond');
  assert.equal(top.greet, (await load('barrels/leaf.js')).hello, 'renamed JS re-export');
  assert.equal((await load('import-maps/app.html')).tokens.version, '2.0.0');
  assert.equal((await load('import-maps/legacy/widget.html')).tokens.version, '1.4.2', 'scoped by the re-exporting module');
  assert.equal((await load('cli/legacy/panel.html')).tokens.version, '1.4.2');
  const ui = await load('app/ui.html');
  assert.deepEqual(exportNames(ui), ['Column', 'Shell', 'Stat', 'TaskCard', 'calm', 'citrus', 'grape', 'icons']);
  const data = await load('app/data.html');
  const store = data.store.createStore(data.seed, { key: 'test' });
  store.move('t5', 1);
  assert.equal(store.tasks.find((t) => t.id === 't5').status, 'doing');
  assert.deepEqual(exportNames(await load('theming/themes.html')), ['Swatch', 'base', 'forest', 'ocean', 'shadowBase', 'sunset']);
});

test('the intentional error modules fail as the error page expects', async () => {
  const expectations = {
    'missing-reexport.html': [SyntaxError, /does not provide an export named 'Nope' \(re-exported by/],
    'cycle-a.html': [Error, /Circular HTML module re-export: .*cycle-b\.html -> .*cycle-a\.html -> .*cycle-b\.html/],
    'cycle-self.html': [Error, /Circular HTML module re-export: .*cycle-self\.html -> .*cycle-self\.html/],
    'dup-export.html': [SyntaxError, /Duplicate export "Thing"/],
    'empty-export.html': [SyntaxError, /Empty export name/],
    'ns-collision.html': [SyntaxError, /Duplicate export "ok"/],
    'reexport-shape.html': [SyntaxError, /must have `all`, `namespace`, or at least one binding/],
    'script-type.html': [TypeError, /Unsupported exported <script type="text\/plain">/],
    'does-not-exist.html': [Error, /Failed to fetch HTML module .*: 404/],
  };
  const onDisk = new Set(all.filter((p) => p.startsWith('errors/') && p.endsWith('.html')).map((p) => p.slice('errors/'.length)));
  for (const f of onDisk) assert.ok(f === 'ok.html' || f === 'cycle-b.html' || f in expectations, `errors/${f} has an expectation`);
  for (const [file, [Type, pattern]] of Object.entries(expectations)) {
    await assert.rejects(makeLoader().load(`${ORIGIN}examples/errors/${file}`), (error) => {
      assert.ok(error instanceof Type, `${file}: expected ${Type.name}, got ${error.name}: ${error.message}`);
      assert.match(error.message, pattern, file);
      return true;
    });
  }
});

test('catalog: every checklist item is covered, every page exists and shows its coverage', async () => {
  const ids = new Set(allItems.map((i) => i.id));
  assert.equal(ids.size, allItems.length, 'checklist ids are unique');
  for (const page of pages) {
    for (const id of page.covers) assert.ok(ids.has(id), `${page.id} covers unknown item ${id}`);
    assert.equal(new Set(page.covers).size, page.covers.length, `${page.id} lists an item twice`);
    const html = await readFile(join(examplesDir, page.href), 'utf8');
    assert.match(html, new RegExp(`class="covers" data-page="${page.id}"`), `${page.href} renders its coverage`);
  }
  const covered = new Set(pages.flatMap((p) => p.covers));
  const missing = allItems.filter((i) => !covered.has(i.id) && !(i.id in uncovered)).map((i) => i.id);
  assert.deepEqual(missing, [], 'uncovered checklist items');
  assert.ok(checklist.length >= 10);
  assert.deepEqual(pageFiles.filter((f) => f !== 'index.html').sort(), pages.map((p) => p.href).sort(), 'every page is in the catalog');
});

test('example pages reference files that exist', async () => {
  for (const page of pageFiles) {
    const html = await readFile(join(examplesDir, page), 'utf8');
    const { document } = makeWindow(html);
    const refs = [
      ...[...document.querySelectorAll('script[src], link[href][rel="stylesheet"]')].map((el) => el.getAttribute('src') ?? el.getAttribute('href')),
      ...[...document.querySelectorAll('module-import[from], esm-import[from]')].map((el) => el.getAttribute('from')).filter((f) => f.startsWith('.') && !f.includes('does-not-exist')),
      ...[...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith('./') || /^[\w-]+\.html$/.test(h)),
    ];
    for (const ref of refs) {
      const path = fileURLToPath(new URL(ref, pathToFileURL(join(examplesDir, page))));
      await access(path).catch(() => assert.fail(`${page} references missing ${ref}`));
    }
  }
});

test('the committed CLI outputs are up to date', async () => {
  const cwd = fileURLToPath(root);
  const config = 'examples/cli/modules.config.js';
  const dir = await mkdtemp(join(tmpdir(), 'wmg-examples-'));
  const sink = () => ({ text: '', write(s) { this.text += s; } });
  await main(['build', '--config', config, '--out', join(dir, 'importmap.json'), '--lock', join(dir, 'lock.json')], { cwd, stdout: sink() });
  await main(['build', '--config', config, '--html', '--out', join(dir, 'importmap.html')], { cwd, stdout: sink() });
  const resolved = sink();
  await main(['resolve', '@tokens', 'greet@^1', 'jsr:@demo/scoped@^2', '@lib/', '--config', config], { cwd, stdout: resolved });
  const read = (p) => readFile(p, 'utf8');
  const committed = (f) => read(join(examplesDir, 'cli', f));
  assert.equal(await read(join(dir, 'importmap.json')), await committed('importmap.json'));
  assert.equal(await read(join(dir, 'lock.json')), await committed('modules.lock.json'));
  assert.equal(await read(join(dir, 'importmap.html')), await committed('importmap.html'));
  assert.equal(resolved.text, await committed('resolve.txt'));
});
