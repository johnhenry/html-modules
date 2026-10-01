// `html-module dev`: the static server, client injection, SSE change events from fs.watch, the CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDevServer, injectClient } from '../src/dev-server.js';
import { main } from '../bin/html-module.js';

const site = async (files) => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'html-modules-dev-')));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), body);
  }
  return dir;
};

/** Open the event stream; resolves `{ events, next(), close() }`. */
function listen(url) {
  return new Promise((resolve) => {
    const events = [];
    const waiting = [];
    const req = get(new URL('/@html-modules/events', url), (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        for (let at; (at = buffer.indexOf('\n\n')) >= 0; buffer = buffer.slice(at + 2)) {
          const block = buffer.slice(0, at);
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (data) {
            events.push(JSON.parse(data));
            waiting.shift()?.(events.at(-1));
          }
        }
      });
      resolve({
        events,
        next: () => new Promise((done) => (events.length ? done(events.shift()) : waiting.push(done))),
        close: () => req.destroy(),
      });
    });
  });
}

const page = (url, path, headers = {}) => fetch(new URL(path, url), { headers }).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), body: await r.text() }));

test('serves a directory with no-store, injects the client into pages only, and 404s outside it', async () => {
  const dir = await site({
    'index.html': '<!doctype html><body><p>page</p></body>',
    'sub/m.html': '<html-export name="x-m"><template>m</template></html-export>',
    'a.js': 'export const a = 1;',
    'bare.html': '<p>no body tag</p>',
  });
  const dev = await createDevServer({ dir, port: 0, watch: false });
  try {
    const root = await page(dev.url, '/', { 'sec-fetch-dest': 'document' });
    assert.equal(root.status, 200);
    assert.match(root.type, /^text\/html/);
    assert.equal(root.cache, 'no-store');
    assert.match(root.body, /<p>page<\/p><script type="module" src="\/@html-modules\/client\.js"><\/script><\/body>/);
    assert.match((await page(dev.url, '/bare.html', { accept: 'text/html,*/*' })).body, /<p>no body tag<\/p><script type="module"/, 'appended when there is no </body>');
    const fetched = await page(dev.url, '/sub/m.html', { 'sec-fetch-dest': 'empty', accept: '*/*' });
    assert.equal(fetched.body, '<html-export name="x-m"><template>m</template></html-export>', 'a module fetched by the loader is served untouched');
    assert.equal((await page(dev.url, '/a.js')).type, 'text/javascript; charset=utf-8');
    assert.match((await page(dev.url, '/@html-modules/client.js')).body, /HTMLModules\.hotReload|modules\.hotReload/);
    assert.equal((await page(dev.url, '/nope.html')).status, 404);
    assert.equal((await page(dev.url, '/%2e%2e/%2e%2e/etc/passwd')).status, 404);
    assert.equal(injectClient('<body>x</BODY >'), '<body>x<script type="module" src="/@html-modules/client.js"></script></BODY >');
  } finally {
    await dev.close();
  }
});

test('watching: a changed file is pushed to open pages over SSE with its URL path; node_modules is ignored', async () => {
  const dir = await site({ 'components/c.html': '<html-export name="x-c"><template>1</template></html-export>', 'node_modules/p/i.js': '1' });
  const logged = [];
  const dev = await createDevServer({ dir, port: 0, log: (l) => logged.push(l) });
  const stream = await listen(dev.url);
  try {
    await new Promise((r) => setTimeout(r, 100));
    await writeFile(join(dir, 'components/c.html'), '<html-export name="x-c"><template>2</template></html-export>');
    assert.deepEqual(await stream.next(), { path: '/components/c.html', kind: 'change' });
    await writeFile(join(dir, 'node_modules/p/i.js'), '2'); // ignored
    await writeFile(join(dir, 'new.css'), 'a{}');
    let event = await stream.next();
    while (event.path === '/components/c.html') event = await stream.next(); // (a platform may report one save twice)
    assert.deepEqual(event, { path: '/new.css', kind: 'change' }, 'a new file; node_modules is ignored');
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(stream.events.filter((e) => !e.path.endsWith('c.html') && e.path !== '/new.css'), [], 'nothing else was pushed (node_modules is ignored)');
    assert.ok(logged.includes('change /components/c.html') && logged.includes('change /new.css'));
    assert.ok(!logged.some((l) => l.includes('node_modules')));
  } finally {
    stream.close();
    await dev.close();
  }
});

test('the CLI: html-module dev <dir> serves until aborted; bad arguments exit 2', async () => {
  const dir = await site({ 'index.html': '<body>cli</body>' });
  const out = [];
  const err = [];
  const abort = new AbortController();
  const io = { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, signal: abort.signal };
  const running = main(['dev', dir, '--port', '0', '--quiet'], io);
  while (!out.length) await new Promise((r) => setTimeout(r, 10));
  const url = /at (http:\/\/\S+\/)/.exec(out[0])[1];
  assert.match(out[0], /serving .* at http:\/\/127\.0\.0\.1:\d+\/ \(watching; open pages hot reload\)/);
  assert.match((await page(url, '/', { 'sec-fetch-dest': 'document' })).body, /cli.*client\.js/);
  abort.abort();
  assert.equal(await running, 0);
  assert.equal(await main(['dev', dir, '--port', 'x'], io), 2);
  assert.equal(await main(['dev', '/definitely/not/here', '--port', '0'], io), 1);
  assert.match(err.join(''), /is not a directory/);
  assert.equal(await main(['dev', '--help'], io), 0);
  assert.match(out.join(''), /html-module dev \[dir\]/);
});
