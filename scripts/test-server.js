// Static server for the browser tests: serves the repository root with the cache disabled, and adds response
// headers on request so a test can prove behaviour under a real Content-Security-Policy:
//
//   /examples/quickstart.html?csp=tt     → Content-Security-Policy: require-trusted-types-for 'script'; trusted-types html-modules
//   /examples/quickstart.html?csp=strict → default-src 'self'; script-src 'self'; style-src 'self'; require-trusted-types-for 'script'; trusted-types html-modules
//   /anything?header=Name:Value          → any other header
//
// node scripts/test-server.js [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

const CSP = {
  tt: "require-trusted-types-for 'script'; trusted-types html-modules",
  strict: "default-src 'self'; script-src 'self'; style-src 'self'; require-trusted-types-for 'script'; trusted-types html-modules",
};

export const root = fileURLToPath(new URL('../', import.meta.url));

export function createTestServer({ dir = root } = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = normalize(decodeURIComponent(url.pathname));
      if (path.endsWith(sep) || path.endsWith('/')) path = join(path, 'index.html');
      const file = join(dir, path);
      if (!file.startsWith(dir)) throw Object.assign(new Error('outside root'), { code: 'ENOENT' });
      if ((await stat(file)).isDirectory()) {
        res.writeHead(301, { location: `${url.pathname}/` }).end();
        return;
      }
      const headers = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
      const csp = url.searchParams.get('csp');
      if (csp) headers['content-security-policy'] = CSP[csp] ?? csp;
      for (const h of url.searchParams.getAll('header')) {
        const at = h.indexOf(':');
        if (at > 0) headers[h.slice(0, at).toLowerCase()] = h.slice(at + 1);
      }
      res.writeHead(200, headers).end(await readFile(file));
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' }).end(error.code === 'ENOENT' ? 'not found' : String(error));
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? 4173);
  createTestServer().listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
}
