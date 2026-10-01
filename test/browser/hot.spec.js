// Hot reload in real engines, against a real `html-module dev` server (createDevServer + fs.watch + SSE): live
// elements keep their host, class, shadow root and light DOM, get the new template re-stamped and the new
// constructed stylesheet swapped; what cannot be applied in place reloads the page; a broken edit changes nothing.
import { test, expect } from '@playwright/test';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDevServer } from '../../src/dev-server.js';

test.describe.configure({ mode: 'serial' });

const moduleSource = ({ body = '<h2>v1 {{who}}</h2><input id="in">', css = ':host { color: rgb(255, 0, 0); }', extra = '', shadow = '' } = {}) =>
  `<html-export name="card" props="who" ${shadow}><style>${css}</style><template>${body}</template></html-export>${extra}`;

let dir;
let dev;
const file = (name) => join(dir, name);

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'html-modules-hot-'));
  await cp(fileURLToPath(new URL('../../src', import.meta.url)), file('src'), { recursive: true });
  await writeFile(file('index.html'), '<!doctype html><html><head><meta charset="utf-8"><script type="module" src="/src/browser.js"></script></head><body><html-import src="./c.html" as="h"></html-import><h--card id="card" who="Ada"><i>light</i></h--card></body></html>');
  await writeFile(file('c.html'), moduleSource());
  dev = await createDevServer({ dir, port: 0 });
});

test.afterEach(async () => {
  await dev.close();
  await rm(dir, { recursive: true, force: true });
});

const hot = (page) => page.evaluate(() => new Promise((resolve) => document.addEventListener('html-modules:hot', (e) => resolve(e.detail), { once: true })));
const open = async (page) => {
  await page.goto(dev.url);
  await page.waitForFunction(() => document.getElementById('card')?.shadowRoot?.querySelector('h2'));
  // The watcher is armed once the page's event stream is registered on the server (no fixed sleep).
  await expect.poll(() => dev.clients.size).toBe(1);
};

test('a template and style edit is applied in place: same element, listeners and light DOM; new stamp, new adopted sheet', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const el = document.getElementById('card');
    window.__host = el;
    window.__root = el.shadowRoot;
    el.addEventListener('ping', () => (window.__pings = (window.__pings ?? 0) + 1));
    window.__time = performance.timeOrigin;
  });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('card')).color)).toBe('rgb(255, 0, 0)');
  const updated = hot(page);
  await writeFile(file('c.html'), moduleSource({ body: '<section>v2 {{who}}</section>', css: ':host { color: rgb(0, 128, 0); }' }));
  const detail = await updated;
  expect(detail).toMatchObject({ reload: false, updated: ['card'], elements: 1 });
  const after = await page.evaluate(() => {
    const el = document.getElementById('card');
    el.dispatchEvent(new Event('ping'));
    return {
      sameHost: el === window.__host,
      sameRoot: el.shadowRoot === window.__root,
      sameLoad: performance.timeOrigin === window.__time,
      text: el.shadowRoot.querySelector('section')?.textContent,
      old: el.shadowRoot.querySelector('h2') === null,
      light: el.firstElementChild?.textContent,
      color: getComputedStyle(el).color,
      sheets: el.shadowRoot.adoptedStyleSheets.length,
      pings: window.__pings,
    };
  });
  expect(after).toEqual({ sameHost: true, sameRoot: true, sameLoad: true, text: 'v2 Ada', old: true, light: 'light', color: 'rgb(0, 128, 0)', sheets: 1, pings: 1 });
  // A style-only edit swaps the sheet and leaves the stamped template untouched.
  await page.evaluate(() => { window.__section = document.getElementById('card').shadowRoot.querySelector('section'); });
  const again = hot(page);
  await writeFile(file('c.html'), moduleSource({ body: '<section>v2 {{who}}</section>', css: ':host { color: rgb(0, 0, 255); }' }));
  await again;
  expect(await page.evaluate(() => ({ same: document.getElementById('card').shadowRoot.querySelector('section') === window.__section, color: getComputedStyle(document.getElementById('card')).color, sheets: document.getElementById('card').shadowRoot.adoptedStyleSheets.length })))
    .toEqual({ same: true, color: 'rgb(0, 0, 255)', sheets: 1 });
});

test('elements created after the edit use the new definition, and bindings keep working', async ({ page }) => {
  await open(page);
  const updated = hot(page);
  await writeFile(file('c.html'), moduleSource({ body: '<p>v2 {{who}}</p>' }));
  await updated;
  const text = await page.evaluate(async () => {
    const el = document.createElement('h--card');
    el.setAttribute('who', 'Zed');
    document.body.append(el);
    const first = el.shadowRoot.querySelector('p').textContent;
    el.who = 'Grace';
    return [first, el.shadowRoot.querySelector('p').textContent];
  });
  expect(text).toEqual(['v2 Zed', 'v2 Grace']);
});

test('a change that cannot be applied in place reloads the page; an unrelated html file is ignored', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__marker = 1; });
  // An HTML file the page never loaded is announced first, then a style-only edit of the loaded module is applied in
  // place: the hot event for the second proves the first was processed, and a reload from it would have lost the marker.
  await writeFile(file('other.html'), '<p>not a module this page loaded</p>');
  const updated = hot(page);
  await writeFile(file('c.html'), moduleSource({ css: ':host { color: rgb(0, 0, 255); }' }));
  expect(await updated).toMatchObject({ reload: false });
  expect(await page.evaluate(() => window.__marker), 'an HTML file the page never loaded does not reload it').toBe(1);
  const reloaded = page.waitForEvent('load');
  await writeFile(file('c.html'), moduleSource({ shadow: 'shadow="closed"' }));
  await reloaded;
  await page.waitForFunction(() => document.getElementById('card')?.shadowRoot === null || document.getElementById('card')?.shadowRoot?.querySelector('h2'));
  expect(await page.evaluate(() => window.__marker), 'a full reload: window state is gone').toBeUndefined();
});

test('a broken edit shows an overlay and changes nothing; the next good save clears it', async ({ page }) => {
  await open(page);
  const text = () => page.evaluate(() => document.getElementById('card').shadowRoot.querySelector('h2, section')?.textContent);
  await writeFile(file('c.html'), '<html-export name="card"></html-export>');
  await page.waitForFunction(() => [...document.documentElement.children].some((c) => c.shadowRoot?.querySelector('pre')?.textContent.includes('needs a <template>')));
  expect(await text()).toBe('v1 Ada');
  const updated = hot(page);
  await writeFile(file('c.html'), moduleSource({ body: '<section>fixed {{who}}</section>' }));
  await updated;
  expect(await text()).toBe('fixed Ada');
  expect(await page.evaluate(() => [...document.documentElement.children].some((c) => c.shadowRoot?.querySelector('pre')))).toBe(false);
});
