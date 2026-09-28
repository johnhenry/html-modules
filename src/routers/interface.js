/**
 * The Router interface: the seam between the module graph and routing.
 *
 * web-module-graph asks a Router where a specifier lives. Package and CDN
 * routing (versions, registries, mirrors, strategies, health, lockfiles) is
 * mport v2's job: wrap an mport router with `fromMport()`. `basicRouter()`
 * (static aliases), `importMapRouter()` and plain functions cover the rest.
 *
 * @typedef {object} Resolution
 * @property {string} url             Absolute URL of the module.
 * @property {string} [provider]      Which provider or origin served it (e.g. "esm.sh").
 * @property {'js'|'html'} [type]     Module format, if the router knows it.
 * @property {string} [version]       Resolved version, if known.
 * @property {string} [integrity]     SRI hash, if known.
 * @property {object} [module]        Already-evaluated JS namespace (mport with `probe: "import"`).
 * @property {string} [build]         mport: the artifact build ("esm.sh", "npm", …).
 * @property {object[]} [trace]       mport: every lookup, probe, skip and failure.
 *
 * @typedef {object} ResolveContext
 * @property {string} [referrer]      URL of the importing module/document.
 * @property {AbortSignal} [signal]
 * @property {(event: object) => void} [onEvent]  routers that trace (mport) report here.
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
