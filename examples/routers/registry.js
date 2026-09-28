// An offline npm + JSR registry for the examples, served from ./registry/.
// mport resolves ranges ("greet@^1") through its `fetch` option; this fetch
// answers registry requests from files and passes every other request (for
// example mport's HEAD probes) to `fallback`.
//
//   https://registry.npmjs.org/greet            → registry/greet.json
//   https://registry.npmjs.org/@demo%2Fscoped   → registry/@demo/scoped.json
//   https://jsr.io/@demo/scoped/meta.json       → registry/jsr/@demo/scoped/meta.json
const NPM = 'https://registry.npmjs.org/';
const JSR = 'https://jsr.io/';

/**
 * @param {(path: string) => Promise<string|null>} read  reads a path relative to ./registry/
 * @param {typeof fetch} [fallback]
 */
export function localRegistry(read, fallback = (...a) => globalThis.fetch(...a)) {
  const fetch = async (url, init) => {
    const u = String(url);
    const path = u.startsWith(NPM) ? `${decodeURIComponent(u.slice(NPM.length))}.json`
      : u.startsWith(JSR) && u.endsWith('/meta.json') ? `jsr/${u.slice(JSR.length)}`
      : null;
    if (!path) return fallback(url, init);
    fetch.log.push(u);
    const text = await read(path);
    return text == null
      ? new Response('not found', { status: 404 })
      : new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  fetch.log = [];
  return fetch;
}

/** In a page: read ./registry/ over HTTP. */
export const browserRegistry = (fallback) => localRegistry(
  (path) => globalThis.fetch(new URL(`./registry/${path}`, import.meta.url)).then((r) => (r.ok ? r.text() : null)),
  fallback,
);
