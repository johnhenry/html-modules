/**
 * The loader: specifier → Resolution → module namespace, for JS and HTML alike.
 *
 * Resolution order for bare specifiers:
 *   1. `importMap` (explicit pins / a compiled lock)
 *   2. `router`    (e.g. mportRouter → CDN racing)
 *   3. `hostResolve` (e.g. `import.meta.resolve`, which honors the page's import map)
 * Relative and absolute URLs resolve against the referrer.
 */
import { resolveImportMap, parseURLLikeSpecifier } from './import-map.js';
import { parseHTMLModule, defaultExportValue, dataScriptURL } from './html-module.js';
import { toRouter } from './routers/interface.js';

const HTML_EXT = /\.html?(?:[?#]|$)/i;

/**
 * @param {object} [options]
 * @param {import('./routers/interface.js').Router | Function} [options.router]
 * @param {{imports?: object, scopes?: object}} [options.importMap]
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
  router,
  importMap,
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
  const routerImpl = router ? toRouter(router) : null;
  /** @type {Map<string, Promise<object>>} */
  const cache = new Map();
  const parse = parseHTML ?? ((html) => {
    if (!window?.DOMParser) throw new TypeError('No DOMParser available; pass `parseHTML` to createLoader()');
    return new window.DOMParser().parseFromString(html, 'text/html');
  });

  async function resolve(specifier, referrer) {
    referrer ||= baseURL;
    const asURL = parseURLLikeSpecifier(specifier, referrer);
    if (asURL) return { url: asURL.href };
    if (importMap) {
      const url = resolveImportMap(importMap, specifier, { referrer, mapBaseURL: baseURL ?? referrer });
      if (url) return { url, provider: 'import-map' };
    }
    if (routerImpl) {
      const res = await routerImpl.resolve(specifier, { referrer });
      if (res?.url) return res;
    }
    const hosted = hostResolve?.(specifier);
    if (hosted) return { url: String(hosted) };
    throw new TypeError(`Unable to resolve bare specifier "${specifier}"${referrer ? ` from ${referrer}` : ''}`);
  }

  async function loadHTML(url, chain) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Failed to fetch HTML module ${url}: ${res.status}`);
    const doc = parse(await res.text(), url);
    return parseHTMLModule(doc, {
      url,
      window,
      importModule,
      scriptURL,
      interpret,
      load: (spec, ref) => load(spec, ref, { chain }),
    });
  }

  /**
   * Load a module namespace.
   * @param {string} specifier
   * @param {string} [referrer]
   * @param {{ type?: 'js'|'html', chain?: string[] }} [options]
   */
  async function load(specifier, referrer, { type, chain = [] } = {}) {
    referrer ||= baseURL;
    const resolution = await resolve(specifier, referrer);
    const { url } = resolution;
    onEvent({ type: 'resolve', specifier, referrer, resolution });
    if (chain.includes(url)) {
      throw new Error(`Circular HTML module re-export: ${[...chain, url].join(' -> ')}`);
    }
    if (!cache.has(url)) {
      const kind = type ?? detectType(url, resolution);
      const promise = (async () => {
        if (kind === 'html') return loadHTML(url, [...chain, url]);
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

  return { load, resolve, cache, router: routerImpl, importMap };
}
