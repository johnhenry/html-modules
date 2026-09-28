/**
 * Import maps: the native, compiled representation of routing decisions.
 *
 * - resolveImportMap(): resolve a specifier against an import map the way a
 *   browser does (exact + trailing-slash prefix matches, scopes).
 * - compileImportMap(): ask a router to resolve a list of specifiers ahead of
 *   time and emit a standard import map plus an mport-format lockfile.
 */

import { toRouter } from './routers/interface.js';

const isRelative = (s) => s.startsWith('/') || s.startsWith('./') || s.startsWith('../');

/**
 * Parse a URL-like specifier. Returns null for bare specifiers.
 * @param {string} specifier
 * @param {string} [baseURL]
 * @returns {URL|null}
 */
export function parseURLLikeSpecifier(specifier, baseURL) {
  if (isRelative(specifier)) {
    if (!baseURL) throw new TypeError(`Cannot resolve relative specifier "${specifier}" without a base URL`);
    return new URL(specifier, baseURL);
  }
  try {
    return new URL(specifier);
  } catch {
    return null;
  }
}

function normalizeKey(key, mapBaseURL) {
  const url = parseURLLikeSpecifier(key, mapBaseURL);
  return url ? url.href : key;
}

function sortedEntries(specifierMap, mapBaseURL) {
  return Object.entries(specifierMap ?? {})
    .map(([k, v]) => [normalizeKey(k, mapBaseURL), v])
    .sort(([a], [b]) => b.length - a.length || (a < b ? 1 : -1));
}

function resolveInSpecifierMap(normalized, specifierMap, mapBaseURL) {
  for (const [key, target] of sortedEntries(specifierMap, mapBaseURL)) {
    if (target == null) continue;
    if (key === normalized) {
      return new URL(target, mapBaseURL).href;
    }
    if (key.endsWith('/') && normalized.startsWith(key)) {
      if (!String(target).endsWith('/')) {
        throw new TypeError(`Import map prefix "${key}" must map to a URL ending in "/"`);
      }
      const rest = normalized.slice(key.length);
      return new URL(rest, new URL(target, mapBaseURL)).href;
    }
  }
  return null;
}

/**
 * Resolve a specifier against an import map.
 * @param {{imports?: Record<string,string>, scopes?: Record<string, Record<string,string>>}} map
 * @param {string} specifier
 * @param {{ referrer?: string, mapBaseURL?: string }} [options]
 * @returns {string|null} resolved URL, or null if a bare specifier is unmapped
 */
export function resolveImportMap(map, specifier, { referrer, mapBaseURL = referrer } = {}) {
  const asURL = parseURLLikeSpecifier(specifier, referrer);
  const normalized = asURL ? asURL.href : specifier;
  if (referrer && map.scopes) {
    const scopes = Object.keys(map.scopes)
      .map((k) => [new URL(k, mapBaseURL).href, map.scopes[k]])
      .sort(([a], [b]) => b.length - a.length);
    for (const [scopePrefix, scopeMap] of scopes) {
      if (scopePrefix === referrer || (scopePrefix.endsWith('/') && referrer.startsWith(scopePrefix))) {
        const hit = resolveInSpecifierMap(normalized, scopeMap, mapBaseURL);
        if (hit) return hit;
      }
    }
  }
  const hit = resolveInSpecifierMap(normalized, map.imports, mapBaseURL);
  if (hit) return hit;
  return asURL ? asURL.href : null;
}

/**
 * Merge import maps; later maps win. Scopes merge entry by entry, and
 * `integrity` maps merge too (the same result as mport's `mergeImportMaps`).
 * @param {...{imports?: object, scopes?: object, integrity?: object}} maps
 */
export function mergeImportMaps(...maps) {
  const out = { imports: {}, scopes: {}, integrity: {} };
  for (const m of maps) {
    Object.assign(out.imports, m?.imports);
    for (const [scope, entries] of Object.entries(m?.scopes ?? {})) {
      out.scopes[scope] = { ...out.scopes[scope], ...entries };
    }
    Object.assign(out.integrity, m?.integrity);
  }
  for (const k of ['scopes', 'integrity']) if (!Object.keys(out[k]).length) delete out[k];
  return out;
}

// mport's lockfile fields and key (see mport/src/lock.mjs).
const LOCK_FIELDS = ['specifier', 'registry', 'name', 'range', 'version', 'path', 'entry', 'build', 'provider', 'url', 'integrity'];
const lockKeyOf = (res, specifier, scope) => res.registry && res.name
  ? `${res.registry}:${res.name}@${res.range ?? ''}${res.path ? `/${res.path}` : ''}`
  : scope ? `${scope} ${specifier}` : specifier;

function lockEntry(res, specifier) {
  const rec = {};
  for (const f of LOCK_FIELDS) {
    const v = f === 'specifier' ? specifier : res[f];
    if (v !== undefined && v !== '') rec[f] = v;
  }
  return rec;
}

/**
 * The import-map compiler mport uses (`compileImportMap(resolved, scoped)`):
 * each resolution goes under its `key`; prefix keys ("lit/") map to `base`;
 * `integrity` entries are collected by URL.
 */
export function compileResolutions(resolved, scoped = {}) {
  const map = { imports: {} };
  const integrity = {};
  const put = (target, r) => {
    target[r.key] = r.key.endsWith('/') ? r.base ?? r.url.replace(/[^/]*$/, '') : r.url;
  };
  for (const r of resolved) {
    put(map.imports, r);
    if (r.integrity && !r.key.endsWith('/')) integrity[r.url] = r.integrity;
  }
  const scopes = {};
  for (const [scope, list] of Object.entries(scoped)) {
    scopes[scope] = {};
    for (const r of list) {
      put(scopes[scope], r);
      if (r.integrity) integrity[r.url] = r.integrity;
    }
  }
  if (Object.keys(scopes).length) map.scopes = scopes;
  if (Object.keys(integrity).length) map.integrity = integrity;
  return map;
}

/**
 * Resolve `specifiers` through `router` and emit an import map plus a lockfile.
 *
 * Resolution happens once, ahead of time, so the browser only sees a plain
 * import map. Any Router works: an mport router wrapped with `fromMport()`,
 * a chain that puts static aliases in front of it, or a function.
 *
 * - Import-map keys: a resolution's `key` when it has one (mport drops the
 *   version: `react@^19` → `react`), else the specifier as written.
 * - The lockfile uses mport's format, `{ lockfileVersion: 1, packages }`, so
 *   `createRouter(routes, { lock })` can pin from it. Package entries use
 *   mport's keys (`npm:react@^19`); entries from other routers are keyed by
 *   the specifier (`"<scope> <specifier>"` inside scopes).
 *
 * @param {import('./routers/interface.js').Router | Function} router
 * @param {string[]} specifiers top-level specifiers (a trailing "/" makes a prefix entry)
 * @param {object} [options]
 * @param {Record<string, string[] | Record<string, string>>} [options.scopes]
 *   scope URL → specifiers, or (mport's form) → { key: specifier }
 * @param {AbortSignal} [options.signal]
 * @param {(resolved: object[], scoped: Record<string, object[]>) => object} [options.compile]
 *   the compiler; pass mport's `compileImportMap` to use mport's own
 * @returns {Promise<{ importMap: {imports: Record<string,string>, scopes?: object, integrity?: object}, lock: { lockfileVersion: 1, packages: Record<string, object> } }>}
 */
export async function compileImportMap(router, specifiers, { scopes = {}, signal, compile = compileResolutions } = {}) {
  router = toRouter(router);
  const packages = {};
  const resolveAll = async (entries, scope) => {
    const out = [];
    for (const [explicitKey, specifier] of entries) {
      const res = await router.resolve(specifier, { referrer: scope, signal });
      if (!res?.url) throw new Error(`Router could not resolve "${specifier}"`);
      const key = explicitKey ?? res.key ?? specifier;
      if (key.endsWith('/') && !(res.base ?? res.url).endsWith('/')) {
        throw new TypeError(`Prefix specifier "${specifier}" resolved to "${res.url}", which does not end in "/"`);
      }
      out.push({ ...res, key });
      packages[lockKeyOf(res, specifier, scope)] = lockEntry(res, specifier);
    }
    return out;
  };
  const resolved = await resolveAll(specifiers.map((s) => [undefined, s]));
  const scoped = {};
  for (const [scope, list] of Object.entries(scopes)) {
    scoped[scope] = await resolveAll(Array.isArray(list) ? list.map((s) => [undefined, s]) : Object.entries(list), scope);
  }
  const importMap = compile(resolved, scoped);
  const sorted = Object.fromEntries(Object.entries(packages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { importMap, lock: { lockfileVersion: 1, packages: sorted } };
}

/**
 * Serialize an import map to a `<script type="importmap">` tag.
 * @param {object} importMap
 */
export function importMapScript(importMap) {
  const json = JSON.stringify(importMap, null, 2).replace(/</g, '\\u003c');
  return `<script type="importmap">\n${json}\n</script>`;
}
