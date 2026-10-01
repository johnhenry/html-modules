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
export async function verifyIntegrity(bytes, integrity, url, win = globalThis, source = 'integrity=') {
  const tokens = parseIntegrity(integrity, ` for ${url}`);
  const subtle = win?.crypto?.subtle ?? globalThis.crypto?.subtle;
  if (!subtle) throw new TypeError(`Cannot verify the integrity of ${url}: this environment has no crypto.subtle (SubtleCrypto needs a secure context: https or localhost)`);
  const strongest = Math.max(...tokens.map((t) => STRENGTH[t.algorithm]));
  const candidates = tokens.filter((t) => STRENGTH[t.algorithm] === strongest);
  const algorithm = candidates[0].algorithm;
  const digest = toBase64(new Uint8Array(await subtle.digest(SUBTLE_NAME[algorithm], bytes)));
  if (!candidates.some((t) => normalizeBase64(t.hash) === normalizeBase64(digest))) {
    throw new Error(`Integrity check failed for HTML module ${url}: its ${algorithm} digest is ${algorithm}-${digest}, which matches none of ${source === 'integrity=' ? `integrity="${integrity}"` : `${source} "${integrity}"`}`);
  }
}

const tokenSet = (value, where) => new Set(parseIntegrity(value, where).map((t) => `${t.algorithm}-${normalizeBase64(t.hash)}`));

/**
 * The `integrity` entries of the page's inline `<script type="importmap">` elements, as absolute URL → metadata (the
 * first entry for a URL wins, as when the browser merges import maps). Keys are URL-like specifiers resolved against
 * `base`. A map that is not valid JSON is skipped (the browser ignores it too).
 * @returns {Map<string, string>}
 */
export function pageImportMapIntegrity(win = globalThis, base) {
  const out = new Map();
  const doc = win?.document;
  if (typeof doc?.querySelectorAll !== 'function') return out;
  for (const script of doc.querySelectorAll('script[type="importmap"]')) {
    let map;
    try {
      map = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    if (!map?.integrity || typeof map.integrity !== 'object') continue;
    for (const [key, value] of Object.entries(map.integrity)) {
      let url;
      try {
        url = withoutHash(new URL(key, base ?? doc.baseURI).href);
      } catch {
        continue;
      }
      if (!out.has(url) && typeof value === 'string') out.set(url, value);
    }
  }
  return out;
}

const withoutHash = (href) => href.replace(/#.*$/s, '');

/**
 * Normalize an integrity manifest (`{ [url]: "sha384-…" }`, the shape of an import map's `integrity` object) into a
 * Map of absolute URL → metadata. Keys resolve against `base`; every value must be valid SRI metadata.
 * @returns {Map<string, string>}
 */
function readManifest(manifest, base) {
  if (manifest === undefined) return new Map();
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest) || manifest instanceof Map) {
    throw new TypeError('Invalid integrity manifest in createLoader(): pass an object of URL → Subresource Integrity metadata, as in an import map\'s "integrity" ({ "https://example.com/ui.html": "sha384-<base64 digest>" })');
  }
  const out = new Map();
  for (const [key, value] of Object.entries(manifest)) {
    let url;
    try {
      url = withoutHash(new URL(key, base).href);
    } catch {
      throw new TypeError(`Invalid integrity manifest in createLoader(): the key ${JSON.stringify(key)} is not a URL${base ? '' : ' (and there is no baseURL to resolve it against)'}`);
    }
    parseIntegrity(value, ` in the integrity manifest entry for ${key}`);
    out.set(url, value.trim().split(/\s+/).join(' '));
  }
  return out;
}

const sanitizerIds = new WeakMap(); // sanitizer function → a number that tells cache entries apart
let sanitizerCount = 0;
const sanitizerId = (fn) => {
  if (!sanitizerIds.has(fn)) sanitizerIds.set(fn, ++sanitizerCount);
  return sanitizerIds.get(fn);
};

/**
 * The loader's cache key: `html:<url>` / `js:<url>`, plus `#integrity=<metadata>` for a verified load and
 * `#sanitize=<n>` for a sanitized one (a copy that was not sanitized, or was sanitized by another function, must not
 * satisfy it).
 */
const cacheKey = (kind, url, integrity, sanitize) => `${kind}:${url}${integrity ? `#integrity=${integrity.trim().split(/\s+/).join(' ')}` : ''}${sanitize ? `#sanitize=${sanitizerId(sanitize)}` : ''}`;

function checkSanitize(value, where) {
  if (value !== undefined && value !== false && typeof value !== 'function') {
    throw new TypeError(`Invalid sanitize${where}: pass a function (html, { def, url, window }) => string | DocumentFragment | TrustedHTML (it may return a Promise), or false for none`);
  }
}

const isFragment = (v) => v != null && typeof v === 'object' && v.nodeType === 11;

/**
 * Run a sanitizer over every component template of a freshly read record, returning a record whose templates are
 * the sanitized ones (a string, or a DocumentFragment that is stamped without being parsed again). Only templates
 * are touched: the module source itself is never sanitized (that would remove its `<html-export>` and
 * `<html-import>`), and stylesheets and data are not markup. A sanitizer that throws or returns something else
 * fails the whole load: nothing is registered from a module whose templates could not be vetted.
 */
async function sanitizeRecord(record, sanitize, { url, win, onEvent }) {
  const announce = (name) => (details) => {
    const event = { type: 'sanitize', url, name, details };
    onEvent(event);
    try {
      const doc = win?.document;
      if (doc && typeof win.CustomEvent === 'function') doc.dispatchEvent(new win.CustomEvent('html-modules:sanitize', { detail: event }));
    } catch {}
  };
  const exports = await Promise.all(record.exports.map(async (e) => {
    if (e.kind !== 'component') return e;
    const where = `${e.name ? `component "${e.name}"` : 'the default component'} of ${url}`;
    let out = await sanitize(e.template, Object.freeze({ def: Object.freeze({ ...e }), url, window: win, report: announce(e.name) }));
    if (typeof out === 'object' && out !== null && !isFragment(out)) out = String(out); // TrustedHTML (the policy re-wraps it when the template is parsed)
    if (isFragment(out)) out = out.cloneNode(true);
    else if (typeof out !== 'string') throw new TypeError(`sanitize returned ${out === null ? 'null' : typeof out} for ${where}: return a string, a TrustedHTML or a DocumentFragment`);
    return { ...e, template: out };
  }));
  return { ...record, exports };
}

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
 * @param {Record<string, string>} [options.integrity]   an integrity manifest: module URL → Subresource Integrity metadata (the shape of an import map's `integrity`), consulted for every fetch
 * @param {boolean} [options.strict]   refuse any HTML fetch that has no integrity metadata (neither a manifest entry nor an `integrity` attribute)
 * @param {import('./types.js').Sanitizer | false} [options.sanitize]   sanitizes every HTML component template this loader loads (the default for each load; `false`: none): see `Sanitizer`
 * @param {(html: string, url: string) => ParentNode} [options.parseHTML]  default: parses into a detached element (see `parseModuleSource`)
 * @param {(url: string) => Promise<object>} [options.importModule]      default: native import()
 * @param {any} [options.window]
 * @param {(event: { type: 'fetch'|'load'|'error'|'sanitize', url: string, kind?: string, error?: unknown, name?: string|null, details?: unknown }) => void} [options.onEvent]
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
  sanitize,
  integrity: manifestOption,
  strict = false,
  parseHTML,
  importModule = (url) => import(url),
  window: win = globalThis,
  onEvent = () => {},
} = {}) {
  checkFetchOptions({ credentials, mode }, ' in createLoader()');
  checkSanitize(sanitize, ' in createLoader()');
  if (typeof strict !== 'boolean') throw new TypeError(`Invalid strict in createLoader(): ${JSON.stringify(strict)}; use true or false`);
  /** The integrity manifest: absolute module URL → SRI metadata. */
  const pins = readManifest(manifestOption, baseURL);
  let defaultSanitize = sanitize || undefined;
  /** The sanitizer a load uses: its own option (false: none), else the loader's. */
  const sanitizerFor = (option) => (option === undefined ? defaultSanitize : option || undefined);
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

  async function loadDependency(importer, src, type, referrer = importer, integrity, sanitizer) {
    const url = resolve(src, referrer);
    const cycle = waitPath(url, importer);
    if (cycle) throw new Error(`Circular HTML module dependency: ${[importer, ...cycle].join(' -> ')}`);
    if (!waitsFor.has(importer)) waitsFor.set(importer, new Set());
    waitsFor.get(importer).add(url);
    try {
      // A dependency of a sanitized module is sanitized by the same function, and a JavaScript one is refused.
      return await start(url, type, { integrity, sanitize: sanitizer || false, inherited: Boolean(sanitizer) });
    } finally {
      waitsFor.get(importer)?.delete(url);
      if (!waitsFor.get(importer)?.size) waitsFor.delete(importer);
    }
  }

  async function loadHTML(url, { integrity, pinned, credentials: c = credentials, mode: m = mode, cache: httpCache, sanitize: sanitizer } = {}) {
    onEvent({ type: 'fetch', url });
    const init = { ...(c !== undefined && { credentials: c }), ...(m !== undefined && { mode: m }), ...(httpCache !== undefined && { cache: httpCache }) };
    const res = await (Object.keys(init).length ? fetchImpl(url, init) : fetchImpl(url));
    if (!res.ok) throw new Error(`Failed to fetch HTML module ${url}: ${res.status}`);
    let source;
    if (integrity || pinned) {
      if (typeof res.arrayBuffer !== 'function') throw new TypeError(`Cannot verify the integrity of ${url}: the response has no arrayBuffer() (the fetch option must return a Response)`);
      const bytes = await res.arrayBuffer();
      // Both are checked when both exist: an attribute cannot loosen what the manifest pins, nor the manifest what it says.
      if (pinned) await verifyIntegrity(bytes, pinned, url, win, 'the integrity manifest entry');
      if (integrity) await verifyIntegrity(bytes, integrity, url, win);
      source = new TextDecoder().decode(bytes);
    } else source = await res.text();
    let record = readHTMLModule(parse(source, url), url);
    if (sanitizer) record = await sanitizeRecord(record, sanitizer, { url, win, onEvent });
    // The module's <html-import-settings base> is resolved against the module's own URL.
    const referrer = record.importSettings?.base ? new URL(record.importSettings.base, url).href : url;
    const wanted = new Map();
    for (const i of record.imports) if (moduleImportOptions(record, i).load !== 'lazy') wanted.set(dependencyKey(i.src, i.type), [i.src, i.type, i.integrity]);
    for (const e of record.exports) if (e.kind === 'reexport') wanted.set(dependencyKey(e.src, e.type), [e.src, e.type, e.integrity]);
    const modules = new Map(await Promise.all([...wanted].map(async ([key, [src, type, sri]]) => [key, await loadDependency(url, src, type, referrer, sri, sanitizer)])));
    return linkHTMLModule(record, modules, { lazy: (src, type, sri) => () => loadDependency(url, src, type, referrer, sri, sanitizer) });
  }

  /**
   * A JavaScript module cannot be fetched and checked here: `import()` is the browser's. What can be checked is that the
   * page's import map pins the same bytes, because the browser enforces an import map's `integrity` for `import()`.
   */
  function checkImportMapPin(url, wanted, source) {
    const entry = pageImportMapIntegrity(win, baseURL).get(withoutHash(url));
    const fix = `Add the module to the page's import map before any module script runs: <script type="importmap">{ "integrity": { "${url}": "${wanted}" } }</script>. @johnhenry/mport generates these entries: router.build(specifiers, { graph: true }) puts every file's hash in the map's "integrity"`;
    if (entry === undefined) {
      throw new Error(`Cannot verify the JavaScript module ${url} (${source}="${wanted}"): the page's import map has no "integrity" entry for it, and import() is the browser's, not html-modules'. ${fix}`);
    }
    let same;
    try {
      const have = tokenSet(entry, ` in the import map's integrity entry for ${url}`);
      const want = tokenSet(wanted, ` for ${url}`);
      same = have.size === want.size && [...want].every((t) => have.has(t));
    } catch (error) {
      throw new Error(`Cannot verify the JavaScript module ${url}: the page's import map has an unusable "integrity" entry for it (${error.message})`, { cause: error });
    }
    if (!same) {
      throw new Error(`Cannot verify the JavaScript module ${url}: the page's import map pins it as "${entry}", which is not ${source}="${wanted}". The two must name the same digests; ${fix}`);
    }
  }

  function start(url, type, options = {}) {
    const kind = type ?? (HTML_EXT.test(url) ? 'html' : 'js');
    const { integrity } = options;
    const sanitizer = kind === 'html' ? sanitizerFor(options.sanitize) : undefined;
    if (kind === 'js' && options.inherited) {
      throw new Error(`Refusing to import the JavaScript module ${url} from a sanitized HTML module: import() runs it with the page's authority, and a sanitizer only vets templates. Remove that <html-import>, or import the module from the page`);
    }
    if (integrity !== undefined) parseIntegrity(integrity, ` for ${url}`);
    const pinned = pins.get(withoutHash(url));
    if (kind === 'html' && strict && !integrity && !pinned) {
      throw new Error(`Refusing to fetch the HTML module ${url}: strict mode is on and it has no integrity metadata (add it to the integrity manifest, or give the import an integrity attribute)`);
    }
    // Keyed by kind and URL (the same URL loaded as HTML and as JavaScript are two modules), and a load with
    // integrity is cached apart from one without: an unverified copy must not satisfy it.
    const key = cacheKey(kind, url, integrity, sanitizer);
    if (!cache.has(key)) {
      const promise = kind === 'html'
        ? loadHTML(url, { ...options, pinned, sanitize: sanitizer })
        : Promise.resolve().then(() => {
          if (integrity) checkImportMapPin(url, integrity, 'integrity');
          if (pinned) checkImportMapPin(url, pinned, 'the integrity manifest entry');
          return importModule(url);
        });
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
   * @param {{ type?: 'html'|'js', integrity?: string, credentials?: string, mode?: string, cache?: RequestCache, sanitize?: import('./types.js').Sanitizer | false }} [options]
   *        `integrity` (SRI, HTML modules only), `credentials`, `mode` and `cache` (the fetch's HTTP cache mode) apply to this fetch; the
   *        module's own dependencies use the loader's defaults. `sanitize` (a function, or `false` for none) overrides the
   *        loader's sanitizer for this module and the HTML modules it imports; the result is cached apart from a load
   *        without it.
   */
  async function load(specifier, referrer, { type, integrity, credentials: c, mode: m, cache: httpCache, sanitize: s } = {}) {
    checkFetchOptions({ integrity, credentials: c, mode: m, cache: httpCache }, ' in load()');
    checkSanitize(s, ' in load()');
    return start(resolve(specifier, referrer || baseURL), type, { integrity, credentials: c, mode: m, cache: httpCache, sanitize: s });
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
      if (kinds.some((kind) => key === cacheKey(kind, url) || key.startsWith(`${cacheKey(kind, url)}#integrity=`) || key.startsWith(`${cacheKey(kind, url)}#sanitize=`))) evicted = cache.delete(key) || evicted;
    }
    return evicted;
  }

  /**
   * Fetch an HTML module again, bypassing the HTTP cache, and replace its cache entry: the loader half of a hot
   * reload. Resolves to `{ previous, next }` namespaces (`previous` is undefined when the module was not loaded; the
   * module is then simply loaded). When the new load fails the old entry is put back and the error is thrown.
   * @param {string} specifier
   * @param {string} [referrer]
   * @param {{ sanitize?: import('./types.js').Sanitizer | false }} [options]  the sanitizer the loaded copy used (default: the loader's)
   * @returns {Promise<{ previous: object|undefined, next: object }>}
   */
  async function reload(specifier, referrer, { sanitize: s } = {}) {
    const url = resolve(specifier, referrer || baseURL);
    const sanitizer = sanitizerFor(s);
    const key = cacheKey('html', url, undefined, sanitizer);
    const held = cache.get(key);
    let previous;
    if (held) previous = await held.catch(() => undefined);
    cache.delete(key);
    try {
      return { previous, next: await start(url, 'html', { cache: 'no-cache', sanitize: s }) };
    } catch (error) {
      if (held && previous) cache.set(key, held);
      throw error;
    }
  }

  /** True when `specifier` is cached as an HTML module (loaded with `sanitize`, default: the loader's). */
  function cached(specifier, referrer, { sanitize: s } = {}) {
    return cache.has(cacheKey('html', resolve(specifier, referrer || baseURL), undefined, sanitizerFor(s)));
  }

  return {
    load, unload, reload, cached, resolve, cache, baseURL,
    /** The integrity manifest in effect: absolute URL → SRI metadata (a copy). */
    get integrity() {
      return Object.fromEntries(pins);
    },
    /** True when an HTML fetch without integrity metadata is refused. */
    strict,
    /** The sanitizer applied to component templates by default (undefined: none). Loads already cached are unchanged. */
    get sanitize() {
      return defaultSanitize;
    },
    set sanitize(value) {
      checkSanitize(value, ' (sanitize)');
      defaultSanitize = value || undefined;
    },
  };
}
