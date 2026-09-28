/**
 * basicRouter: static aliases for things that are not packages.
 *
 * It maps specifier patterns to URLs or to functions that return one. Use it
 * for HTML-module aliases (`@lib` → `/components/all.html`), private paths and
 * app-specific schemes (`partial:card`), where the target can depend on the
 * importing module (`referrer`).
 *
 * It is not a package or CDN router. Versions, registries (`npm:`, `jsr:`,
 * `github:`), mirrors, probing, fallback and lockfiles belong to mport v2:
 * wrap an mport router with `fromMport()` and chain it after this one.
 */

/**
 * @typedef {string | ((specifier: string, context: object) => (string|null|Promise<string|null>))} Target
 *   A string is a base URL (the specifier is appended); a function returns a URL.
 */

function patternMatch(pattern, specifier) {
  if (pattern === '*') return { rest: specifier };
  if (pattern.endsWith(':')) return specifier.startsWith(pattern) ? { rest: specifier.slice(pattern.length) } : null;
  if (pattern.endsWith('*')) return specifier.startsWith(pattern.slice(0, -1)) ? { rest: specifier } : null;
  return pattern === specifier ? { rest: specifier } : null;
}

const MIGRATE = 'basicRouter no longer probes or falls back between candidates. Use mport v2 for mirrors: ' +
  'fromMport(createRouter({ "*": fallback(custom(a), custom(b)) }, { probe })).';

function normalizeRoutes(routes) {
  const list = Array.isArray(routes)
    ? routes.map(({ match, use }) => [match, use])
    : Object.entries(routes ?? {}).sort(([a], [b]) => (a === '*') - (b === '*') || b.length - a.length);
  return list.map(([pattern, use]) => {
    if (Array.isArray(use)) {
      if (use.length !== 1) throw new TypeError(`${MIGRATE} (route "${pattern}" lists ${use.length} targets)`);
      [use] = use;
    }
    return [pattern, use];
  });
}

async function targetURL(target, rest, context) {
  if (typeof target === 'function') return target(rest, context);
  return new URL(rest, target.endsWith('/') ? target : target + '/').href;
}

const isBare = (s) => !(s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || /^[a-z][a-z0-9+.-]*:\/\//i.test(s));

function safeHost(url) {
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {object} options
 * @param {Record<string, Target> | Array<{match: string, use: Target}>} options.routes
 *   Object form: exact keys beat globs, longer globs beat shorter ones, `'*'` is last.
 *   Array form: the first match wins. Patterns: `'*'`, `'@x/*'`, `'x*'`, `'scheme:'`, or an exact name.
 * @returns {import('./interface.js').Router}
 */
export function basicRouter({ routes, probe } = {}) {
  if (probe) throw new TypeError(MIGRATE);
  const table = normalizeRoutes(routes);
  return {
    name: 'basic',
    async resolve(specifier, context = {}) {
      if (!isBare(specifier)) return null;
      for (const [pattern, target] of table) {
        const m = patternMatch(pattern, specifier);
        if (!m) continue;
        const url = await targetURL(target, m.rest, context);
        if (url) return { url, provider: safeHost(url), route: pattern };
      }
      return null;
    },
  };
}
