import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { main } from '../bin/web-module-graph.js';

const routerURL = new URL('../src/routers/index.js', import.meta.url).href;
const mportURL = import.meta.resolve('mport');
const helpersURL = new URL('./helpers.js', import.meta.url).href;

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'wmg-'));
  await writeFile(join(dir, 'modules.config.js'), `
    import { basicRouter } from ${JSON.stringify(routerURL)};
    export default {
      router: basicRouter({ routes: { '@std/*': 'https://jsr.example/', '*': 'https://esm.sh/' } }),
      specifiers: ['react@19', '@std/path'],
      importMap: { imports: { app: '/app.js' } },
    };`);
  return dir;
}

const sink = () => {
  let out = '';
  return { write: (s) => (out += s), get text() { return out; } };
};

test('build writes an import map and lockfile', async () => {
  const dir = await project();
  const code = await main(['build', '--out', 'importmap.json', '--lock', 'modules.lock.json'], { cwd: dir, stdout: sink() });
  assert.equal(code, 0);
  const map = JSON.parse(await readFile(join(dir, 'importmap.json'), 'utf8'));
  assert.deepEqual(map, { imports: { app: '/app.js', 'react@19': 'https://esm.sh/react@19', '@std/path': 'https://jsr.example/@std/path' } });
  const lock = JSON.parse(await readFile(join(dir, 'modules.lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 1);
  assert.equal(lock.packages['@std/path'].provider, 'jsr.example');
});

test('build --html prints a script tag; resolve prints resolutions', async () => {
  const dir = await project();
  const out = sink();
  await main(['build', '--html'], { cwd: dir, stdout: out });
  assert.match(out.text, /^<script type="importmap">/);
  const out2 = sink();
  await main(['resolve', 'lit'], { cwd: dir, stdout: out2 });
  assert.match(out2.text, /^lit\t\{"url":"https:\/\/esm\.sh\/lit","provider":"esm\.sh","route":"\*"\}/);
});

test('usage on missing command', async () => {
  const out = sink();
  assert.equal(await main([], { stdout: out }), 1);
  assert.match(out.text, /Usage:/);
});

test('bin runs as an executable', async () => {
  const dir = await project();
  const bin = new URL('../bin/web-module-graph.js', import.meta.url).pathname;
  const { stdout } = await promisify(execFile)(process.execPath, [bin, 'build'], { cwd: dir });
  assert.equal(JSON.parse(stdout).imports['react@19'], 'https://esm.sh/react@19');
});

// A config whose router is mport v2 (offline: registry and CDN are faked).
async function mportProject({ wrap = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'wmg-mport-'));
  await writeFile(join(dir, 'modules.config.js'), `
    import { createRouter, esmSh, jsr } from ${JSON.stringify(mportURL)};
    import { fromMport, chainRouters, basicRouter } from ${JSON.stringify(routerURL)};
    import { fakeFetch, registry } from ${JSON.stringify(helpersURL)};
    export const net = fakeFetch({ ...registry, 'https://esm.sh/*': 200 });
    export default ({ lock }) => {
      const mport = createRouter({ '*': esmSh(), '@std/*': jsr() }, { fetch: net, lock });
      return {
        router: ${wrap ? "chainRouters(basicRouter({ routes: { app: () => '/app.js' } }), fromMport(mport))" : 'mport'},
        specifiers: ['react@^19', 'lit/', 'jsr:@std/path@^1'${wrap ? ", 'app'" : ''}],
        scopes: { 'https://legacy.example/': { react: 'react@18' } },
      };
    };`);
  return dir;
}

test('build with an mport router: router.build(), mport lockfile, pinning and --relock', async () => {
  for (const wrap of [false, true]) {
    const dir = await mportProject({ wrap });
    const args = ['build', '--out', 'importmap.json', '--lock', 'mport.lock.json'];
    assert.equal(await main(args, { cwd: dir, stdout: sink() }), 0);
    const map = JSON.parse(await readFile(join(dir, 'importmap.json'), 'utf8'));
    assert.deepEqual(map.imports, {
      react: 'https://esm.sh/react@19.2.0', 'lit/': 'https://esm.sh/lit@3.3.1/', 'jsr:@std/path': 'https://esm.sh/jsr/@std/path@1.1.0',
      ...(wrap && { app: '/app.js' }),
    });
    assert.deepEqual(map.scopes, { 'https://legacy.example/': { react: 'https://esm.sh/react@18.3.1' } });
    const lock = JSON.parse(await readFile(join(dir, 'mport.lock.json'), 'utf8'));
    assert.equal(lock.lockfileVersion, 1);
    assert.deepEqual(lock.packages['react@^19'], {
      specifier: 'react@^19', registry: 'npm', name: 'react', range: '^19', version: '19.2.0', build: 'esm.sh', provider: 'esm.sh', url: 'https://esm.sh/react@19.2.0',
    });

    // A second build reads the lockfile: pinned versions need no registry lookups.
    const { net } = await import(pathToFileURL(join(dir, 'modules.config.js')).href);
    const before = net.log.length;
    await main(args, { cwd: dir, stdout: sink() });
    const lookups = (from) => net.log.slice(from).filter((r) => r.url.startsWith('https://registry.npmjs.org/') || r.url.startsWith('https://jsr.io/'));
    assert.deepEqual(lookups(before), [], `pinned (${wrap ? 'fromMport chain' : 'plain mport router'})`);
    assert.equal(await readFile(join(dir, 'mport.lock.json'), 'utf8'), JSON.stringify(lock, null, 2) + '\n', 'the lock is stable');
    const mid = net.log.length;
    await main([...args, '--relock'], { cwd: dir, stdout: sink() });
    assert.ok(lookups(mid).length > 0, '--relock asks the registry again');
  }
});

test('resolve prints mport resolutions; --trace adds the trace', async () => {
  const dir = await mportProject();
  const out = sink();
  await main(['resolve', 'react@^19', './x.js'], { cwd: dir, stdout: out });
  const [line, unresolved] = out.text.trim().split('\n');
  const printed = JSON.parse(line.split('\t')[1]);
  assert.equal(printed.url, 'https://esm.sh/react@19.2.0');
  assert.equal(printed.trace, undefined);
  assert.equal(unresolved, './x.js\tunresolved');
  const traced = sink();
  await main(['resolve', 'react@^19', '--trace'], { cwd: dir, stdout: traced });
  assert.deepEqual(JSON.parse(traced.text.split('\t')[1]).trace.map((e) => e.type), ['lookup', 'resolved', 'probe', 'ok']);
});
