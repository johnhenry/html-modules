/**
 * The loader: specifier → URL → module namespace, for JS and HTML alike.
 * Relative and absolute URLs resolve against the referrer; bare specifiers go
 * to `hostResolve` (e.g. `import.meta.resolve`, which honors the page's import map).
 */
import { parseHTMLModule, defaultExportValue, dataScriptURL } from './html-module.js';

const isRelative = (s) => s.startsWith('/') || s.startsWith('./') || s.startsWith('../');
function parseURLLikeSpecifier(specifier, baseURL) {
  if (isRelative(specifier)) return new URL(specifier, baseURL);
  try {
    return new URL(specifier);
  } catch {
    return null;
  }
}

const HTML_EXT = /\.html?(?:[?#]|$)/i;
const FETCHABLE = new Set(['http:', 'https:', 'file:', 'data:', 'blob:']);

/**
 * @param {object} [options]
 * @param {string} [options.baseURL]            default referrer
 * @param {(specifier: string) => string|null|undefined} [options.hostResolve]
 * @param {typeof fetch} [options.fetch]
 * @param {(html: string, url: string) => Document} [options.parseHTML]
 * @param {(url: string) => Promise<object>} [options.importModule]
 * @param {(source: string, url: string) => string} [options.scriptURL]
 * @param {typeof defaultExportValue} [options.interpret]
 * @param {(url: string, resolution: object) => 'js'|'html'} [options.detectType]
 * @param {any} [options.window]
 * @param {(event: {type: string, [k: string]: any}) => void} [options.onEvent]  observability hook
 */
export function createLoader({
  baseURL = globalThis.document?.baseURI ?? globalThis.location?.href,
  hostResolve,
  fetch: fetchImpl = (...a) => globalThis.fetch(...a),
  parseHTML,
  importModule = (url) => import(url),
  scriptURL = dataScriptURL,
  interpret = defaultExportValue,
  detectType = (url, res) => res?.type ?? (HTML_EXT.test(url) ? 'html' : 'js'),
  window = globalThis.window ?? globalThis,
  onEvent = () => {},
} = {}) {
  /** @type {Map<string, Promise<object>>} */
  const cache = new Map();
  const parse = parseHTML ?? ((html) => {
    if (!window?.DOMParser) throw new TypeError('No DOMParser available; pass `parseHTML` to createLoader()');
    return new window.DOMParser().parseFromString(html, 'text/html');
  });

  async function resolve(specifier, referrer) {
    referrer ||= baseURL;
    const asURL = parseURLLikeSpecifier(specifier, referrer);
    if (asURL && FETCHABLE.has(asURL.protocol)) return { url: asURL.href };
    const hosted = hostResolve?.(specifier);
    if (hosted) return { url: String(hosted) };
    if (asURL) return { url: asURL.href };
    throw new TypeError(`Unable to resolve bare specifier "${specifier}"${referrer ? ` from ${referrer}` : ''}`);
  }

  /**
   * Re-export wait graph: HTML module URL -> URLs whose namespaces it is
   * currently awaiting. An HTML module's namespace cannot exist until every
   * module it re-exports from has loaded, so an edge that closes a loop would
   * deadlock. This catches cycles whether the modules are loaded one after
   * another or concurrently (where a cached in-flight promise hides the loop).
   * @type {Map<string, Set<string>>}
   */
  const waitsFor = new Map();

  /** Path of awaited URLs from `start` to `goal`, or null. */
  function waitPath(start, goal) {
    const stack = [[start]];
    const seen = new Set();
    while (stack.length) {
      const path = stack.pop();
      const at = path.at(-1);
      if (at === goal) return path;
      if (seen.has(at)) continue;
      seen.add(at);
      for (const next of waitsFor.get(at) ?? []) stack.push([...path, next]);
    }
    return null;
  }

  async function loadHTML(url) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Failed to fetch HTML module ${url}: ${res.status}`);
    const doc = parse(await res.text(), url);
    return parseHTMLModule(doc, {
      url,
      window,
      importModule,
      scriptURL,
      interpret,
      load: (spec, ref) => loadFrom(url, spec, ref),
    });
  }

  function start(specifier, resolution, type) {
    const { url } = resolution;
    if (!cache.has(url)) {
      const kind = type ?? detectType(url, resolution);
      const promise = (async () => {
        if (kind === 'html') return loadHTML(url);
        return resolution.module ?? importModule(url);
      })();
      cache.set(url, promise);
      promise.then(
        () => onEvent({ type: 'load', specifier, url, kind, provider: resolution.provider }),
        (error) => {
          cache.delete(url);
          onEvent({ type: 'error', specifier, url, kind, error });
        },
      );
    }
    return cache.get(url);
  }

  /** Load a module that HTML module `importer` re-exports from. */
  async function loadFrom(importer, specifier, referrer) {
    const resolution = await resolve(specifier, referrer);
    const { url } = resolution;
    onEvent({ type: 'resolve', specifier, referrer, resolution });
    // Check, record and start synchronously so no other load can interleave.
    const cycle = waitPath(url, importer);
    if (cycle) throw new Error(`Circular HTML module re-export: ${[importer, ...cycle].join(' -> ')}`);
    if (!waitsFor.has(importer)) waitsFor.set(importer, new Set());
    waitsFor.get(importer).add(url);
    try {
      return await start(specifier, resolution);
    } finally {
      waitsFor.get(importer)?.delete(url);
      if (!waitsFor.get(importer)?.size) waitsFor.delete(importer);
    }
  }

  /**
   * Load a module namespace.
   * @param {string} specifier
   * @param {string} [referrer]
   * @param {{ type?: 'js'|'html' }} [options]
   */
  async function load(specifier, referrer, { type } = {}) {
    referrer ||= baseURL;
    const resolution = await resolve(specifier, referrer);
    onEvent({ type: 'resolve', specifier, referrer, resolution });
    return start(specifier, resolution, type);
  }

  return { load, resolve, cache };
}
