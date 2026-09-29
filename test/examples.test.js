// The examples are part of the contract: every HTML module in them must read
// the same through the DOM and the scanner and load (except the intentionally
// broken ones, which must fail as the errors page says), the compiled output
// must be current, the catalog must cover the whole checklist, and every page
// must work offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readHTMLModule, scanHTMLModule } from '../src/index.js';
import { compileExamples } from '../scripts/compile-examples.js';
import { checklist, pages, uncovered, allItems } from '../examples/shared/catalog.js';
import { setup, shared, normalizeHTML } from './helpers.js';

const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const files = (await readdir(examples, { recursive: true })).map((f) => join(examples, f));
const htmlModules = files.filter((f) => f.endsWith('.html') && /\/(components|app|interop|errors)\//.test(f));
const pageFiles = files.filter((f) => f.endsWith('.html') && !/\/(components|app|interop|errors|compiler)\//.test(f));
const broken = {
  'errors/no-template.html': /needs a <template>/,
  'errors/dup-export.html': /Duplicate export "card"/,
  'errors/bad-name.html': /Invalid export name "FancyCard"/,
  'errors/cycle-a.html': /Circular HTML module dependency/,
  'errors/cycle-b.html': /Circular HTML module dependency/,
};

const normalized = (r) => ({ ...r, exports: r.exports.map((e) => (e.kind === 'component' ? { ...e, template: normalizeHTML(e.template) } : e)) });

test('every example HTML module reads the same through the DOM and the scanner', async () => {
  assert.ok(htmlModules.length >= 15);
  for (const file of htmlModules) {
    const name = relative(examples, file);
    const source = await readFile(file, 'utf8');
    if (broken[name] && !name.includes('cycle')) {
      assert.throws(() => scanHTMLModule(source, name), broken[name], name);
      assert.throws(() => readHTMLModule(new shared.DOMParser().parseFromString(source, 'text/html'), name), broken[name], name);
      continue;
    }
    const a = readHTMLModule(new shared.DOMParser().parseFromString(source, 'text/html'), name);
    const b = scanHTMLModule(source, name);
    assert.deepEqual(normalized(b), normalized(a), name);
  }
});

test('every example HTML module loads, and the broken ones fail as documented', async () => {
  for (const file of htmlModules) {
    const name = relative(examples, file);
    const { modules } = setup({ window: shared });
    const load = modules.load(pathToFileURL(file).href);
    if (broken[name]) await assert.rejects(load, broken[name], name);
    else assert.ok(Object.keys(await load).includes('components'), name);
  }
});

test('examples/compiled/ is up to date (npm run examples:compile)', async () => {
  for (const [to, js] of Object.entries(await compileExamples())) {
    assert.equal(await readFile(join(examples, to), 'utf8'), js, `examples/${to} is stale`);
  }
});

test('the catalog covers every checklist item, and every page exists and is wired up', async () => {
  const ids = new Set(allItems.map((i) => i.id));
  assert.equal(ids.size, allItems.length, 'checklist ids are unique');
  for (const p of pages) for (const id of p.covers) assert.ok(ids.has(id), `${p.id} covers unknown item ${id}`);
  const covered = new Set(pages.flatMap((p) => p.covers));
  for (const { id } of allItems) assert.ok(covered.has(id) || uncovered[id], `${id} is not covered by any page`);
  assert.ok(checklist.length > 5);
  for (const p of pages) {
    const html = await readFile(join(examples, p.href), 'utf8');
    assert.match(html, new RegExp(`data-page="${p.id}"`), `${p.href} shows its covers`);
    assert.match(html, /<script type="module" src="\.\/shared\/site\.js"><\/script>/, `${p.href} loads site.js`);
    assert.match(html, /<nav class="site-nav"><\/nav>/, `${p.href} has the page nav`);
  }
  assert.deepEqual(pageFiles.map((f) => relative(examples, f)).sort(), ['index.html', ...pages.map((p) => p.href)].sort(), 'every page is in the catalog');
});

test('every page works offline: no remote URLs, and every local reference exists', async () => {
  const exists = new Set(files.map((f) => pathToFileURL(f).href));
  const srcFiles = (await readdir(fileURLToPath(new URL('../src/', import.meta.url)))).map((f) => new URL(`../src/${f}`, import.meta.url).href);
  for (const f of srcFiles) exists.add(f);
  for (const file of files.filter((f) => f.endsWith('.html') || f.endsWith('.js'))) {
    // Ignore markup shown as text (inside <pre>, <code> and <textarea>).
    const text = (await readFile(file, 'utf8')).replace(/<(pre|code|textarea)\b[\s\S]*?<\/\1>/g, '');
    assert.doesNotMatch(text, /(?:src|href)="https?:\/\//, `${relative(examples, file)} references a remote URL`);
    assert.doesNotMatch(text, /from ['"]https?:\/\//, `${relative(examples, file)} imports a remote module`);
    const refs = [...text.matchAll(/(?:src|href|data-source)="(\.{1,2}\/[^"#?]+)"/g), ...text.matchAll(/^\s*(?:import|export)\b[^'"\n]*?['"](\.{1,2}\/[^'"]+)['"]/gm)].map((m) => m[1]);
    for (const ref of refs) {
      if (ref.includes('${')) continue;
      const url = new URL(ref, pathToFileURL(file)).href;
      if (url.endsWith('/')) continue;
      assert.ok(exists.has(url), `${relative(examples, file)} → ${ref} does not exist`);
    }
  }
});
