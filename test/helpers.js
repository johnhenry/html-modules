import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

export const fixtures = new URL('./fixtures/', import.meta.url).href;

/** Minimal fetch over file: URLs. */
export async function fileFetch(url) {
  try {
    const text = await readFile(fileURLToPath(url), 'utf8');
    return { ok: true, status: 200, text: async () => text };
  } catch {
    return { ok: false, status: 404, text: async () => '' };
  }
}

export function makeWindow(html = '<!doctype html><html><head></head><body></body></html>') {
  const { window } = parseHTML(html);
  return window;
}

export const parseDoc = (html) => new (makeWindow().DOMParser)().parseFromString(html, 'text/html');

/**
 * A fake network for mport: URL → status | JSON body | (url, init) => Response.
 * Keys ending in "*" match by prefix. Every request is logged on `fetch.log`.
 */
export function fakeFetch(table = {}, { delays = {} } = {}) {
  const fetch = async (url, init = {}) => {
    url = String(url);
    fetch.log.push({ url, method: init.method ?? 'GET' });
    const wait = Object.entries(delays).find(([k]) => url.startsWith(k))?.[1] ?? 0;
    if (wait) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, wait);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    }
    const hit = table[url] ?? Object.entries(table).find(([k]) => k.endsWith('*') && url.startsWith(k.slice(0, -1)))?.[1];
    if (hit === undefined) return new Response('not found', { status: 404 });
    if (typeof hit === 'function') return hit(url, init);
    if (typeof hit === 'number') return new Response(hit < 400 ? 'ok' : 'err', { status: hit });
    return new Response(typeof hit === 'string' ? hit : JSON.stringify(hit), { status: 200 });
  };
  fetch.log = [];
  return fetch;
}

/** npm and JSR registry metadata, as mport's registry lookups expect it. */
export const registry = {
  'https://registry.npmjs.org/react': { 'dist-tags': { latest: '19.2.0' }, versions: { '18.3.1': {}, '19.0.0': {}, '19.2.0': {} } },
  'https://registry.npmjs.org/react/19.2.0': { name: 'react', version: '19.2.0', main: 'index.js' },
  'https://registry.npmjs.org/lit': { 'dist-tags': { latest: '3.3.1' }, versions: { '3.3.1': {} } },
  'https://registry.npmjs.org/lodash-es': { 'dist-tags': { latest: '4.17.21' }, versions: { '4.17.20': {}, '4.17.21': {} } },
  'https://registry.npmjs.org/@scope%2Fpkg': { 'dist-tags': { latest: '1.2.3' }, versions: { '1.0.0': {}, '1.2.3': {} } },
  'https://jsr.io/@std/path/meta.json': { latest: '1.1.0', versions: { '1.0.0': {}, '1.1.0': {}, '1.2.0': { yanked: true } } },
};
