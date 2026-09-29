/**
 * mport v2 as a html-modules Router.
 *
 * mport (https://github.com/johnhenry/mport) owns package and CDN resolution:
 * specifier parsing (`react@^19`, `npm:`, `jsr:`, `github:`), registry lookups,
 * providers (esm.sh, jsDelivr, unpkg, jspm, jsr, github, local, custom),
 * strategies (fallback, race, adaptive, prefer, verified, cache), probing,
 * provider health, lockfiles and import-map compilation.
 *
 * This module does not import mport. You create the router with mport's
 * `createRouter()` and hand it to `fromMport()`, so the core of
 * html-modules stays dependency-free and mport stays an optional peer.
 *
 *   import { createRouter, race, esmSh, jsDelivr } from 'mport';
 *   const loader = createLoader({
 *     router: fromMport(createRouter({ '*': race(esmSh(), jsDelivr({ esm: true })) })),
 *   });
 */
import { toRouter } from './interface.js';

// mport routes bare names and its own registry prefixes. Other schemes
// ("partial:", "node:", "app:") are left to other routers.
const MPORT_SCHEMES = /^(npm|jsr|github|gh):/;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The default `match` for `fromMport`: bare specifiers and `npm:`, `jsr:`,
 * `github:`/`gh:` specifiers. Relative paths, URLs and other schemes are not
 * packages, so they are left to other routers (mport would read "partial:card"
 * as an npm package called "partial:card").
 * @param {string} specifier
 */
export function isPackageSpecifier(specifier) {
  if (typeof specifier !== 'string' || !specifier) return false;
  if (/^(\.{0,2}\/)/.test(specifier)) return false;
  if (SCHEME.test(specifier)) return MPORT_SCHEMES.test(specifier);
  return true;
}

// mport forwards `signal` to its HEAD probes and races, but not to registry
// lookups or to `probe: "import"`. Settle as soon as the signal aborts.
function abortable(signal, promise) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** True for a router made by mport v2's `createRouter()`. */
export function isMportRouter(value) {
  return value != null && typeof value.resolve === 'function' && typeof value.build === 'function' &&
    typeof value.import === 'function' && value.health != null;
}

/**
 * Wrap an mport v2 router as a html-modules Router.
 *
 * The resolution is mport's, unchanged (`url`, `provider`, `version`,
 * `integrity`, `module`, `build`, `registry`, `name`, `range`, `path`, `key`,
 * `base`, `cached`, `trace`), plus `type: "js"` when mport already evaluated
 * the module (`probe: "import"`), so the loader reuses it.
 *
 * @param {import('mport').Router} router  from mport's `createRouter()`
 * @param {object} [options]
 * @param {(specifier: string) => boolean} [options.match]  which specifiers to send to mport (default: `isPackageSpecifier`)
 * @param {'js'|'html'} [options.type]  force the module format of every resolution
 * @param {import('mport').ResolveOptions} [options.resolveOptions]  passed to every `router.resolve()` (`target`, `capabilities`, `build`, `relock`, …)
 * @param {(event: object) => void} [options.onEvent]  mport trace events, as they happen
 * @param {string} [options.name]
 * @returns {import('./interface.js').Router & { mport: import('mport').Router }}
 */
export function fromMport(router, { match = isPackageSpecifier, type, resolveOptions = {}, onEvent, name } = {}) {
  if (!isMportRouter(router)) {
    throw new TypeError('fromMport() expects a router from mport v2 createRouter()');
  }
  return {
    name: name ?? router.name ?? 'mport',
    mport: router,
    async resolve(specifier, context = {}) {
      if (!match(specifier)) return null;
      if (context.signal?.aborted) throw context.signal.reason;
      const listener = context.onEvent ?? resolveOptions.onEvent ?? onEvent;
      const res = await abortable(context.signal, router.resolve(specifier, {
        ...resolveOptions,
        // mport types `exclude` as Iterable<string> but calls `.has()` on it.
        ...(resolveOptions.exclude && { exclude: new Set(resolveOptions.exclude) }),
        ...(context.signal && { signal: context.signal }),
        ...(listener && { onEvent: listener }),
      }));
      if (!res) return null;
      const kind = type ?? (res.module ? 'js' : undefined);
      return kind ? { ...res, type: kind } : res;
    },
  };
}

/**
 * Deprecated convenience: build an mport v2 router and wrap it.
 *
 *   mportRouter({ routes, ...createRouterOptions, match, type })
 *
 * Prefer `fromMport(createRouter(routes, options))`: you import mport
 * yourself and choose the providers and strategies explicitly. Without
 * `routes` this uses `{ "*": [esmSh(), jsDelivr(), unpkg()] }` with
 * `probe: "import"` (the evaluated module is reused by the loader).
 *
 * The 1.x form `mportRouter({ MPortURL, mport: { cdns } })` still works: it
 * calls mport's v1 `MPortURL` (which mport 2 implements as a router).
 *
 * @deprecated Use `fromMport(createRouter(...))`.
 * @param {object} [options]
 * @param {object} [options.routes]           mport routes
 * @param {object} [options.module]           the mport module namespace (default: `import('mport')`)
 * @param {Function} [options.MPortURL]       deprecated: mport's v1 `MPortURL`
 * @param {object} [options.mport]            deprecated: options for `MPortURL` ({ cdns, useCache, cacheKey })
 * @param {object} [options.importOptions]    deprecated: second argument for the v1 import
 * @param {(specifier: string) => boolean} [options.match]
 * @param {'js'|'html'} [options.type]
 * @returns {import('./interface.js').Router}
 */
export function mportRouter({ routes, module, MPortURL, mport: v1Options, importOptions, match = isPackageSpecifier, type, ...options } = {}) {
  if (MPortURL || v1Options) return v1Router({ MPortURL, v1Options, importOptions, match, module });
  let wrapped;
  const get = async () => {
    if (!wrapped) {
      const m = module ?? (await import('mport'));
      const router = m.createRouter(routes ?? { '*': [m.esmSh(), m.jsDelivr(), m.unpkg()] }, { probe: 'import', ...options });
      wrapped = fromMport(router, { match, type });
    }
    return wrapped;
  };
  return {
    name: 'mport',
    async resolve(specifier, context) {
      if (!match(specifier)) return null;
      return (await get()).resolve(specifier, context);
    },
  };
}

// The 1.x adapter, kept for compatibility. mport 2's MPortURL parses scoped
// string specifiers itself and returns [module, url, info].
function v1Router({ MPortURL, v1Options, importOptions, match, module }) {
  let importer;
  return {
    name: 'mport',
    async resolve(specifier) {
      if (!match(specifier) || /^(jsr|github|gh):/.test(specifier)) return null;
      importer ??= (MPortURL ?? (module ?? (await import('mport'))).MPortURL)(v1Options ?? {});
      let module_, url, info;
      try {
        [module_, url, info] = await importer(specifier.replace(/^npm:/, ''), importOptions);
      } catch (cause) {
        throw new Error(`mport could not load "${specifier}" from any CDN`, { cause });
      }
      let provider;
      try {
        provider = new URL(url).host;
      } catch {}
      return { url, provider, type: 'js', module: module_, ...(info?.version && { version: info.version }), ...(info?.trace && { trace: info.trace }) };
    },
  };
}

export { toRouter };
