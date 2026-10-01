/**
 * The dev server behind `html-module dev [dir]`: a static file server over a directory that watches it and tells
 * open pages what changed, over Server-Sent Events. Only `node:http` and `node:fs`: no dependencies.
 *
 *   const dev = await createDevServer({ dir: './site', port: 5173 });
 *   dev.url;          // http://127.0.0.1:5173/
 *   await dev.close();
 *
 * Every HTML *page* it serves (a navigation: `Sec-Fetch-Dest: document` / `iframe`, or an `Accept` for text/html)
 * gets one `<script type="module" src="/@html-modules/client.js">` appended; HTML modules fetched by the loader are
 * served untouched. The client (`dev-client.js`) listens on `/@html-modules/events`. When a `.html` file changes it
 * calls `HTMLModules.hotReload()`, which swaps the module's components and styles under live elements, and falls
 * back to a full reload when the change cannot be applied in place; any other file, or the page itself, reloads.
 * Responses are `Cache-Control: no-store`.
 */
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json', '.wasm': 'application/wasm',
};

const EVENTS = '/@html-modules/events';
const CLIENT = '/@html-modules/client.js';
const clientSource = fileURLToPath(new URL('./dev-client.js', import.meta.url));
const SNIPPET = `<script type="module" src="${CLIENT}"></script>`;
const IGNORED = /(^|[\\/])(node_modules|\.git|\.DS_Store)([\\/]|$)|~$|\.sw[px]$/;

/** True when the request is a page navigation (not a `fetch()` of a module). */
function isNavigation(req) {
  const dest = req.headers['sec-fetch-dest'];
  if (dest) return dest === 'document' || dest === 'iframe';
  return String(req.headers.accept ?? '').includes('text/html');
}

/** `html` with the client script added before `</body>` (or at the end). */
export function injectClient(html) {
  const at = html.search(/<\/body\s*>/i);
  return at < 0 ? html + SNIPPET : html.slice(0, at) + SNIPPET + html.slice(at);
}

/**
 * @param {object} [options]
 * @param {string} [options.dir]     the directory to serve and watch (default: the current directory)
 * @param {number} [options.port]    (default 5173; 0 picks a free one)
 * @param {string} [options.host]    (default 127.0.0.1)
 * @param {boolean} [options.watch]  watch for changes (default true)
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ server: import('node:http').Server, url: string, port: number, dir: string, clients: Set<object>, notify: (path: string, kind?: string) => void, close: () => Promise<void> }>}
 */
export async function createDevServer({ dir = '.', port = 5173, host = '127.0.0.1', watch: watching = true, log = () => {} } = {}) {
  const root = resolve(dir);
  if (!(await stat(root).catch(() => null))?.isDirectory()) throw new Error(`html-module dev: ${root} is not a directory`);
  const clients = new Set();

  /** Tell every open page that `path` (URL path, `/`-rooted) changed. */
  const notify = (path, kind = 'change') => {
    log(`${kind} ${path}`);
    for (const res of clients) res.write(`event: change\ndata: ${JSON.stringify({ path, kind })}\n\n`);
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === EVENTS) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write('retry: 500\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (url.pathname === CLIENT) {
        res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' }).end(await readFile(clientSource));
        return;
      }
      let path = normalize(decodeURIComponent(url.pathname));
      if (path.endsWith(sep)) path = join(path, 'index.html');
      const file = join(root, path);
      if (file !== root && !file.startsWith(root + sep)) throw Object.assign(new Error('outside the served directory'), { code: 'ENOENT' });
      if ((await stat(file)).isDirectory()) {
        res.writeHead(301, { location: `${url.pathname}/` }).end();
        return;
      }
      let body = await readFile(file);
      const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
      if (type.startsWith('text/html') && isNavigation(req)) body = injectClient(body.toString('utf8'));
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      res.writeHead(missing ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' }).end(missing ? 'not found' : String(error));
    }
  });

  let watcher = null;
  if (watching) {
    const pending = new Map();
    const seen = new Map(); // file → mtime and size last announced: editors and fs.watch often report one save twice
    watcher = watch(root, { recursive: true }, (event, filename) => {
      if (!filename || IGNORED.test(filename)) return;
      clearTimeout(pending.get(filename));
      pending.set(filename, setTimeout(async () => {
        pending.delete(filename);
        const info = await stat(join(root, filename)).then((s) => (s.isFile() ? `${s.mtimeMs}:${s.size}` : null), () => null);
        if (info && seen.get(filename) !== info) {
          seen.set(filename, info);
          notify(`/${relative('.', filename).split(sep).join('/')}`);
        }
      }, 60));
    });
    watcher.on('error', () => {});
  }

  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, done);
  });
  const address = server.address();
  return {
    server,
    dir: root,
    port: address.port,
    url: `http://${host.includes(':') ? `[${host}]` : host}:${address.port}/`,
    clients,
    notify,
    close() {
      watcher?.close();
      for (const res of clients) res.end();
      clients.clear();
      server.closeAllConnections?.();
      return new Promise((done) => server.close(() => done()));
    },
  };
}
