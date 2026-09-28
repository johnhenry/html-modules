import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { main } from '../bin/web-module-graph.js';

const routerURL = new URL('../src/routers/index.js', import.meta.url).href;

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
  assert.equal(lock['@std/path'].provider, 'jsr.example');
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
