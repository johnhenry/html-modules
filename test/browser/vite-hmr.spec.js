// The Vite plugin's HMR in real engines: a real `vite` dev server, HTML modules imported from JavaScript, edits applied
// in place (same host element, listeners, light DOM; re-stamped template; swapped constructed stylesheet) and a full
// reload when the change cannot be applied to live elements.
import { test, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import htmlModules from '../../src/vite.js';

test.describe.configure({ mode: 'serial' });

const runtime = fileURLToPath(new URL('../../src/runtime.js', import.meta.url));
const source = ({ body = '<h2>v1 {{who}}</h2>', css = ':host { color: rgb(255, 0, 0); }', shadow = '' } = {}) =>
  `<html-export name="card" props="who" ${shadow}><style>${css}</style><template>${body}</template></html-export>`;

let dir;
let server;
let url;

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'html-modules-vite-hmr-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>');
  await writeFile(join(dir, 'main.js'), `import { card } from './ui.html';
card.define('x-card');
document.body.insertAdjacentHTML('beforeend', '<x-card id="card" who="Ada"><i>light</i></x-card>');
window.__ready = true;
import.meta.hot?.on('vite:afterUpdate', () => { window.__updates = (window.__updates ?? 0) + 1; });`);
  await writeFile(join(dir, 'ui.html'), source());
  server = await createServer({
    root: dir, configFile: false, logLevel: 'silent', cacheDir: join(dir, '.vite'),
    resolve: { alias: { '@johnhenry/html-modules/runtime': runtime } },
    plugins: [htmlModules()],
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { strict: false } },
  });
  await server.listen();
  url = server.resolvedUrls.local[0];
});

test.afterEach(async () => {
  await server.close();
  await rm(dir, { recursive: true, force: true });
});

const open = async (page) => {
  await page.goto(url);
  await page.waitForFunction(() => window.__ready && document.getElementById('card')?.shadowRoot?.querySelector('h2'));
  // The HMR socket is connected once Vite has registered the client (no fixed sleep).
  await expect.poll(() => server.ws.clients.size).toBeGreaterThan(0);
};

test('an edit is applied in place through Vite HMR', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const el = document.getElementById('card');
    window.__host = el;
    window.__root = el.shadowRoot;
    el.addEventListener('ping', () => (window.__pings = (window.__pings ?? 0) + 1));
    window.__time = performance.timeOrigin;
  });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('card')).color)).toBe('rgb(255, 0, 0)');
  await writeFile(join(dir, 'ui.html'), source({ body: '<section>v2 {{who}}</section>', css: ':host { color: rgb(0, 128, 0); }' }));
  await page.waitForFunction(() => document.getElementById('card').shadowRoot.querySelector('section'), null, { timeout: 10_000 });
  const after = await page.evaluate(() => {
    const el = document.getElementById('card');
    el.dispatchEvent(new Event('ping'));
    el.who = 'Grace';
    return {
      sameHost: el === window.__host, sameRoot: el.shadowRoot === window.__root, sameLoad: performance.timeOrigin === window.__time,
      text: el.shadowRoot.querySelector('section').textContent, light: el.firstElementChild.textContent,
      color: getComputedStyle(el).color, sheets: el.shadowRoot.adoptedStyleSheets.length, pings: window.__pings,
    };
  });
  expect(after).toEqual({ sameHost: true, sameRoot: true, sameLoad: true, text: 'v2 Grace', light: 'light', color: 'rgb(0, 128, 0)', sheets: 1, pings: 1 });
});

test('a change that cannot be applied in place (shadow mode) falls back to a full reload', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__marker = 1; });
  const reloaded = page.waitForEvent('load', { timeout: 10_000 });
  await writeFile(join(dir, 'ui.html'), source({ shadow: 'shadow="closed"' }));
  await reloaded;
  await page.waitForFunction(() => window.__ready);
  expect(await page.evaluate(() => window.__marker)).toBeUndefined();
  expect(await page.evaluate(() => document.getElementById('card').shadowRoot)).toBeNull();
});
