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
