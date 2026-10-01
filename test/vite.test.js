// The Vite plugin, against real Vite: a production build bundles HTML modules (and their HTML dependencies) imported
// from JavaScript, the bundle behaves like the runtime-loaded module, and dev output carries HMR code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import htmlModules from '../src/vite.js';
import { makeWindow } from './helpers.js';

const runtime = fileURLToPath(new URL('../src/runtime.js', import.meta.url));
const alias = { '@johnhenry/html-modules/runtime': runtime };

async function project(files) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-vite-')));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), body);
  }
  return dir;
}

const files = {
  'main.js': `import * as ui from './ui.html';\nexport const { userCard, theme, config } = ui;\nexport { default as note } from './note.html';\nexport const components = ui.components;`,
  'ui.html': `<html-import src="./icons.html" as="icon"></html-import>
<html-export name="user-card" props="who count:number"><style>:host{display:block}</style><template><icon--star></icon--star><b>{{who}}</b> <i>{{count}}</i></template></html-export>
<html-export name="theme"><style>b{color:red}</style></html-export>
<html-export name="config"><script type="application/json">{"size":3}</script></html-export>`,
  'icons.html': `<html-export name="star"><template>*</template></html-export>`,
  'note.html': `<html-export name="default"><template><p>note</p></template></html-export>`,
};

test('vite build: HTML modules imported from JS (and their HTML dependencies) are compiled and bundled', async () => {
  const root = await project(files);
  const out = await build({
    root, configFile: false, logLevel: 'silent', resolve: { alias },
    plugins: [htmlModules()],
    build: { write: false, minify: false, lib: { entry: 'main.js', formats: ['es'], fileName: 'out' } },
  });
  const [chunk] = [].concat(out)[0].output.filter((o) => o.type === 'chunk');
  assert.doesNotMatch(chunk.code, /import\.meta\.hot/, 'no HMR code in a production build');
  assert.equal(/(?:from|import)\s*\(?\s*["'][^"']*\.html["']/.test(chunk.code), false, 'every .html import was compiled into the bundle');
  assert.match(chunk.code, /<icon--star>/);
  const bundle = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  assert.deepEqual(Object.keys(bundle).sort(), ['components', 'config', 'note', 'theme', 'userCard']);
  assert.deepEqual(bundle.config, { size: 3 });
  // It behaves like the runtime-loaded module: bindings, props, and the module's own <html-import> of icons.html.
  const win = makeWindow();
  bundle.userCard.define('v-card', { window: win });
  win.document.body.insertAdjacentHTML('beforeend', '<v-card who="Ada" count="2"></v-card>');
  const el = win.document.body.lastElementChild;
  assert.equal(el.shadowRoot.querySelector('b').textContent, 'Ada');
  assert.ok(win.customElements.get('icon--star'), "the module's own import registered <icon--star>");
  el.count = 3;
  assert.equal(el.shadowRoot.querySelector('i').textContent, '3');
  assert.equal(bundle.note.name, null, 'the default export');
});

test('vite build: an .html entry page is left to Vite, and a broken module fails the build with the SyntaxError', async () => {
  const root = await project({
    'index.html': '<!doctype html><html><body><script type="module" src="./main.js"></script></body></html>',
    'main.js': `import { c } from './c.html'; console.log(c);`,
    'c.html': `<html-export name="c"></html-export>`,
  });
  await assert.rejects(
    build({ root, configFile: false, logLevel: 'silent', resolve: { alias }, plugins: [htmlModules()], build: { write: false } }),
    /<html-export name="c"> needs a <template>/,
  );
  const ok = await project({
    'index.html': '<!doctype html><html><body><script type="module" src="./main.js"></script></body></html>',
    'main.js': `import { c } from './c.html'; console.log(c.name);`,
    'c.html': `<html-export name="c"><template>c</template></html-export>`,
  });
  const out = await build({ root: ok, configFile: false, logLevel: 'silent', resolve: { alias }, plugins: [htmlModules()], build: { write: false } });
  const assets = [].concat(out)[0].output.map((o) => o.fileName);
  assert.ok(assets.some((f) => f.endsWith('.html')) && assets.some((f) => f.endsWith('.js')), assets.join());
});

test('vite dev: the compiled module carries HMR code (accept itself, hot-replace, invalidate)', async () => {
  const root = await project(files);
  const server = await createServer({ root, configFile: false, logLevel: 'silent', resolve: { alias }, plugins: [htmlModules()], server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const result = await server.transformRequest('/ui.html?html-module');
    assert.match(result.code, /import\.meta\.hot/);
    assert.match(result.code, /hotReplaceModule/);
    assert.match(result.code, /\.invalidate\(/);
    assert.match(result.code, /\.accept\(\)/);
    const off = await createServer({ root, configFile: false, logLevel: 'silent', resolve: { alias }, plugins: [htmlModules({ hot: false })], server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
    assert.doesNotMatch((await off.transformRequest('/ui.html?html-module')).code, /hotReplaceModule/);
    await off.close();
  } finally {
    await server.close();
  }
});
