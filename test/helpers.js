import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { createHTMLModules, defineHTMLModuleElements } from '../src/index.js';

export const fixtures = new URL('./fixtures/', import.meta.url).href;

export function makeWindow(html = '<!doctype html><html><head></head><body></body></html>') {
  return parseHTML(html).window;
}

/**
 * One window whose HTMLElement is also installed globally, so JS-authored
 * fixture classes (`class extends HTMLElement`) and compiled modules work.
 */
export const shared = makeWindow();
for (const k of ['HTMLElement', 'customElements', 'document', 'CustomEvent', 'DOMParser']) globalThis[k] ??= shared[k];

/** fetch over file: URLs, plus an in-memory table of url → source. Logs every request. */
export function makeFetch(files = {}) {
  const fetch = async (url) => {
    url = String(url);
    fetch.log.push(url);
    if (url in files) {
      const body = files[url];
      if (typeof body === 'number') return { ok: false, status: body, text: async () => '' };
      return { ok: true, status: 200, text: async () => body };
    }
    if (url.startsWith('file:')) {
      try {
        const text = await readFile(fileURLToPath(url), 'utf8');
        return { ok: true, status: 200, text: async () => text };
      } catch {}
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  fetch.log = [];
  return fetch;
}

export const ORIGIN = 'http://modules.test/';

/**
 * An HTMLModules instance over a fresh (or given) window. `files` maps paths
 * under ORIGIN to HTML sources; `js` maps paths to module namespaces.
 */
export function setup({ files = {}, js = {}, window: win = makeWindow(), elements = false, ...options } = {}) {
  const table = Object.fromEntries(Object.entries(files).map(([k, v]) => [new URL(k, ORIGIN).href, v]));
  const modulesByURL = Object.fromEntries(Object.entries(js).map(([k, v]) => [new URL(k, ORIGIN).href, v]));
  const fetch = makeFetch(table);
  const events = [];
  const modules = createHTMLModules({
    window: win,
    baseURL: ORIGIN,
    fetch,
    importModule: async (url) => {
      if (url in modulesByURL) return modulesByURL[url];
      return import(url);
    },
    onEvent: (e) => events.push(e),
    ...options,
  });
  if (elements) defineHTMLModuleElements({ modules, window: win });
  return { window: win, document: win.document, modules, fetch, events };
}

/** Let pending promise jobs and events settle. */
export const tick = (n = 5) => new Promise((resolve) => {
  let i = 0;
  const step = () => (++i >= n ? resolve() : setImmediate(step));
  setImmediate(step);
});

/** Normalize template HTML by parsing and re-serializing it. */
export function normalizeHTML(html) {
  const t = shared.document.createElement('template');
  t.innerHTML = html;
  return t.innerHTML.replace(/\s+/g, ' ').trim();
}
