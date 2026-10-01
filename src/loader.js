/**
 * The loader: resolve → fetch → parse → discover exports → create definitions.
 *
 * - HTML modules (".html"/".htm", or `type: "html"`) are fetched, parsed with
 *   DOMParser, read into a module record and linked into a namespace of HTML
 *   Component Definitions.
 * - Anything else is a JavaScript module, loaded with native `import()`.
 * - Every module is cached by kind and resolved URL as a Promise, so concurrent and
 *   repeated imports share one fetch and one parse (PRD §16). Failed loads are
 *   evicted so they can be retried.
 * - Relative URLs resolve against the importing document or module. Bare
 *   specifiers go to `hostResolve` (in browsers, `import.meta.resolve`, which
 *   applies the page's own import map). No other routing happens here.
 */
import { moduleImportOptions, readHTMLModule } from './record.js';
import {
  defineHTMLComponent, defineHTMLStylesheet, lookupExport, manifest, namespaceComponents,
} from './runtime.js';
import { camelCase } from './names.js';
import { checkFetchOptions, parseIntegrity } from './settings.js';
import { configureWindow, trustedHTML } from './policy.js';

const STRENGTH = { sha256: 0, sha384: 1, sha512: 2 };
const SUBTLE_NAME = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };
const toBase64 = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const normalizeBase64 = (b64) => b64.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');

/**
 * Check fetched bytes against Subresource Integrity metadata with SubtleCrypto, as the platform does for
 * `<script integrity>`: of the algorithms listed, the strongest one decides, and any of its digests may match.
 * Fails closed: without `crypto.subtle` the load is refused rather than trusted.
 * @returns {Promise<void>} rejects with an Error naming `url` when the digest does not match
 */
export async function verifyIntegrity(bytes, integrity, url, win = globalThis) {
  const tokens = parseIntegrity(integrity, ` for ${url}`);
  const subtle = win?.crypto?.subtle ?? globalThis.crypto?.subtle;
  if (!subtle) throw new TypeError(`Cannot verify the integrity of ${url}: this environment has no crypto.subtle (SubtleCrypto needs a secure context: https or localhost)`);
  const strongest = Math.max(...tokens.map((t) => STRENGTH[t.algorithm]));
  const candidates = tokens.filter((t) => STRENGTH[t.algorithm] === strongest);
  const algorithm = candidates[0].algorithm;
  const digest = toBase64(new Uint8Array(await subtle.digest(SUBTLE_NAME[algorithm], bytes)));
  if (!candidates.some((t) => normalizeBase64(t.hash) === normalizeBase64(digest))) {
    throw new Error(`Integrity check failed for HTML module ${url}: its ${algorithm} digest is ${algorithm}-${digest}, which matches none of integrity="${integrity}"`);
  }
}

/** The loader's cache key: `html:<url>` / `js:<url>`, plus `#integrity=<metadata>` for a verified load. */
const cacheKey = (kind, url, integrity) => `${kind}:${url}${integrity ? `#integrity=${integrity.trim().split(/\s+/).join(' ')}` : ''}`;

const HTML_EXT = /\.html?(?:[?#]|$)/i;
const URL_LIKE = /^(?:\.{0,2}\/)/;

/** The key of a dependency in the `modules` map `linkHTMLModule()` takes: its `src`, or `type:src` when it has a `type`. */
const dependencyKey = (src, type) => (type ? `${type}:${src}` : src);

/**
 * Build a module namespace from a record and its loaded dependencies. The
 * shape matches a compiled module: camelCase named exports, `default`, and a
 * `components` manifest keyed by export name.
 * Each import carries the options it is bound with (its attributes, then the
 * module's <html-import-settings>). A lazy import that was not loaded gets a
 * `lazy` loader from `options.lazy(src, type)` instead of a `module`.
 * @param {import('./record.js').ModuleRecord} record
 * @param {Map<string, object>} modules src (as written, or `type:src` for a dependency with a `type`) → loaded namespace
 * @param {{ lazy?: (src: string, type?: string, integrity?: string) => () => Promise<object> }} [options]
 * @returns {import('./types.js').ModuleNamespace}
 */
export function linkHTMLModule(record, modules, { lazy } = {}) {
  const { url } = record;
  const dependency = (src, type) => (modules.has(dependencyKey(src, type)) ? modules.get(dependencyKey(src, type)) : modules.get(src));
  const imports = record.imports.map((i) => {
    const entry = { module: dependency(i.src, i.type), from: i.src, ...(i.as && { as: i.as }), ...moduleImportOptions(record, i), bindings: i.bindings };
    if (entry.module === undefined && entry.load === 'lazy' && lazy) entry.lazy = lazy(i.src, i.type, i.integrity);
    return entry;
  });
  const named = new Map();
  const manifestLocals = {};
  const stars = [];
  let hasDefault = false;
  let defaultValue;
  for (const e of record.exports) {
    let value;
    switch (e.kind) {
      case 'component':
        value = defineHTMLComponent({ name: e.name, template: e.template, shadow: e.shadow, delegatesFocus: e.delegatesFocus, styles: e.styles, ...(e.props && { props: e.props }), ...(e.formAssociated && { formAssociated: true, ...(e.formControl && { formControl: e.formControl }), ...(e.formRole && { formRole: e.formRole }) }), imports, url });
        break;
      case 'stylesheet':
        value = defineHTMLStylesheet({ name: e.name, css: e.css, url });
        break;
      case 'data':
        value = e.value;
        break;
      case 'reexport':
        if (!('name' in e)) {
          stars.push([dependency(e.src, e.type), e.src]);
          continue;
        }
        value = e.import === '*' ? dependency(e.src, e.type) : lookupExport(dependency(e.src, e.type), e.import ?? e.name ?? 'default', e.src);
        break;
    }
    if (e.name) {
      named.set(camelCase(e.name), value);
      manifestLocals[e.name] = value;
      if (e.import === '*') Object.assign(manifestLocals, namespaceComponents(e.name, value));
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

/**
 * A module-namespace-like object: null prototype, sorted keys, frozen, tagged "Module".
 * @param {Iterable<[string, unknown]>} entries
 * @returns {import('./types.js').ModuleNamespace}
 */
export function createNamespace(entries) {
  const ns = Object.create(null);
  for (const [name, value] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    Object.defineProperty(ns, name, { value, enumerable: true, writable: false, configurable: false });
  }
  Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' });
  return Object.freeze(ns);
}

const factories = new WeakMap(); // window → a function making a parse container, or null for a window that parses whole documents

// Only a browser's own DOMParser: another DOM implementation (linkedom, jsdom) has no CSP to satisfy, and not all of
// them can query a detached element (linkedom cannot, for one that holds a <title>).
const isNative = (f) => typeof f === 'function' && /\[native code\]/.test(Function.prototype.toString.call(f));

// How <noscript> parses depends on a scripting flag that engines take from different places (Firefox parses its
// content as text in a fragment, as in a scripting-enabled page, wherever the container came from), and a module that
// has one is parsed as a document, which is always scripting-less. Matching the source text, comments and all, only
// ever errs towards the whole-document parse.
const NOSCRIPT = /<noscript[\s/>]/i;

function containerFactory(win, trusted) {
  if (!isNative(win?.DOMParser)) return null;
  const doc = new win.DOMParser().parseFromString(trusted(''), 'text/html');
  return () => doc.createElement('body');
}

/**
 * Parse module source without a document tree the engine CSP-checks, returning a container whose descendants are
 * the module's elements. A `DOMParser` document is such a tree: Chromium evaluates the page's `style-src` for every
 * `<style>` inserted into a *connected* tree, logging a `style-src-elem` violation (and sending a report) per
 * element though nothing is applied. The container here is a detached `<body>` created by an (empty) `DOMParser`
 * document, so it never is connected, and `innerHTML` runs the fragment parse with `<body>` as the context: the
 * insertion mode a document parse is in after `<body>` (`<html>`/`<head>`/`<body>` tags are ignored, `<style>`,
 * `<title>` and `<link>` keep their head behaviour). The factory is a `DOMParser` document, not
 * `document.implementation.createHTMLDocument()`, because the scripting flag decides how `<noscript>` parses and
 * only a `DOMParser` document is scripting-less in every engine (Firefox treats a `createHTMLDocument()` document
 * as scripting-enabled, so `<noscript>` content became text there, and in a fragment parse it does in Firefox whatever the
 * container's document, so source that mentions `<noscript>` is parsed as a whole document). Anything else (another DOM implementation, or no
 * `DOMParser`) gets a whole document from `DOMParser`; with none it is a TypeError.
 * @param {string} html
 * @param {any} [win]
 * @returns {ParentNode}
 */
export function parseModuleSource(html, win = globalThis) {
  if (!factories.has(win)) factories.set(win, containerFactory(win, (s) => trustedHTML(s, win)));
  const make = factories.get(win);
  if (make && !NOSCRIPT.test(html)) {
    const body = make();
    body.innerHTML = trustedHTML(html, win);
    return body;
  }
  if (!win?.DOMParser) throw new TypeError('No DOMParser available; pass `parseHTML` to createLoader()');
  return new win.DOMParser().parseFromString(trustedHTML(html, win), 'text/html');
}

/**
 * @param {object} [options]
 * @param {string} [options.baseURL]  referrer for top-level loads (default: the document's base URL)
 * @param {(specifier: string) => string|URL|null|undefined} [options.hostResolve]  bare specifiers
 * @param {typeof fetch} [options.fetch]
 * @param {'omit'|'same-origin'|'include'} [options.credentials]  fetch `credentials` for HTML modules (default: the platform's)
 * @param {'cors'|'same-origin'|'no-cors'} [options.mode]          fetch `mode` for HTML modules (default: the platform's)
 * @param {{ createHTML(html: string): unknown } | false} [options.trustedTypes]  Trusted Types policy for the HTML parsed and stamped in `window` (default: a policy named "html-modules" where `window.trustedTypes` exists; `false`: never)
 * @param {string} [options.nonce]   CSP nonce for the `<style>` elements used where constructable stylesheets are unavailable
 * @param {(html: string, url: string) => ParentNode} [options.parseHTML]  default: parses into a detached element (see `parseModuleSource`)
 * @param {(url: string) => Promise<object>} [options.importModule]      default: native import()
 * @param {any} [options.window]
 * @param {(event: { type: 'fetch'|'load'|'error', url: string, kind?: string, error?: unknown }) => void} [options.onEvent]
 * @returns {import('./types.js').Loader}
 */
export function createLoader({
  baseURL = globalThis.document?.baseURI ?? globalThis.location?.href,
  hostResolve,
  fetch: fetchImpl = (...a) => globalThis.fetch(...a),
  credentials,
  mode,
  trustedTypes,
  nonce,
  parseHTML,
  importModule = (url) => import(url),
  window: win = globalThis,
  onEvent = () => {},
} = {}) {
  checkFetchOptions({ credentials, mode }, ' in createLoader()');
  if (trustedTypes !== undefined || nonce !== undefined) configureWindow(win, { trustedTypes, nonce });
  /** @type {Map<string, Promise<object>>} */
  const cache = new Map();
  const parse = parseHTML ?? ((html) => parseModuleSource(html, win));

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

  async function loadDependency(importer, src, type, referrer = importer, integrity) {
    const url = resolve(src, referrer);
    const cycle = waitPath(url, importer);
    if (cycle) throw new Error(`Circular HTML module dependency: ${[importer, ...cycle].join(' -> ')}`);
    if (!waitsFor.has(importer)) waitsFor.set(importer, new Set());
    waitsFor.get(importer).add(url);
    try {
      return await start(url, type, { integrity });
    } finally {
      waitsFor.get(importer)?.delete(url);
      if (!waitsFor.get(importer)?.size) waitsFor.delete(importer);
    }
  }

  async function loadHTML(url, { integrity, credentials: c = credentials, mode: m = mode, cache: httpCache } = {}) {
    onEvent({ type: 'fetch', url });
    const init = { ...(c !== undefined && { credentials: c }), ...(m !== undefined && { mode: m }), ...(httpCache !== undefined && { cache: httpCache }) };
    const res = await (Object.keys(init).length ? fetchImpl(url, init) : fetchImpl(url));
    if (!res.ok) throw new Error(`Failed to fetch HTML module ${url}: ${res.status}`);
    let source;
    if (integrity) {
      if (typeof res.arrayBuffer !== 'function') throw new TypeError(`Cannot verify the integrity of ${url}: the response has no arrayBuffer() (the fetch option must return a Response)`);
      const bytes = await res.arrayBuffer();
      await verifyIntegrity(bytes, integrity, url, win);
      source = new TextDecoder().decode(bytes);
    } else source = await res.text();
    const record = readHTMLModule(parse(source, url), url);
    // The module's <html-import-settings base> is resolved against the module's own URL.
    const referrer = record.importSettings?.base ? new URL(record.importSettings.base, url).href : url;
    const wanted = new Map();
    for (const i of record.imports) if (moduleImportOptions(record, i).load !== 'lazy') wanted.set(dependencyKey(i.src, i.type), [i.src, i.type, i.integrity]);
    for (const e of record.exports) if (e.kind === 'reexport') wanted.set(dependencyKey(e.src, e.type), [e.src, e.type, e.integrity]);
    const modules = new Map(await Promise.all([...wanted].map(async ([key, [src, type, sri]]) => [key, await loadDependency(url, src, type, referrer, sri)])));
    return linkHTMLModule(record, modules, { lazy: (src, type, sri) => () => loadDependency(url, src, type, referrer, sri) });
  }

  function start(url, type, options = {}) {
    const kind = type ?? (HTML_EXT.test(url) ? 'html' : 'js');
    const { integrity } = options;
    if (integrity !== undefined) {
      parseIntegrity(integrity, ` for ${url}`);
      if (kind !== 'html') throw new TypeError(`integrity applies to HTML modules only: ${url} is loaded with import(), which cannot verify it (to pin a JavaScript module, use the "integrity" field of an import map)`);
    }
    // Keyed by kind and URL (the same URL loaded as HTML and as JavaScript are two modules), and a load with
    // integrity is cached apart from one without: an unverified copy must not satisfy it.
    const key = cacheKey(kind, url, integrity);
    if (!cache.has(key)) {
      const promise = kind === 'html' ? loadHTML(url, options) : Promise.resolve().then(() => importModule(url));
      cache.set(key, promise);
      promise.then(
        () => onEvent({ type: 'load', url, kind }),
        (error) => {
          if (cache.get(key) === promise) cache.delete(key);
          onEvent({ type: 'error', url, kind, error });
        },
      );
    }
    return cache.get(key);
  }

  /**
   * Load a module namespace (HTML or JS), cached by resolved URL.
   * @param {string} specifier
   * @param {string} [referrer]
   * @param {{ type?: 'html'|'js', integrity?: string, credentials?: string, mode?: string, cache?: RequestCache }} [options]
   *        `integrity` (SRI, HTML modules only), `credentials`, `mode` and `cache` (the fetch's HTTP cache mode) apply to this fetch; the
   *        module's own dependencies use the loader's defaults.
   */
  async function load(specifier, referrer, { type, integrity, credentials: c, mode: m, cache: httpCache } = {}) {
    checkFetchOptions({ integrity, credentials: c, mode: m, cache: httpCache }, ' in load()');
    return start(resolve(specifier, referrer || baseURL), type, { integrity, credentials: c, mode: m, cache: httpCache });
  }

  /**
   * Evict a module from the cache so the next load fetches (or imports) it again. Without `type`, every kind
   * of that URL goes; returns whether anything was evicted. Nothing else changes: namespaces already
   * loaded stay as they are, registered tags stay registered, and a JavaScript module stays in the
   * browser's own module map (only html-modules' cache entry goes).
   * @param {string} specifier
   * @param {string} [referrer]
   * @param {{ type?: 'html'|'js' }} [options]
   * @returns {boolean}
   */
  function unload(specifier, referrer, { type } = {}) {
    const url = resolve(specifier, referrer || baseURL);
    const kinds = type ? [type] : ['html', 'js'];
    let evicted = false;
    for (const key of [...cache.keys()]) {
      if (kinds.some((kind) => key === cacheKey(kind, url) || key.startsWith(`${cacheKey(kind, url)}#integrity=`))) evicted = cache.delete(key) || evicted;
    }
    return evicted;
  }

  /**
   * Fetch an HTML module again, bypassing the HTTP cache, and replace its cache entry: the loader half of a hot
   * reload. Resolves to `{ previous, next }` namespaces (`previous` is undefined when the module was not loaded; the
   * module is then simply loaded). When the new load fails the old entry is put back and the error is thrown.
   * @param {string} specifier
   * @param {string} [referrer]
   * @returns {Promise<{ previous: object|undefined, next: object }>}
   */
  async function reload(specifier, referrer) {
    const url = resolve(specifier, referrer || baseURL);
    const key = cacheKey('html', url);
    const held = cache.get(key);
    let previous;
    if (held) previous = await held.catch(() => undefined);
    cache.delete(key);
    try {
      return { previous, next: await start(url, 'html', { cache: 'no-cache' }) };
    } catch (error) {
      if (held && previous) cache.set(key, held);
      throw error;
    }
  }

  return { load, unload, reload, resolve, cache, baseURL };
}
