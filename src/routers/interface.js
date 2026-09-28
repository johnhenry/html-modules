/**
 * The Router interface: the seam between the module graph and CDN routing.
 *
 * web-module-graph does NOT implement CDN selection/fallback/racing itself.
 * It asks a Router where a specifier lives. The primary implementation is
 * `mportRouter()` (backed by the `mport` CDN router); `basicRouter()` and
 * `importMapRouter()` exist for static/offline use and tests.
 *
 * @typedef {object} Resolution
 * @property {string} url             Absolute URL of the module.
 * @property {string} [provider]      Which origin/CDN served it (e.g. "cdn.jsdelivr.net").
 * @property {'js'|'html'} [type]     Module format, if the router knows it.
 * @property {string} [version]       Resolved version, if known.
 * @property {string} [integrity]     SRI hash, if known.
 * @property {object} [module]        Already-evaluated JS namespace (routers that import while resolving, like mport).
 *
 * @typedef {object} ResolveContext
 * @property {string} [referrer]      URL of the importing module/document.
 * @property {AbortSignal} [signal]
 *
 * @typedef {object} Router
 * @property {(specifier: string, context?: ResolveContext) => (Resolution|null|Promise<Resolution|null>)} resolve
 *   Return `null` to mean "not handled by this router".
 * @property {string} [name]
 */

/** @param {unknown} value */
export function isRouter(value) {
  return value != null && typeof /** @type {any} */ (value).resolve === 'function';
}

/**
 * Coerce a router-ish value into a Router.
 * Accepts a Router, a `(specifier, ctx) => Resolution|string|null` function,
 * or a plain URL string returned from such a function.
 * @param {Router | ((specifier: string, context?: ResolveContext) => any)} value
 * @returns {Router}
 */
export function toRouter(value) {
  if (isRouter(value)) return /** @type {Router} */ (value);
  if (typeof value === 'function') {
    return {
      name: value.name || 'function',
      async resolve(specifier, context) {
        const out = await value(specifier, context);
        if (out == null) return null;
        return typeof out === 'string' ? { url: out } : out;
      },
    };
  }
  throw new TypeError('Expected a Router ({ resolve() }) or a resolve function');
}

/**
 * Compose routers: the first non-null resolution wins.
 * @param {...(Router|Function)} routers
 * @returns {Router}
 */
export function chainRouters(...routers) {
  const list = routers.map(toRouter);
  return {
    name: `chain(${list.map((r) => r.name ?? '?').join(',')})`,
    async resolve(specifier, context) {
      for (const router of list) {
        const res = await router.resolve(specifier, context);
        if (res) return res;
      }
      return null;
    },
  };
}
