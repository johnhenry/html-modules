/**
 * Import maps: the native, compiled representation of routing decisions.
 *
 * - resolveImportMap(): resolve a specifier against an import map the way a
 *   browser does (exact + trailing-slash prefix matches, scopes).
 * - compileImportMap(): ask a router to resolve a list of specifiers ahead of
 *   time and emit a standard import map (plus lock entries).
 */

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
 * Merge import maps; later maps win.
 * @param {...{imports?: object, scopes?: object}} maps
 */
export function mergeImportMaps(...maps) {
  const out = { imports: {}, scopes: {} };
  for (const m of maps) {
    Object.assign(out.imports, m?.imports);
    for (const [scope, entries] of Object.entries(m?.scopes ?? {})) {
      out.scopes[scope] = { ...out.scopes[scope], ...entries };
    }
  }
  if (!Object.keys(out.scopes).length) delete out.scopes;
  return out;
}

/**
 * Resolve `specifiers` through `router` and emit an import map + lock data.
 *
 * Resolution happens once, ahead of time ("resolution-time fallback"), so the
 * browser only ever sees a plain import map.
 *
 * @param {import('./routers/interface.js').Router} router
 * @param {string[]} specifiers top-level specifiers (a trailing "/" makes a prefix entry)
 * @param {{ scopes?: Record<string, string[]>, signal?: AbortSignal }} [options]
 * @returns {Promise<{ importMap: {imports: Record<string,string>, scopes?: object}, lock: Record<string, object> }>}
 */
export async function compileImportMap(router, specifiers, { scopes = {}, signal } = {}) {
  const lock = {};
  const resolveAll = async (list, referrer) => {
    const imports = {};
    for (const specifier of list) {
      const res = await router.resolve(specifier, { referrer, signal });
      if (!res?.url) throw new Error(`Router could not resolve "${specifier}"`);
      if (specifier.endsWith('/') && !res.url.endsWith('/')) {
        throw new TypeError(`Prefix specifier "${specifier}" resolved to "${res.url}", which does not end in "/"`);
      }
      imports[specifier] = res.url;
      const { module: _module, ...rest } = res;
      lock[referrer ? `${referrer} ${specifier}` : specifier] = { specifier, ...rest };
    }
    return imports;
  };
  const importMap = { imports: await resolveAll(specifiers) };
  const scopeEntries = Object.entries(scopes);
  if (scopeEntries.length) {
    importMap.scopes = {};
    for (const [scope, list] of scopeEntries) importMap.scopes[scope] = await resolveAll(list, scope);
  }
  return { importMap, lock };
}

/**
 * Serialize an import map to a `<script type="importmap">` tag.
 * @param {object} importMap
 */
export function importMapScript(importMap) {
  const json = JSON.stringify(importMap, null, 2).replace(/</g, '\\u003c');
  return `<script type="importmap">\n${json}\n</script>`;
}
