/**
 * The loader: resolve → fetch → parse → discover exports → create definitions.
 *
 * - HTML modules (".html"/".htm", or `type: "html"`) are fetched, parsed with
 *   DOMParser, read into a module record and linked into a namespace of HTML
 *   Component Definitions.
 * - Anything else is a JavaScript module, loaded with native `import()`.
 * - Every module is cached by resolved URL as a Promise, so concurrent and
 *   repeated imports share one fetch and one parse (PRD §16). Failed loads are
 *   evicted so they can be retried.
 * - Relative URLs resolve against the importing document or module. Bare
 *   specifiers go to `hostResolve` (in browsers, `import.meta.resolve`, which
 *   applies the page's own import map). No other routing happens here.
 */
import { readHTMLModule } from './record.js';
import {
  defineHTMLComponent, defineHTMLStylesheet, lookupExport, manifest,
} from './runtime.js';
import { camelCase } from './names.js';

const HTML_EXT = /\.html?(?:[?#]|$)/i;
const URL_LIKE = /^(?:\.{0,2}\/)/;

/**
 * Build a module namespace from a record and its loaded dependencies. The
 * shape matches a compiled module: camelCase named exports, `default`, and a
 * `components` manifest keyed by export name.
 * @param {import('./record.js').ModuleRecord} record
 * @param {Map<string, object>} modules src (as written) → loaded namespace
 */
export function linkHTMLModule(record, modules) {
  const { url } = record;
  const imports = record.imports.map((i) => ({ module: modules.get(i.src), from: i.src, ...(i.as && { as: i.as }), bindings: i.bindings }));
  const named = new Map();
  const manifestLocals = {};
  const stars = [];
  let hasDefault = false;
  let defaultValue;
  for (const e of record.exports) {
    let value;
    switch (e.kind) {
      case 'component':
        value = defineHTMLComponent({ name: e.name, template: e.template, shadow: e.shadow, delegatesFocus: e.delegatesFocus, styles: e.styles, imports, url });
        break;
      case 'stylesheet':
        value = defineHTMLStylesheet({ name: e.name, css: e.css, url });
        break;
      case 'data':
        value = e.value;
        break;
      case 'reexport':
        if (!e.name) {
          stars.push([modules.get(e.src), e.src]);
          continue;
        }
        value = lookupExport(modules.get(e.src), e.import ?? e.name, e.src);
        break;
    }
    if (e.name) {
      named.set(camelCase(e.name), value);
      manifestLocals[e.name] = value;
    }
    if (e.default) {
      hasDefault = true;
      defaultValue = value;
    }
  }
  // Star re-exports follow ESM `export *`: local names win, `default` is never
  // re-exported, and a name two sources disagree on is left out.
  const starred = new Map();
  const ambiguous = new Set();
  for (const [ns] of stars) {
    for (const key of Object.keys(ns)) {
      if (key === 'default' || key === 'components' || named.has(key)) continue;
      if (starred.has(key) && starred.get(key) !== ns[key]) ambiguous.add(key);
      else starred.set(key, ns[key]);
    }
  }
  const entries = [...named];
  for (const [key, value] of starred) if (!ambiguous.has(key)) entries.push([key, value]);
  entries.push(['components', manifest(manifestLocals, stars)]);
  if (hasDefault) entries.push(['default', defaultValue]);
  return createNamespace(entries);
}

/** A module-namespace-like object: null prototype, sorted keys, frozen, tagged "Module". */
export function createNamespace(entries) {
  const ns = Object.create(null);
  for (const [name, value] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    Object.defineProperty(ns, name, { value, enumerable: true, writable: false, configurable: false });
  }
  Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' });
  return Object.freeze(ns);
}

/**
 * @param {object} [options]
 * @param {string} [options.baseURL]  referrer for top-level loads (default: the document's base URL)
 * @param {(specifier: string) => string|URL|null|undefined} [options.hostResolve]  bare specifiers
 * @param {typeof fetch} [options.fetch]
 * @param {(html: string, url: string) => Document} [options.parseHTML]  default: the window's DOMParser
 * @param {(url: string) => Promise<object>} [options.importModule]      default: native import()
 * @param {any} [options.window]
 * @param {(event: { type: 'fetch'|'load'|'error', url: string, kind?: string, error?: unknown }) => void} [options.onEvent]
 */
export function createLoader({
  baseURL = globalThis.document?.baseURI ?? globalThis.location?.href,
  hostResolve,
  fetch: fetchImpl = (...a) => globalThis.fetch(...a),
  parseHTML,
  importModule = (url) => import(url),
  window: win = globalThis,
  onEvent = () => {},
} = {}) {
  /** @type {Map<string, Promise<object>>} */
  const cache = new Map();
  const parse = parseHTML ?? ((html) => {
    if (!win?.DOMParser) throw new TypeError('No DOMParser available; pass `parseHTML` to createLoader()');
    return new win.DOMParser().parseFromString(html, 'text/html');
  });

  /** Resolve a specifier to an absolute URL string. */
  function resolve(specifier, referrer = baseURL) {
    if (URL_LIKE.test(specifier)) {
      if (!referrer) throw new TypeError(`Cannot resolve "${specifier}" without a base URL`);
      return new URL(specifier, referrer).href;
    }
    try {
      return new URL(specifier).href;
    } catch {}
    const hosted = hostResolve?.(specifier);
    if (hosted) return String(hosted);
    throw new TypeError(`Unable to resolve bare specifier "${specifier}"${referrer ? ` from ${referrer}` : ''}`);
  }

  // Dependency wait graph: module URL → URLs it is waiting for. A module's
  // namespace needs its dependencies first, so an edge that closes a loop
  // would deadlock; this catches cycles whether loads are sequential or
  // concurrent (where a cached in-flight promise hides the loop).
  const waitsFor = new Map();
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

  async function loadDependency(importer, src, type) {
    const url = resolve(src, importer);
    const cycle = waitPath(url, importer);
    if (cycle) throw new Error(`Circular HTML module dependency: ${[importer, ...cycle].join(' -> ')}`);
    if (!waitsFor.has(importer)) waitsFor.set(importer, new Set());
    waitsFor.get(importer).add(url);
    try {
      return await start(url, type);
    } finally {
      waitsFor.get(importer)?.delete(url);
      if (!waitsFor.get(importer)?.size) waitsFor.delete(importer);
    }
  }

  async function loadHTML(url) {
    onEvent({ type: 'fetch', url });
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Failed to fetch HTML module ${url}: ${res.status}`);
    const record = readHTMLModule(parse(await res.text(), url), url);
    const wanted = new Map();
    for (const i of record.imports) wanted.set(i.src, i.type);
    for (const e of record.exports) if (e.kind === 'reexport' && !wanted.has(e.src)) wanted.set(e.src, undefined);
    const modules = new Map(await Promise.all([...wanted].map(async ([src, type]) => [src, await loadDependency(url, src, type)])));
    return linkHTMLModule(record, modules);
  }

  function start(url, type) {
    if (!cache.has(url)) {
      const kind = type ?? (HTML_EXT.test(url) ? 'html' : 'js');
      const promise = kind === 'html' ? loadHTML(url) : Promise.resolve().then(() => importModule(url));
      cache.set(url, promise);
      promise.then(
        () => onEvent({ type: 'load', url, kind }),
        (error) => {
          if (cache.get(url) === promise) cache.delete(url);
          onEvent({ type: 'error', url, kind, error });
        },
      );
    }
    return cache.get(url);
  }

  /**
   * Load a module namespace (HTML or JS), cached by resolved URL.
   * @param {string} specifier
   * @param {string} [referrer]
   * @param {{ type?: 'html'|'js' }} [options]
   */
  async function load(specifier, referrer, { type } = {}) {
    return start(resolve(specifier, referrer || baseURL), type);
  }

  return { load, resolve, cache };
}
